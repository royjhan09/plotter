/** Microphone capture for dictation and voice mode: records, measures level, notices silence, and
 *  returns 16 kHz mono samples for Whisper. */

export interface Recording {
  /** Stop and get 16 kHz mono samples. */
  stop: () => Promise<Float32Array>
  /** Stop and throw the audio away. */
  cancel: () => void
  /** Current input level, 0..1, for the waveform. */
  level: () => number
}

export interface RecordOptions {
  /** Called once, after speech was heard and then `silenceMs` of quiet. */
  onSilence?: () => void
  silenceMs?: number
}

const SPEECH_RMS = 0.025

export async function startRecording(opts: RecordOptions = {}): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
  })
  const ctx = new AudioContext()
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  source.connect(analyser)
  const buf = new Float32Array(analyser.fftSize)

  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  recorder.start(250)

  let current = 0
  let heard = false
  let quietSince = 0
  let silenceFired = false
  let frame = 0
  const tick = (): void => {
    analyser.getFloatTimeDomainData(buf)
    let sum = 0
    for (const v of buf) sum += v * v
    const rms = Math.sqrt(sum / buf.length)
    current = Math.min(1, rms * 8)
    const now = performance.now()
    if (rms > SPEECH_RMS) {
      heard = true
      quietSince = 0
    } else if (heard) {
      if (!quietSince) quietSince = now
      if (!silenceFired && opts.onSilence && now - quietSince > (opts.silenceMs ?? 1300)) {
        silenceFired = true
        opts.onSilence()
      }
    }
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)

  const release = (): void => {
    cancelAnimationFrame(frame)
    stream.getTracks().forEach((t) => t.stop())
    void ctx.close()
  }

  return {
    level: () => current,
    cancel: () => {
      if (recorder.state !== 'inactive') recorder.stop()
      release()
    },
    stop: () =>
      new Promise<Float32Array>((resolve, reject) => {
        recorder.onstop = async () => {
          release()
          try {
            if (!heard) return resolve(new Float32Array(0))
            resolve(await to16kMono(new Blob(chunks, { type: recorder.mimeType })))
          } catch (e) {
            reject(e)
          }
        }
        if (recorder.state !== 'inactive') recorder.stop()
        else recorder.onstop?.(new Event('stop'))
      })
  }
}

async function to16kMono(blob: Blob): Promise<Float32Array> {
  const decodeCtx = new AudioContext()
  const decoded = await decodeCtx.decodeAudioData(await blob.arrayBuffer())
  void decodeCtx.close()
  const length = Math.max(1, Math.ceil(decoded.duration * 16000))
  const offline = new OfflineAudioContext(1, length, 16000)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0).slice()
}

// ---------------------------------------------------------------- speaking

/** Markdown → something pleasant to hear. */
export function speakable(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' (code block) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*\|?[-:| ]+\|?\s*$/gm, '')
    .replace(/\|/g, ', ')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_~>]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
}

function pickVoice(text: string): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices()
  const korean = /[가-힣]/.test(text)
  const want = korean ? 'ko' : 'en'
  return voices.find((v) => v.lang.toLowerCase().startsWith(want) && /natural|online/i.test(v.name)) ?? voices.find((v) => v.lang.toLowerCase().startsWith(want))
}

/** Speaks text with the system's voices (Windows has Korean and English voices). Resolves when done. */
export function speak(text: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (!text) return resolve()
    speechSynthesis.cancel()
    // Long text is split into sentences: Chromium cuts off very long utterances.
    const parts = text.match(/[^.!?。！？\n]+[.!?。！？]*/g) ?? [text]
    let i = 0
    const next = (): void => {
      if (signal.aborted || i >= parts.length) return resolve()
      const u = new SpeechSynthesisUtterance(parts[i++]!.trim())
      const v = pickVoice(text)
      if (v) {
        u.voice = v
        u.lang = v.lang
      }
      u.rate = 1.05
      u.onend = next
      u.onerror = next
      speechSynthesis.speak(u)
    }
    signal.addEventListener('abort', () => {
      speechSynthesis.cancel()
      resolve()
    })
    if (speechSynthesis.getVoices().length) next()
    else speechSynthesis.addEventListener('voiceschanged', next, { once: true })
  })
}
