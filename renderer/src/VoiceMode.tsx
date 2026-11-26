import { useEffect, useRef, useState } from 'react'
import { speak, speakable, startRecording, type Recording } from './audio'
import { speechStatusText, useSpeechStatus } from './Composer'
import icon from '../../assets/icon.png'

const api = window.plotter

type Phase = 'starting' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error'

const LABEL: Record<Phase, string> = {
  starting: 'Starting…',
  listening: 'Listening…',
  transcribing: 'Got it…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  error: 'Something went wrong'
}

/**
 * Voice mode: listen until you pause → speech to text (on this computer) → send to the chat →
 * read the reply aloud → listen again. Everything also lands in the open chat as normal messages.
 */
export function VoiceMode({ ask, onClose }: { ask: (text: string) => Promise<string>; onClose: () => void }): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('starting')
  const [heard, setHeard] = useState('')
  const [error, setError] = useState('')
  const [level, setLevel] = useState(0)
  const rec = useRef<Recording | null>(null)
  const skipRef = useRef<AbortController | null>(null)
  const speech = useSpeechStatus()

  useEffect(() => {
    const abort = new AbortController()
    let frame = 0
    const meter = (): void => {
      setLevel(rec.current?.level() ?? 0)
      frame = requestAnimationFrame(meter)
    }
    frame = requestAnimationFrame(meter)

    const listenOnce = (): Promise<Float32Array> =>
      new Promise((resolve, reject) => {
        startRecording({
          silenceMs: 1200,
          onSilence: () => {
            const r = rec.current
            rec.current = null
            if (r) r.stop().then(resolve, reject)
          }
        }).then((r) => {
          if (abort.signal.aborted) {
            r.cancel()
            return reject(new Error('closed'))
          }
          rec.current = r
          abort.signal.addEventListener('abort', () => {
            r.cancel()
            reject(new Error('closed'))
          })
        }, reject)
      })

    void api.speech.warm()
    void (async () => {
      while (!abort.signal.aborted) {
        try {
          setPhase('listening')
          const samples = await listenOnce()
          if (abort.signal.aborted) break
          setPhase('transcribing')
          const text = await api.speech.transcribe(samples)
          if (abort.signal.aborted) break
          if (!text) continue
          setHeard(text)
          setPhase('thinking')
          const reply = await ask(text)
          if (abort.signal.aborted) break
          setPhase('speaking')
          const skip = new AbortController()
          skipRef.current = skip
          abort.signal.addEventListener('abort', () => skip.abort())
          await speak(speakable(reply), skip.signal)
        } catch (e) {
          if (abort.signal.aborted) break
          const msg = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)
          setError(
            /Permission|NotAllowed|NotFound/i.test(msg)
              ? 'Plotter could not use the microphone. Check Windows Settings › Privacy & security › Microphone.'
              : msg
          )
          setPhase('error')
          break
        }
      }
    })()

    return () => {
      cancelAnimationFrame(frame)
      abort.abort()
      rec.current?.cancel()
      speechSynthesis.cancel()
    }
  }, [ask])

  const label = phase === 'transcribing' ? (speechStatusText(speech) ?? LABEL.transcribing) : LABEL[phase]
  const scale = phase === 'listening' ? 1 + level * 0.35 : 1

  return (
    <div className="voice-back">
      <div className={`voice-orb ${phase}`} style={{ transform: `scale(${scale})` }}>
        <img src={icon} alt="" />
      </div>
      <div className="voice-label">{label}</div>
      {heard && phase !== 'error' && <div className="voice-heard">“{heard}”</div>}
      {error && <div className="voice-error">{error}</div>}
      <div className="voice-actions">
        {phase === 'speaking' && (
          <button className="voice-btn" onClick={() => skipRef.current?.abort()}>
            Skip
          </button>
        )}
        <button className="voice-btn end" onClick={onClose}>
          End
        </button>
      </div>
    </div>
  )
}
