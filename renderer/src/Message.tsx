import { useRef, useState } from 'react'
import type { ChatKind, ChatMessage, HandOff, RoleEntity } from '../../shared/api'
import { Markdown } from './Markdown'
import { badgeFor, sizeLabel } from './attachments'
import { PictureViewer } from '@private/renderer/ImageViewer'
import { ClaudeBuddy } from './ClaudeBuddy'
import { SproutBot } from './SproutBot'
import { RoleBot } from '@private/renderer/RoleBot'
import { MenuIcon } from './PlusMenu'
import { ClaudeTurn } from '@private/renderer/ClaudeCode'
import icon from '../../assets/sprout.svg'

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
  onProject,
  projectBusy = false,
  side,
  role
}: {
  m: ChatMessage
  typing: boolean
  activity?: string | null
  /** The chat it is in (a Claude Code reply's Stop button needs it). */
  chatId?: string
  /** "Create project" (on a chat's last reply): sums the chat up into a brief and hands it to Claude Code. */
  onProject?: () => void
  projectBusy?: boolean
  /** In split view: sends this reply to the chat beside (which answers it). */
  side?: SideAction
  /** The role this chat talks as: its own look replaces the plain sprout. */
  role?: RoleEntity
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
        {m.toSide && <div className="to-side-label">To the chat beside</div>}
        {m.modes && (m.modes.image || m.modes.search || (m.modes.tools?.length ?? 0) > 0) && (
          <div className="msg-modes">
            {m.modes.image && (
              <span className="msg-mode">
                <MenuIcon name="image" /> Image generation
              </span>
            )}
            {m.modes.search && (
              <span className="msg-mode">
                <MenuIcon name="search" /> Web search
              </span>
            )}
            {(m.modes.tools ?? []).map((t) => (
              <span key={t.id} className="msg-mode tool">
                ${t.name.toLowerCase().replace(/\s+/g, '')}
              </span>
            ))}
          </div>
        )}
        {m.from && <HandOffCard from={m.from} />}
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
              {side && <SendBeside side={side} m={m} />}
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
      {role ? <RoleBot identity={role.identity} replies={role.replies} size={30} working={typing} className="sprout" /> : <SproutBot size={30} working={typing} className="sprout" />}
      <div className="body">
        {m.speaker && role && (
          <div className="msg-speaker">
            <b>{role.name}</b>
            {m.speakerTo && <span> → {m.speakerTo === 'you' ? 'You' : m.speakerTo}</span>}
          </div>
        )}
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
        {m.error && m.error !== 'Stopped.' && <div className="error">{m.error}</div>}
        {m.error === 'Stopped.' && <div className="stopped">Stopped</div>}
        {!typing && m.text && ((m.sources?.length ?? 0) > 0 || onProject || side) && (
          <div className="msg-actions">
            {m.sources && m.sources.length > 0 && <Sources sources={m.sources} />}
            {side && <SendBeside side={side} m={m} />}
            {onProject && (
              <button
                className="project-btn"
                title="Sum up this whole chat into a brief and start building it with Claude Code"
                disabled={projectBusy}
                onClick={onProject}
              >
                <ClaudeBuddy size={20} working={projectBusy} />
                {projectBusy ? 'Preparing the project…' : 'Create project'}
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

/** A short plain-text preview of a reply, and how many visuals it has (charts, diagrams, mockups). */
function preview(text: string): { excerpt: string; visuals: number } {
  let visuals = 0
  const plain = text
    .replace(/```(chart|mermaid|ui)\b[\s\S]*?(```|$)/g, () => {
      visuals++
      return ' '
    })
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/\[\[tool:[^\]]+\]\]/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { excerpt: plain.length > 180 ? `${plain.slice(0, 179)}…` : plain, visuals }
}

/**
 * A ChatGPT reply handed to Claude Code: a card in the message box (with ×) and in the sent message
 * (click to read the whole reply, visuals drawn). Claude Code gets the full reply as context.
 */
export function HandOffCard({ from, onRemove }: { from: HandOff; onRemove?: () => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const { excerpt, visuals } = preview(from.text)
  return (
    <div className={`handoff ${onRemove ? 'in-box' : 'in-msg'} ${open ? 'open' : ''}`}>
      <button className="handoff-head" onClick={() => setOpen(!open)} title={open ? 'Hide the reply' : 'Show the whole reply'}>
        <img src={icon} alt="" className="handoff-icon" />
        <span className="handoff-meta">
          <span className="handoff-label">
            <span className="handoff-from">{from.kind === 'brief' ? 'Project brief from' : from.kind === 'side' ? `Sent by the ${from.sender === 'claude' ? 'Claude Code' : 'ChatGPT'} chat` : 'Reply from'}</span>
            <b>{from.chat}</b>
            {visuals > 0 && <span className="handoff-chip">{visuals === 1 ? '1 visual' : `${visuals} visuals`}</span>}
          </span>
          {!open && <span className="handoff-excerpt">{excerpt}</span>}
        </span>
      </button>
      {onRemove && (
        <button className="attach-x handoff-x" title="Remove" onClick={onRemove}>
          ×
        </button>
      )}
      {open && (
        <div className="handoff-body">
          <Markdown text={from.text} streaming={false} />
        </div>
      )}
    </div>
  )
}

/** A reply's cited pages: one small pill (the first sites' badges and a count) that opens the list. */
function Sources({ sources }: { sources: { url: string; title: string }[] }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const sites = [...new Set(sources.map((s) => siteName(s.url)))]
  return (
    <div className="sources">
      <button className={`sources-pill ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="sources-stack">
          {sites.slice(0, 3).map((site) => (
            <span key={site} className="source-badge">
              {site.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </span>
        Sources · {sources.length}
      </button>
      {open && (
        <div className="sources-list">
          {sources.map((s) => {
            const site = siteName(s.url)
            const titled = !(/^https?:\/\//.test(s.title) || !s.title.trim() || s.title.replace(/^www\./, '') === site)
            return (
              <a key={s.url} className="source" href={s.url} target="_blank" rel="noreferrer" title={s.url}>
                <span className="source-badge">{site.slice(0, 1).toUpperCase()}</span>
                <span className="source-title">{titled ? s.title : site}</span>
                {titled && <span className="source-site">{site}</span>}
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** The chat beside, for the "Send to …" button on a reply. */
export interface SideAction {
  kind: ChatKind
  /** Which way it is: the arrow points at it. */
  dir: 'left' | 'right'
  send: (m: ChatMessage) => void
}

export const sideName = (k: ChatKind): string => (k === 'claude' ? 'Claude Code' : 'ChatGPT')

/** Sends a reply to the chat beside, at once; shows "Sent" for a moment. */
function SendBeside({ side, m }: { side: SideAction; m: ChatMessage }): React.JSX.Element {
  const [sent, setSent] = useState(false)
  return (
    <button
      className={`send-beside ${side.kind} ${sent ? 'sent' : ''}`}
      title={`Put this reply in the ${sideName(side.kind)} chat’s message box beside, ready to send`}
      disabled={sent}
      onClick={() => {
        side.send(m)
        setSent(true)
        setTimeout(() => setSent(false), 2500)
      }}
    >
      {side.dir === 'left' && <Arrow dir="left" />}
      {sent ? `Added to ${sideName(side.kind)}` : `Send to ${sideName(side.kind)}`}
      {side.dir === 'right' && <Arrow dir="right" />}
    </button>
  )
}

export const Arrow = ({ dir }: { dir: 'left' | 'right' }): React.JSX.Element => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {dir === 'right' ? <path d="M5 12h14M13 6l6 6-6 6" /> : <path d="M19 12H5M11 6l-6 6 6 6" />}
  </svg>
)
