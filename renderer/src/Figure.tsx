import { useState } from 'react'

/** A picture as a PNG data: URL (an SVG is drawn onto a canvas at twice its size first). */
async function asPng(src: string): Promise<string> {
  if (!src.startsWith('data:image/svg')) return src
  const img = new Image()
  img.src = src
  await img.decode()
  // the drawing's own size (its viewBox), not the browser's default size for an SVG
  let w = img.naturalWidth || 1024
  let h = img.naturalHeight || 1024
  try {
    const text = atob(src.slice(src.indexOf(',') + 1))
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text)
    if (vb) {
      w = Number(vb[1])
      h = Number(vb[2])
    }
  } catch {
    // keep the image's size
  }
  const scale = Math.max(1, Math.min(4, 2048 / Math.max(w, h)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

/** A picture in a reply (drawn, made by the image model, or from a tool), with a Save PNG button. */
export function Figure({ src, name, alt }: { src: string; name: string; alt: string }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      const a = document.createElement('a')
      a.href = await asPng(src)
      a.download = `${name.replace(/[\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'picture'}.png`
      a.click()
    } finally {
      setBusy(false)
    }
  }
  return (
    <figure className="figure">
      <img src={src} alt={alt} />
      <button className="figure-save" title="Save as a PNG file" disabled={busy} onClick={() => void save()}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" />
        </svg>
        Save PNG
      </button>
    </figure>
  )
}
