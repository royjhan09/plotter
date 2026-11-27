import { useEffect, useRef, useState } from 'react'
import type { Attachment, EffortLevel, MessageModes, Project, SpeechStatus } from '../../shared/api'
import { LIBRARY, LibraryPicker } from '@private/renderer/Library'
import { MenuIcon, PlusMenu } from './PlusMenu'
import { ACCEPT, badgeFor, sizeLabel, toAttachment } from './attachments'
import { startRecording, type Recording } from './audio'
import { DRAWING, PictureViewer, SketchEditor, type RectSource } from '@private/renderer/ImageViewer'

const api = window.plotter

export const EFFORT_LABEL: Record<string, string> = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
  ultra: 'Ultra'
}
export const effortLabel = (e: string): string => EFFORT_LABEL[e] ?? e

// ---------------------------------------------------------------- icons

const Plus = (): React.JSX.Element => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)
const Mic = (): React.JSX.Element => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
)
const Wave = (): React.JSX.Element => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 11v2" />
  </svg>
)
const Up = (): React.JSX.Element => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
)
const Chevron = (): React.JSX.Element => (
  <svg viewBox="0 0 12 8" width="11" height="8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M1.5 1.5 6 6l4.5-4.5" />
  </svg>
)
const Check = (): React.JSX.Element => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)
const Cross = (): React.JSX.Element => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)


export function speechStatusText(s: SpeechStatus): string | null {
  if (s.state === 'downloading') return `Downloading speech model (first time only)… ${s.percent}%`
  if (s.state === 'loading') return 'Loading speech model…'
  if (s.state === 'error') return `Speech model problem: ${s.message}`
  return null
}

export function useSpeechStatus(): SpeechStatus {
  const [s, setS] = useState<SpeechStatus>({ state: 'idle' })
  useEffect(() => {
    void api.speech.status().then(setS)
    return api.speech.onStatus(setS)
  }, [])
  return s
}

/** A white canvas to sketch on (the sketch editor draws on a picture). */
function blankCanvas(): string {
  const c = document.createElement('canvas')
  c.width = 1280
  c.height = 800
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

// ---------------------------------------------------------------- composer

interface Props {
  draft: string
  setDraft: (v: string | ((prev: string) => string)) => void
  attachments: Attachment[]
  setAttachments: (f: (prev: Attachment[]) => Attachment[]) => void
  pending: boolean
  ready: boolean
  placeholder: string
  onSend: () => void
  onStop: () => void
  onVoice: () => void
  onError: (message: string) => void
  /** Deep research for the next message (many searches, a long cited report). */
  research: boolean
  setResearch: (on: boolean) => void
  /** Picked in the + menu for the next message: make a picture, search the web, use these tools. */
  modes: MessageModes
  setModes: (m: MessageModes) => void
  /** "Start in a project": the projects to choose from, and what to do with the choice ('new' makes one). */
  projects?: Project[]
  onStartInProject?: (id: string) => void
  /** Opens "Send to Claude Code" with the message box's text as the task (absent when there is no chat yet). */
  onClaudeCode?: () => void
  /** claude: a Claude Code chat's box (no files, deep research or voice mode). */
  variant?: 'chatgpt' | 'claude'
  /** Shown where the + button is (a Claude Code chat's folder button). */
  leadSlot?: React.ReactNode
  /** A guess at the next message, shown greyed out in the empty box; Tab fills it in. */
  suggestion?: string
  /** Shown above the attachments (a ChatGPT reply handed to Claude Code). */
  topSlot?: React.ReactNode
  /** The box can be sent empty (something is attached in topSlot). */
  canSendEmpty?: boolean
}

/** A paste longer than this becomes an attached text file instead of filling the box (as in ChatGPT). */
const LONG_PASTE_CHARS = 3000
const LONG_PASTE_LINES = 60

export function Composer(p: Props): React.JSX.Element {
  const suggesting = !!p.suggestion && !p.draft && !p.research && !p.pending
  const input = useRef<HTMLTextAreaElement>(null)
  const filePicker = useRef<HTMLInputElement>(null)
  const [menu, setMenu] = useState<'plus' | null>(null)
  const [library, setLibrary] = useState(false)
  const [sketching, setSketching] = useState(false)
  const [dictation, setDictation] = useState<'off' | 'recording' | 'transcribing'>('off')
  // a picture opened large from its thumbnail, or being drawn on
  const [viewing, setViewing] = useState<{ id: string; from: RectSource } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const viewingAttachment = viewing ? p.attachments.find((x) => x.id === viewing.id) : undefined
  const editingAttachment = editing ? p.attachments.find((x) => x.id === editing) : undefined
  const rec = useRef<Recording | null>(null)
  const speech = useSpeechStatus()
  const canSend = (p.draft.trim().length > 0 || p.attachments.length > 0 || !!p.canSendEmpty) && p.ready

  // Grow the box with its text.
  useEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }, [p.draft])

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menu])

  const addFiles = async (files: Iterable<File>): Promise<void> => {
    for (const f of files) {
      try {
        const a = await toAttachment(f)
        p.setAttachments((prev) => [...prev, a])
      } catch (e) {
        p.onError(e instanceof Error ? e.message : String(e))
      }
    }
    input.current?.focus()
  }

  const startDictation = async (): Promise<void> => {
    try {
      rec.current = await startRecording()
      setDictation('recording')
      void api.speech.warm()
    } catch {
      p.onError('Plotter could not use the microphone. Check Windows Settings › Privacy & security › Microphone.')
    }
  }
  const finishDictation = async (keep: boolean): Promise<void> => {
    const r = rec.current
    rec.current = null
    if (!r) return setDictation('off')
    if (!keep) {
      r.cancel()
      return setDictation('off')
    }
    setDictation('transcribing')
    try {
      const text = await api.speech.transcribe(await r.stop())
      if (text) p.setDraft((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text))
    } catch (e) {
      p.onError(`Could not turn speech into text: ${e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : e}`)
    } finally {
      setDictation('off')
      input.current?.focus()
    }
  }

  const status = dictation === 'transcribing' ? (speechStatusText(speech) ?? 'Turning speech into text…') : null

  return (
    <div
      className={`composer ${p.variant === 'claude' ? 'claude' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault()
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return // a chat dragged from the list: the chat area takes it
        e.preventDefault()
        e.stopPropagation() // the chat area behind also accepts drops
        if (p.variant !== 'claude') void addFiles(e.dataTransfer.files)
      }}
    >
      {menu === 'plus' && (
        <PlusMenu
          research={p.research}
          modes={p.modes}
          projects={p.projects}
          canSketch={DRAWING}
          canLibrary={LIBRARY}
          onClose={() => setMenu(null)}
          onFiles={() => filePicker.current?.click()}
          onLibrary={() => setLibrary(true)}
          onSketch={() => setSketching(true)}
          onResearch={(on) => p.setResearch(on)}
          onModes={(m) => {
            p.setModes(m)
            input.current?.focus()
          }}
          onStartInProject={p.onStartInProject}
          onClaudeCode={p.onClaudeCode}
        />
      )}
      {(p.research || p.modes.image || p.modes.search || (p.modes.tools?.length ?? 0) > 0) && (
        <div className="mode-chips">
          {p.research && (
            <span className="mode-chip">
              <MenuIcon name="research" /> Deep research
              <button title="Turn off deep research" onClick={() => p.setResearch(false)}>
                ×
              </button>
            </span>
          )}
          {p.modes.image && (
            <span className="mode-chip">
              <MenuIcon name="image" /> Image generation
              <button title="Turn off image generation" onClick={() => p.setModes({ ...p.modes, image: false })}>
                ×
              </button>
            </span>
          )}
          {p.modes.search && (
            <span className="mode-chip">
              <MenuIcon name="search" /> Web search
              <button title="Turn off web search" onClick={() => p.setModes({ ...p.modes, search: false })}>
                ×
              </button>
            </span>
          )}
          {(p.modes.tools ?? []).map((t) => (
            <span key={t.id} className="mode-chip tool">
              ${t.name.toLowerCase().replace(/\s+/g, '')}
              <button title={`Don’t use ${t.name}`} onClick={() => p.setModes({ ...p.modes, tools: (p.modes.tools ?? []).filter((x) => x.id !== t.id) })}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {library && <LibraryPicker onPick={(a) => p.setAttachments((prev) => [...prev, a])} onClose={() => setLibrary(false)} />}
      {sketching && (
        <SketchEditor
          src={blankCanvas()}
          onClose={() => setSketching(false)}
          onSave={(data) => {
            const size = Math.round(((data.length - data.indexOf(',') - 1) * 3) / 4)
            const n = p.attachments.filter((a) => a.name.startsWith('Sketch')).length
            p.setAttachments((prev) => [...prev, { id: Math.random().toString(36).slice(2, 10), kind: 'image', name: n ? `Sketch ${n + 1}.png` : 'Sketch.png', mime: 'image/png', size, data }])
            setSketching(false)
          }}
        />
      )}
      {p.topSlot}
      {p.attachments.length > 0 && (
        <div className="attach-row">
          {p.attachments.map((a) => (
            <div key={a.id} className={`attach ${a.kind}`} title={a.name}>
              {a.kind === 'image' ? (
                <button
                  className="attach-open"
                  aria-label={`View ${a.name}`}
                  onClick={(e) => {
                    const thumb = e.currentTarget
                    setViewing({ id: a.id, from: () => (thumb.isConnected ? thumb.getBoundingClientRect() : null) })
                  }}
                >
                  <img src={a.data} alt={a.name} />
                </button>
              ) : (
                <>
                  <span className="file-badge">{badgeFor(a)}</span>
                  <span className="file-meta">
                    <span className="file-name">{a.name}</span>
                    <span className="file-size">{sizeLabel(a.size)}</span>
                  </span>
                </>
              )}
              <button className="attach-x" title="Remove" onClick={() => p.setAttachments((prev) => prev.filter((x) => x.id !== a.id))}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {viewingAttachment && (
        <PictureViewer
          src={viewingAttachment.data}
          from={viewing!.from}
          onEdit={
            DRAWING
              ? () => {
                  setEditing(viewingAttachment.id)
                  setViewing(null)
                }
              : undefined
          }
          onClose={() => setViewing(null)}
        />
      )}
      {editingAttachment && (
        <SketchEditor
          src={editingAttachment.data}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            const size = Math.round(((data.length - data.indexOf(',') - 1) * 3) / 4)
            p.setAttachments((prev) => prev.map((x) => (x.id === editingAttachment.id ? { ...x, data, mime: 'image/png', size } : x)))
            setEditing(null)
          }}
        />
      )}

      <div className="composer-row">
        {p.leadSlot ?? (
        <div className="pop-anchor">
          <button
            className={`icon-btn ${menu ? 'on' : ''}`}
            title="Add files and more"
            onClick={(e) => {
              e.stopPropagation()
              setMenu(menu ? null : 'plus')
            }}
          >
            <Plus />
          </button>
          <input
            ref={filePicker}
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              if (e.target.files) void addFiles(Array.from(e.target.files))
              e.target.value = ''
            }}
          />
        </div>
        )}

        {dictation === 'recording' ? (
          <LiveWave level={() => rec.current?.level() ?? 0} />
        ) : status ? (
          <div className="dictation-status">{status}</div>
        ) : (
          <textarea
            ref={input}
            value={p.draft}
            rows={1}
            placeholder={p.research ? 'What should Plotter research?' : suggesting ? p.suggestion : p.placeholder}
            onChange={(e) => p.setDraft(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files)
              if (files.length) {
                e.preventDefault()
                void addFiles(files)
                return
              }
              const text = e.clipboardData.getData('text/plain')
              if (text.length > LONG_PASTE_CHARS || text.split('\n').length > LONG_PASTE_LINES) {
                e.preventDefault()
                const n = p.attachments.filter((a) => a.name.startsWith('Pasted text')).length
                void addFiles([new File([text], n ? `Pasted text ${n + 1}.txt` : 'Pasted text.txt', { type: 'text/plain' })])
              }
            }}
            onKeyDown={(e) => {
              // Tab takes the greyed-out suggestion (as in Claude Code's prompt)
              if (e.key === 'Tab' && !e.shiftKey && suggesting) {
                e.preventDefault()
                p.setDraft(p.suggestion!)
                return
              }
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                if (canSend && !p.pending) p.onSend()
              }
            }}
            autoFocus
          />
        )}
        {suggesting && dictation === 'off' && !status && (
          <kbd className="tab-hint" title="Press Tab to use this suggestion">
            Tab
          </kbd>
        )}

        {dictation === 'recording' ? (
          <>
            <button className="icon-btn" title="Cancel" onClick={() => void finishDictation(false)}>
              <Cross />
            </button>
            <button className="round-btn" title="Done" onClick={() => void finishDictation(true)}>
              <Check />
            </button>
          </>
        ) : (
          <>
            <button className="icon-btn" title="Dictate" disabled={dictation !== 'off'} onClick={() => void startDictation()}>
              <Mic />
            </button>
            {p.pending ? (
              <button className="round-btn dark" title="Stop" onClick={p.onStop}>
                <span className="stop-square" />
              </button>
            ) : canSend || p.variant === 'claude' ? (
              <button className="round-btn" title="Send (Enter)" onClick={p.onSend} disabled={!canSend}>
                <Up />
              </button>
            ) : (
              <button className="round-btn" title="Voice mode" onClick={p.onVoice} disabled={!p.ready || dictation !== 'off'}>
                <Wave />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** A scrolling bar graph of the mic level while dictating. */
function LiveWave({ level }: { level: () => number }): React.JSX.Element {
  const [bars, setBars] = useState<number[]>(() => Array(48).fill(0.04))
  useEffect(() => {
    let frame = 0
    let last = 0
    const tick = (t: number): void => {
      if (t - last > 60) {
        last = t
        setBars((b) => [...b.slice(1), Math.max(0.04, level())])
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [level])
  return (
    <div className="live-wave">
      {bars.map((v, i) => (
        <i key={i} style={{ height: `${Math.round(4 + v * 26)}px` }} />
      ))}
    </div>
  )
}

/**
 * The reasoning (or Claude Code effort) menu, on the row below the message box so the box keeps its room.
 * It opens upward, from the right.
 */
export function EffortMenu({ efforts, effort, setEffort, title = 'Reasoning' }: { efforts: EffortLevel[]; effort: string; setEffort: (e: string) => void; title?: string }): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent): void => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  if (!efforts.length) return null
  return (
    <div className="pop-anchor effort-below" ref={box}>
      <button className={`effort-btn small ${open ? 'open' : ''}`} title={title} onClick={() => setOpen(!open)}>
        {effortLabel(effort)} <Chevron />
      </button>
      {open && (
        <div className="pop right">
          <div className="pop-title">{title}</div>
          {efforts.map((l) => (
            <button
              key={l.effort}
              className={`pop-item effort ${l.effort === effort ? 'on' : ''}`}
              onClick={() => {
                setEffort(l.effort)
                setOpen(false)
              }}
            >
              <span className="effort-text">
                <span className="effort-name">{effortLabel(l.effort)}</span>
                {l.description && <span className="effort-desc">{l.description}</span>}
              </span>
              {l.effort === effort && <Check />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
