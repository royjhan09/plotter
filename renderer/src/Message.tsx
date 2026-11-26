import { useRef, useState } from 'react'
import type { ChatMessage } from '../../shared/api'
import { Markdown } from './Markdown'
import { badgeFor, sizeLabel } from './attachments'
import { PictureViewer } from './ImageViewer'
import { PdfBadge } from './PdfPreview'
import { ClaudeBuddy, ClaudeCodeIcon, ClaudeTurn } from './ClaudeCode'
import icon from '../../assets/icon.png'

function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** One message in a chat: the user's bubble, or a reply (Plotter's sprout, or Claude Code's buddy). */
export function Message({
  m,
  typing,
  activity,
  chatId,
  onPdf,
  onClaudeCode
}: {
  m: ChatMessage
  typing: boolean
  activity?: string | null
  /** The chat it is in (a Claude Code reply's Stop button needs it). */
  chatId?: string
  onPdf?: (id: string) => void
  onClaudeCode?: (m: ChatMessage) => void
}): React.JSX.Element {
  if (m.role === 'user')
    return (
      <div className="msg user" data-msg-id={m.id}>
        {m.attachments && m.attachments.length > 0 && (
          <div className="msg-attachments">
            {m.attachments.map((a) =>
              a.kind === 'image' ? (
                <SentPicture key={a.id} src={a.data} name={a.name} />
              ) : (
                <div key={a.id} className="attach file in-msg">
                  <span className="file-badge">{badgeFor(a)}</span>
                  <span className="file-meta">
                    <span className="file-name">{a.name}</span>
                    <span className="file-size">{sizeLabel(a.size)}</span>
                  </span>
                </div>
              )
            )}
          </div>
        )}
        {m.text && <div className="bubble">{m.text}</div>}
      </div>
    )
  if (m.cc)
    return (
      <div className="msg assistant claude" data-msg-id={m.id}>
        <span className="sprout buddy-avatar">
          <ClaudeBuddy size={30} working={m.cc.state === 'running'} />
        </span>
        <div className="body">
          <ClaudeTurn m={m} chatId={chatId ?? ''} />
          {m.error && m.error !== 'Stopped.' && <div className="error">{m.error}</div>}
          {m.cc.state !== 'running' && m.text && (
            <div className="msg-actions">
              <button title="Convert this reply to a PDF" disabled={!onPdf} onClick={() => onPdf?.(m.id)}>
                <PdfBadge size={16} />
                Convert to PDF
              </button>
              <button title="Copy Claude Code's answer" onClick={() => void navigator.clipboard.writeText(m.text)}>
                Copy
              </button>
            </div>
          )}
        </div>
      </div>
    )
  return (
    <div className="msg assistant" data-msg-id={m.id}>
      <img src={icon} alt="" className="sprout" />
      <div className="body">
        {m.thoughtMs !== undefined && m.thoughtMs >= 2000 && m.text && (
          <div className="thought">Thought for {Math.round(m.thoughtMs / 1000)}s</div>
        )}
        {typing && activity && (
          <div className="activity">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m20 20-4.2-4.2" />
            </svg>
            {activity}
          </div>
        )}
        {m.text ? (
          <Markdown text={m.text} streaming={typing} runs={m.toolRuns} />
        ) : typing && !activity ? (
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
        ) : null}
        {m.sources && m.sources.length > 0 && !typing && (
          <div className="sources">
            <span className="sources-label">Sources</span>
            {m.sources.map((s) => (
              <a key={s.url} className="source" href={s.url} target="_blank" rel="noreferrer" title={s.url}>
                <span className="source-badge">{siteName(s.url).slice(0, 1).toUpperCase()}</span>
                <span className="source-text">
                  {/^https?:\/\//.test(s.title) || !s.title.trim() || s.title.replace(/^www\./, '') === siteName(s.url) ? (
                    <span className="source-title">{siteName(s.url)}</span>
                  ) : (
                    <>
                      <span className="source-title">{s.title}</span>
                      <span className="source-site">{siteName(s.url)}</span>
                    </>
                  )}
                </span>
              </a>
            ))}
          </div>
        )}
        {m.error && m.error !== 'Stopped.' && <div className="error">{m.error}</div>}
        {m.error === 'Stopped.' && <div className="stopped">Stopped</div>}
        {!typing && m.text && (
          <div className="msg-actions">
            <button title="Convert this reply to a PDF" disabled={!onPdf} onClick={() => onPdf?.(m.id)}>
              <PdfBadge size={16} />
              Convert to PDF
            </button>
            {onClaudeCode && (
              <button title="Hand this to your own Claude Code to carry out" onClick={() => onClaudeCode(m)}>
                <ClaudeCodeIcon size={16} />
                Send to Claude Code
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


function SentPicture({ src, name }: { src: string; name: string }): React.JSX.Element {
  const thumb = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button ref={thumb} className="msg-image" aria-label={`View ${name}`} title={name} onClick={() => setOpen(true)}>
        <img src={src} alt={name} />
      </button>
      {open && <PictureViewer src={src} from={() => thumb.current?.getBoundingClientRect() ?? null} onClose={() => setOpen(false)} />}
    </>
  )
}
