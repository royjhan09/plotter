import type { Attachment } from '../../shared/api'

/** Turning picked, pasted or dropped files into attachments the model can read. */

const MAX_IMAGE_SIDE = 2048
const MAX_PDF_BYTES = 20 * 1024 * 1024
const MAX_TEXT_BYTES = 512 * 1024
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|html?|css|js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|sh|ps1|bat|sql|ya?ml|toml|ini|log|env\.example)$/i

export const ACCEPT = 'image/*,.pdf,.txt,.md,.csv,.tsv,.json,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.rs,.sql,.yaml,.yml,.toml,.log'

const id = (): string => crypto.randomUUID().replace(/-/g, '')

function readAs(file: Blob, as: 'dataURL' | 'text'): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    if (as === 'dataURL') r.readAsDataURL(file)
    else r.readAsText(file)
  })
}

async function shrinkImage(file: File): Promise<{ data: string; mime: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size < 4 * 1024 * 1024 && /^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    bitmap.close()
    return { data: await readAs(file, 'dataURL'), mime: file.type }
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return { data: canvas.toDataURL('image/jpeg', 0.9), mime: 'image/jpeg' }
}

export async function toAttachment(file: File): Promise<Attachment> {
  const name = file.name || 'pasted image.png'
  if (file.type.startsWith('image/')) {
    const { data, mime } = await shrinkImage(file)
    return { id: id(), kind: 'image', name, mime, size: file.size, data }
  }
  if (file.type === 'application/pdf' || /\.pdf$/i.test(name)) {
    if (file.size > MAX_PDF_BYTES) throw new Error(`${name} is larger than 20 MB.`)
    return { id: id(), kind: 'pdf', name, mime: 'application/pdf', size: file.size, data: await readAs(file, 'dataURL') }
  }
  if (file.type.startsWith('text/') || TEXT_EXT.test(name) || file.type === 'application/json') {
    if (file.size > MAX_TEXT_BYTES) throw new Error(`${name} is larger than 512 KB.`)
    return { id: id(), kind: 'text', name, mime: file.type || 'text/plain', size: file.size, data: await readAs(file, 'text') }
  }
  throw new Error(`Plotter can’t read ${name} yet. Try a photo, a PDF, or a text or code file.`)
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
