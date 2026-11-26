import { createContext, useContext, useEffect, useState } from 'react'
import type { CanvasDoc } from '../../shared/api'
import { Markdown } from './Markdown'

/**
 * Canvas: a document or program beside the chat that you can edit. The model writes it in a ```canvas block
 * (first line = title); Plotter opens it here. While it is open, its current text goes with each message, so
 * "make the second paragraph shorter" edits the canvas, and the model answers with the updated document.
 */

export const CanvasContext = createContext<{ open: (doc: CanvasDoc) => void; current: CanvasDoc | null }>({ open: () => undefined, current: null })
export const useCanvas = (): { open: (doc: CanvasDoc) => void; current: CanvasDoc | null } => useContext(CanvasContext)

/** ```canvas / ```canvas:python block → { title, text, lang }. The first line is the title. */
export function parseCanvas(lang: string, src: string): CanvasDoc {
  const text = src.replace(/^\n+/, '')
  const first = text.split('\n')[0] ?? ''
  if (!lang) {
    // a document: its first line ("# Title") is the title and stays in the text
    const title = first.replace(/^#{1,6}\s*/, '').trim()
    return { title: title && title.length <= 100 ? title : 'Untitled', text, lang }
  }
  // code: a first-line comment ("# title", "// title", "-- title") is the title and is not part of the code
  const m = /^\s*(?:#|\/\/|--)\s*(.+)$/.exec(first)
  return m ? { title: m[1]!.trim(), text: text.split('\n').slice(1).join('\n').replace(/^\n+/, ''), lang } : { title: 'Untitled', text, lang }
}

/** The card shown in the reply where the canvas block was. */
export function CanvasCard({ doc, auto }: { doc: CanvasDoc; auto: boolean }): React.JSX.Element {
  const { open, current } = useCanvas()
  useEffect(() => {
    if (auto) open(doc)
    // only when a newly written block finishes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const isOpen = current?.title === doc.title && current.text === doc.text
  return (
    <div className="canvas-card">
      <span className="canvas-card-icon">{doc.lang ? '⌨' : '📄'}</span>
      <span className="canvas-card-text">
        <span className="canvas-card-title">{doc.title}</span>
        <span className="canvas-card-meta">{doc.lang ? `${doc.lang} · ${doc.text.split('\n').length} lines` : `Document · ${doc.text.length.toLocaleString()} characters`}</span>
      </span>
      <button className="btn ghost small" onClick={() => open(doc)} disabled={isOpen}>
        {isOpen ? 'Open' : 'Open in canvas'}
      </button>
    </div>
  )
}

export function CanvasPanel({ doc, onChange, onClose }: { doc: CanvasDoc; onChange: (d: CanvasDoc) => void; onClose: () => void }): React.JSX.Element {
  const [mode, setMode] = useState<'edit' | 'preview'>(doc.lang ? 'edit' : 'preview')
  const [copied, setCopied] = useState(false)
  useEffect(() => setMode(doc.lang ? 'edit' : 'preview'), [doc.title, doc.lang])
  const download = (): void => {
    const ext = doc.lang ? ({ python: 'py', javascript: 'js', typescript: 'ts', html: 'html', css: 'css', sql: 'sql', java: 'java' } as Record<string, string>)[doc.lang] ?? 'txt' : 'md'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([doc.text], { type: 'text/plain;charset=utf-8' }))
    a.download = `${doc.title.replace(/[\\/:*?"<>|]/g, '_')}.${ext}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  return (
    <aside className="canvas-panel">
      <header className="canvas-head">
        <span className="canvas-title" title={doc.title}>
          {doc.title}
        </span>
        {!doc.lang && (
          <div className="seg">
            <button className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}>
              Preview
            </button>
            <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>
              Edit
            </button>
          </div>
        )}
        <button
          className="canvas-btn"
          title="Copy"
          onClick={() => {
            void navigator.clipboard.writeText(doc.text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button className="canvas-btn" title="Save as a file" onClick={download}>
          Save
        </button>
        <button className="canvas-btn close" title="Close canvas" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="canvas-body">
        {mode === 'edit' ? (
          <textarea className={`canvas-editor ${doc.lang ? 'code' : ''}`} value={doc.text} spellCheck={!doc.lang} onChange={(e) => onChange({ ...doc, text: e.target.value })} />
        ) : (
          <div className="canvas-preview" onDoubleClick={() => setMode('edit')}>
            <Markdown text={doc.text} />
          </div>
        )}
      </div>
      <footer className="canvas-foot">Edits here are sent with your next message. Ask Plotter to revise it in the chat.</footer>
    </aside>
  )
}
