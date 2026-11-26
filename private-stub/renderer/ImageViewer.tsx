import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Public stand-in for the picture viewer and drawing tools, which live in Plotter's private folder:
 * a plain full-size view (click or Esc closes), no zoom animation and no drawing.
 */
export const DRAWING = false

export type RectSource = () => DOMRect | null

export function PictureViewer({ src, onClose }: { src: string; from: RectSource; onEdit?: () => void; onClose: () => void }): React.JSX.Element {
  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return createPortal(
    <div className="picture-view open" onClick={onClose}>
      <img src={src} alt="" style={{ maxWidth: '92vw', maxHeight: '88vh', margin: 'auto' }} />
    </div>,
    document.body
  )
}

export function SketchEditor(_p: { src: string; onSave: (src: string) => void; onClose: () => void }): React.JSX.Element | null {
  return null
}
