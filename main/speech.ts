import { app } from 'electron'
import { join } from 'node:path'
import type { SpeechStatus } from '../shared/api'

/**
 * Local speech-to-text for the mic and voice mode. Sign in with ChatGPT does not accept audio input yet
 * (preview limitations), so Plotter runs Whisper on this computer with transformers.js + onnxruntime-node.
 * The model downloads once from Hugging Face into Plotter's data folder; after that it works offline.
 */

export const SPEECH_MODEL = 'onnx-community/whisper-small'

type Transcriber = (audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>

let status: SpeechStatus = { state: 'idle' }
let loading: Promise<Transcriber> | null = null
const listeners = new Set<(s: SpeechStatus) => void>()

function setStatus(s: SpeechStatus): void {
  status = s
  for (const l of listeners) l(s)
}

export const speechStatus = (): SpeechStatus => status
export function onSpeechStatus(l: (s: SpeechStatus) => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

function load(): Promise<Transcriber> {
  if (loading) return loading
  loading = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.cacheDir = join(app.getPath('userData'), 'models')
    env.allowLocalModels = false
    // Download progress per file; report the overall percent of bytes seen so far.
    const files = new Map<string, { loaded: number; total: number }>()
    let lastPercent = -1
    setStatus({ state: 'loading' })
    const asr = await pipeline('automatic-speech-recognition', SPEECH_MODEL, {
      dtype: 'q8',
      device: 'cpu',
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status === 'progress' && p.file && p.total) {
          files.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
          let loaded = 0
          let total = 0
          for (const f of files.values()) {
            loaded += f.loaded
            total += f.total
          }
          const percent = Math.floor((loaded / total) * 100)
          if (percent !== lastPercent) {
            lastPercent = percent
            setStatus({ state: 'downloading', percent })
          }
        } else if (p.status === 'ready') setStatus({ state: 'loading' })
      }
    })
    setStatus({ state: 'ready' })
    return asr as unknown as Transcriber
  })().catch((err: unknown) => {
    loading = null
    setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) })
    throw err
  })
  return loading
}

interface WhisperParts {
  processor: (audio: Float32Array) => Promise<{ input_features: unknown }>
  model: {
    generation_config: { decoder_start_token_id: number; lang_to_id: Record<string, number> }
    generate: (args: Record<string, unknown>) => Promise<{ tolist: () => (number | bigint)[][] } | { sequences: { tolist: () => (number | bigint)[][] } }>
  }
}

/**
 * Which language is being spoken. transformers.js does not detect it (it falls back to English, which
 * makes Whisper *translate* Korean), so: one decoder step after <|startoftranscript|> is the language token.
 */
async function detectLanguage(asr: Transcriber, samples: Float32Array): Promise<string | undefined> {
  const { processor, model } = asr as unknown as WhisperParts
  const gc = model.generation_config
  const { input_features } = await processor(samples.subarray(0, 16000 * 30))
  const out = await model.generate({ inputs: input_features, decoder_input_ids: [gc.decoder_start_token_id], max_new_tokens: 1 })
  const ids = ('sequences' in out ? out.sequences : out).tolist()[0] ?? []
  const last = Number(ids[ids.length - 1])
  const hit = Object.entries(gc.lang_to_id).find(([, id]) => Number(id) === last)
  return hit ? hit[0].slice(2, -2) : undefined
}

/** Start loading (or downloading) the model while the user is still talking. */
export function warmSpeech(): void {
  load().catch(() => undefined)
}

/** 16 kHz mono samples in, text out, in the language spoken (Korean, English, ...). */
export async function transcribe(samples: Float32Array): Promise<string> {
  if (samples.length < 16000 * 0.3) return ''
  const asr = await load()
  const language = await detectLanguage(asr, samples).catch(() => undefined)
  const out = await asr(samples, { task: 'transcribe', ...(language ? { language } : {}), chunk_length_s: 30, stride_length_s: 5 })
  const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text
  return cleanup(text)
}

/** Whisper sometimes "hears" stock phrases in silence; drop those and tidy spaces. */
function cleanup(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (/^\(?\[?(silence|music|blank_audio|음악|박수)\]?\)?\.?$/i.test(t)) return ''
  if (/^(시청해 ?주셔서 감사합니다|thanks? for watching|구독과 좋아요)/i.test(t)) return ''
  return t
}
