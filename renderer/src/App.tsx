import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Attachment, AuthState, CanvasDoc, Chat, ChatMessage, ChatSummary, Model, ReplyEvent } from '../../shared/api'
import { Markdown } from './Markdown'
import { Composer } from './Composer'
import { VoiceMode } from './VoiceMode'
import { badgeFor, sizeLabel, toAttachment } from './attachments'
import { useThemeSetting, type Theme } from './theme'
import { CanvasContext, CanvasPanel } from './Canvas'
import { CustomizePanel, Settings } from './Settings'
import { PictureViewer } from './ImageViewer'
import { PdfBadge, PdfPreview } from './PdfPreview'
import icon from '../../assets/icon.png'

const api = window.plotter
const newId = (): string => crypto.randomUUID().replace(/-/g, '')
const EFFORT_KEY = 'plotter.effort'

function titleFrom(text: string, attachments: Attachment[]): string {
  const line = text.trim().split('\n')[0] ?? ''
  if (!line) return attachments[0]?.name ?? 'New chat'
  return line.length > 48 ? `${line.slice(0, 47)}…` : line
}

function cleanError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function App(): React.JSX.Element {
  const [auth, setAuth] = useState<AuthState | null>(null)
  useEffect(() => {
    void api.auth.state().then(setAuth)
  }, [])
  if (!auth) return <div className="boot" />
  if (!auth.signedIn) return <SignIn onSignedIn={setAuth} />
  return <ChatApp auth={auth} setAuth={setAuth} />
}

// ---------------------------------------------------------------- sign in

function SignIn({ onSignedIn }: { onSignedIn: (s: AuthState) => void }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      onSignedIn(await api.auth.signIn())
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="signin">
      <div className="signin-card">
        <img src={icon} alt="" className="signin-logo" />
        <h1>Plotter</h1>
        <p className="muted">Your own chat app, running on your ChatGPT plan.</p>
        {busy ? (
          <>
            <p className="hint">Finish signing in in your browser…</p>
            <button className="btn ghost" onClick={() => void api.auth.cancelSignIn()}>
              Cancel
            </button>
          </>
        ) : (
          <button className="btn primary big" onClick={() => void go()}>
            Continue with ChatGPT
          </button>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- chat

type Waiter = { resolve: (text: string) => void; reject: (e: Error) => void }

function ChatApp({ auth, setAuth }: { auth: Extract<AuthState, { signedIn: true }>; setAuth: (s: AuthState) => void }): React.JSX.Element {
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [chat, setChat] = useState<Chat | null>(null)
  const [model, setModel] = useState<Model | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)
  const [effort, setEffortState] = useState<string>('')
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [pending, setPending] = useState<{ requestId: string; chatId: string } | null>(null)
  const [limitHit, setLimitHit] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [pdf, setPdf] = useState<{ bytes: Uint8Array | null; name: string; error?: string } | null>(null)
  const pdfJob = useRef(0)
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null)
  const [activity, setActivity] = useState<string | null>(null)
  const [voice, setVoice] = useState(false)
  const [showWelcome, setShowWelcome] = useState(auth.planUsage && !auth.welcomeSeen)
  const [theme, setTheme] = useThemeSetting()
  const [accountMenu, setAccountMenu] = useState(false)
  // Rail panels (Chats, Customize): hovering an icon slides its own panel out; leaving closes it a moment later.
  // "Docked" keeps a panel open beside the chat.
  type PanelKind = 'chats' | 'customize'
  const [panel, setPanel] = useState<PanelKind | null>(null)
  const [pinned, setPinned] = useState(() => localStorage.getItem('plotter.sidebarPinned') === '1')
  const [dockedPanel, setDockedPanel] = useState<PanelKind>(() => (localStorage.getItem('plotter.dockedPanel') === 'customize' ? 'customize' : 'chats'))
  const shownPanel: PanelKind | null = panel ?? (pinned ? dockedPanel : null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hoverIn = (kind: PanelKind): void => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setPanel(kind), panel ? 0 : 120)
  }
  const hoverKeep = (): void => clearTimeout(hoverTimer.current)
  const hoverOut = (): void => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setPanel(null), 300)
  }
  const clickPanel = (kind: PanelKind): void => {
    clearTimeout(hoverTimer.current)
    if (pinned) {
      setDockedPanel(kind)
      localStorage.setItem('plotter.dockedPanel', kind)
      setPanel(null)
    } else setPanel((p) => (p === kind ? null : kind))
  }
  const togglePin = (): void => {
    const kind = shownPanel ?? 'chats'
    setDockedPanel(kind)
    localStorage.setItem('plotter.dockedPanel', kind)
    setPinned((p) => {
      localStorage.setItem('plotter.sidebarPinned', p ? '0' : '1')
      return !p
    })
    setPanel(null)
  }
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const shownChats = query.trim() ? chats.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase())) : chats
  const [settingsTab, setSettingsTab] = useState<'features' | 'memory' | 'connectors'>('features')
  const openSettings = (tab: 'features' | 'memory' | 'connectors'): void => {
    setSettingsTab(tab)
    setSettingsOpen(true)
    setPanel(null)
  }
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [research, setResearch] = useState(false)
  const [canvas, setCanvas] = useState<CanvasDoc | null>(null)
  const canvasRef = useRef<CanvasDoc | null>(null)
  canvasRef.current = canvas
  const canvasApi = useMemo(() => ({ open: (doc: CanvasDoc) => setCanvas(doc), current: canvas }), [canvas])
  // while Python is starting or downloading a library, say so in the reply's activity line
  useEffect(
    () =>
      api.python.onStatus((s) => {
        if (s.state === 'loading' && pendingRef.current) setActivity(s.detail)
      }),
    []
  )
  const chatRef = useRef<Chat | null>(null)
  chatRef.current = chat
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const waiters = useRef(new Map<string, Waiter>())
  const scroller = useRef<HTMLDivElement>(null)

  const refreshList = useCallback(() => void api.chats.list().then(setChats), [])

  const loadModel = useCallback(() => {
    setModelError(null)
    api
      .model()
      .then((m) => {
        setModel(m)
        const saved = localStorage.getItem(EFFORT_KEY)
        const has = (e: string | null): e is string => !!e && m.efforts.some((l) => l.effort === e)
        setEffortState(has(saved) ? saved : has('medium') ? 'medium' : m.defaultEffort)
      })
      .catch((e) => setModelError(cleanError(e)))
  }, [])

  useEffect(() => {
    refreshList()
    loadModel()
  }, [refreshList, loadModel])

  const setEffort = (e: string): void => {
    setEffortState(e)
    localStorage.setItem(EFFORT_KEY, e)
  }

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  /** Ask the model for a short title and store it, whether or not the chat is still open. */
  const nameChat = useCallback(
    async (chatId: string, userText: string, replyText: string): Promise<void> => {
      try {
        const title = await api.chats.title(userText, replyText)
        if (!title) return
        const open = chatRef.current?.id === chatId ? chatRef.current : null
        const stored = open ?? (await api.chats.get(chatId))
        if (!stored) return
        const named = { ...stored, title, titled: true }
        if (open) {
          chatRef.current = named
          setChat(named)
        }
        await api.chats.save(named)
        refreshList()
      } catch {
        // keep the first-message title if naming fails (e.g. usage limit)
      }
    },
    [refreshList]
  )

  // Stream events from the main process. Refs, not state updaters, so each event is applied exactly once.
  useEffect(
    () =>
      api.reply.onEvent((ev: ReplyEvent) => {
        const p = pendingRef.current
        const current = chatRef.current
        if (!p || p.requestId !== ev.requestId || !current || current.id !== p.chatId) return
        const msgs = [...current.messages]
        const last = msgs[msgs.length - 1]
        if (!last || last.role !== 'assistant') return
        if (ev.type === 'activity') {
          setActivity(ev.label)
          return
        }
        if (ev.type === 'tool') {
          // a Plotter tool ran (Python, memory, a connector): show its card where it happened
          msgs[msgs.length - 1] = { ...last, text: `${last.text}\n\n[[tool:${ev.run.id}]]\n\n`, toolRuns: [...(last.toolRuns ?? []), ev.run] }
          chatRef.current = { ...current, messages: msgs }
          setChat(chatRef.current)
          return
        }
        if (ev.type === 'source') {
          if (last.sources?.some((s) => s.url === ev.url)) return
          msgs[msgs.length - 1] = { ...last, sources: [...(last.sources ?? []), { url: ev.url, title: ev.title }] }
          chatRef.current = { ...current, messages: msgs }
          setChat(chatRef.current)
          return
        }
        if (ev.type === 'delta') {
          const first = !last.text && last.thoughtMs === undefined
          msgs[msgs.length - 1] = { ...last, text: last.text + ev.text, ...(first ? { thoughtMs: Date.now() - last.at } : {}) }
          chatRef.current = { ...current, messages: msgs }
          setChat(chatRef.current)
          return
        }
        setActivity(null)
        if (ev.type === 'error') {
          msgs[msgs.length - 1] = { ...last, error: ev.message }
          if (ev.usageLimit) setLimitHit(true)
        }
        const done = { ...current, messages: msgs, updatedAt: Date.now() }
        chatRef.current = done
        pendingRef.current = null
        setChat(done)
        setPending(null)
        void api.chats.save(done).then(refreshList)
        // After the first exchange, let the model name the chat (like ChatGPT's chat list).
        const users = done.messages.filter((m) => m.role === 'user')
        if (users.length === 1 && last.text && !done.titled) void nameChat(done.id, users[0]!.text, last.text)
        const w = waiters.current.get(ev.requestId)
        waiters.current.delete(ev.requestId)
        if (w) {
          if (ev.type === 'error' && !last.text) w.reject(new Error(ev.message))
          else w.resolve(last.text)
        }
      }),
    [refreshList, nameChat]
  )

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat?.messages])

  const openChat = async (id: string): Promise<void> => {
    if (pending) return
    const c = await api.chats.get(id)
    if (c) setChat(c)
  }

  /** Converts the whole chat, or one reply with its question, to a PDF and shows it; Download in the preview saves it. */
  const savePdf = (messageId?: string): void => {
    if (!chat) return
    const job = ++pdfJob.current
    setPdf({ bytes: null, name: chat.title || 'Plotter chat' }) // the preview opens at once, saying Converting…
    api.pdf.make(chat.id, messageId).then(
      (bytes) => {
        if (pdfJob.current === job) setPdf((p) => p && { ...p, bytes })
        else void api.pdf.discard() // closed while converting
      },
      (e: unknown) => {
        if (pdfJob.current === job) setPdf((p) => p && { ...p, error: e instanceof Error ? e.message : String(e) })
      }
    )
  }
  const closePdf = (): void => {
    pdfJob.current++
    setPdf(null)
    void api.pdf.discard()
  }

  const newChat = (): void => {
    if (pending) return
    setChat(null)
    setDraft('')
    setAttachments([])
  }

  const removeChat = async (id: string): Promise<void> => {
    if (pending?.chatId === id) {
      setToast('Wait for the reply to finish (or stop it) before deleting this chat.')
      return
    }
    await api.chats.remove(id)
    if (chat?.id === id) setChat(null)
    refreshList()
  }

  /** Sends a message (the composer's, or voice mode's text) and resolves with the full reply. */
  const sendMessage = async (spoken?: string): Promise<string> => {
    const text = (spoken ?? draft).trim()
    const files = spoken === undefined ? attachments : []
    if ((!text && files.length === 0) || pendingRef.current || !model) return ''
    const now = Date.now()
    const asResearch = research && spoken === undefined
    const user: ChatMessage = { id: newId(), role: 'user', text, at: now, ...(files.length ? { attachments: files } : {}), ...(asResearch ? { research: true } : {}) }
    const reply: ChatMessage = { id: newId(), role: 'assistant', text: '', at: now }
    const current = chatRef.current
    const base: Chat = current ?? { id: newId(), title: titleFrom(text, files), model: model.slug, messages: [], createdAt: now, updatedAt: now }
    const history = [...base.messages.filter((m) => !(m.role === 'assistant' && !m.text)), user]
    const next: Chat = { ...base, model: model.slug, messages: [...history, reply], updatedAt: now }
    chatRef.current = next
    setChat(next)
    if (spoken === undefined) {
      setDraft('')
      setAttachments([])
      setResearch(false)
    }
    setLimitHit(false)
    const requestId = newId()
    pendingRef.current = { requestId, chatId: next.id }
    setPending(pendingRef.current)
    const finished = new Promise<string>((resolve, reject) => waiters.current.set(requestId, { resolve, reject }))
    await api.chats.save(next)
    refreshList()
    try {
      await api.reply.send({
        requestId,
        chatId: next.id,
        model: model.slug,
        effort,
        history: history.map((m) => ({ role: m.role, text: m.text, ...(m.attachments ? { attachments: m.attachments } : {}) })),
        research: asResearch,
        canvas: canvasRef.current
      })
    } catch (e) {
      const failed = { ...next, messages: [...history, { ...reply, error: cleanError(e) }] }
      chatRef.current = failed
      pendingRef.current = null
      setChat(failed)
      setPending(null)
      void api.chats.save(failed)
      waiters.current.delete(requestId)
      throw e
    }
    return finished
  }

  // Voice mode keeps one stable function, pointing at the latest sendMessage.
  const sendRef = useRef(sendMessage)
  sendRef.current = sendMessage
  const ask = useCallback((text: string) => sendRef.current(text), [])

  const stop = (): void => {
    if (pending) void api.reply.stop(pending.requestId)
  }

  const signOut = async (): Promise<void> => {
    stop()
    setAuth(await api.auth.signOut())
  }

  const onDropFiles = async (files: FileList): Promise<void> => {
    for (const f of Array.from(files)) {
      try {
        const a = await toAttachment(f)
        setAttachments((prev) => [...prev, a])
      } catch (e) {
        setToast(cleanError(e))
      }
    }
  }

  const messages = chat?.messages ?? []

  return (
    <CanvasContext.Provider value={canvasApi}>
    <div className={`shell ${canvas ? 'with-canvas' : ''} ${pinned ? 'pinned' : ''}`}>
      {/* The rail: always there. Hovering an icon slides its panel out (Chats, Customize); a docked panel stays. */}
      <nav className="rail">
        <div className="rail-top">
          <button className="rail-logo" title="New chat" onClick={newChat} disabled={!!pending}>
            <img src={icon} alt="Plotter" />
          </button>
          <button
            className={`rail-btn ${shownPanel === 'chats' ? 'on' : ''}`}
            title="Chats"
            onMouseEnter={() => hoverIn('chats')}
            onMouseLeave={hoverOut}
            onClick={() => clickPanel('chats')}
          >
            <RailIcon name="home" />
          </button>
          <button
            className={`rail-btn ${shownPanel === 'customize' ? 'on' : ''}`}
            title="Customize"
            onMouseEnter={() => hoverIn('customize')}
            onMouseLeave={hoverOut}
            onClick={() => clickPanel('customize')}
          >
            <RailIcon name="customize" />
          </button>
        </div>
        <div className="rail-fill" />
        <div className="rail-bottom">
          <ThemeButton theme={theme} onChange={setTheme} />
          <button className="rail-btn" title="Settings" onClick={() => openSettings('features')}>
            <RailIcon name="settings" />
          </button>
          <button
            className={`rail-avatar ${accountMenu ? 'open' : ''}`}
            title={auth.account.email ?? 'Account'}
            onClick={(e) => {
              e.stopPropagation()
              setAccountMenu((o) => !o)
            }}
          >
            {auth.account.picture ? (
              <img src={auth.account.picture} alt="" className="avatar" />
            ) : (
              <div className="avatar letter">{(auth.account.name ?? auth.account.email ?? '?')[0]?.toUpperCase()}</div>
            )}
          </button>
          {accountMenu && (
            <AccountMenu
              name={auth.account.name}
              email={auth.account.email}
              onClose={() => setAccountMenu(false)}
              onUsage={() => void api.openUsage()}
              onSettings={() => openSettings('features')}
              onSignOut={() => void signOut()}
            />
          )}
        </div>
      </nav>

      {/* The panel: a card that slides over the chat on hover, or sits beside it when docked. */}
      <aside className={`sidebar ${panel ? 'open' : ''}`} onMouseEnter={hoverKeep} onMouseLeave={hoverOut}>
        {shownPanel === 'customize' ? (
          <>
            <div className="sidebar-head">
              <span className="sidebar-title">Customize</span>
              <button className="pin-btn" title={pinned ? 'Undock (open on hover)' : 'Dock'} onClick={togglePin}>
                <RailIcon name={pinned ? 'unpin' : 'pin'} />
              </button>
            </div>
            <CustomizePanel open={!!panel || pinned} onSettings={openSettings} />
          </>
        ) : (
          <>
            <div className="sidebar-head">
              <span className="sidebar-title">Plotter</span>
              <div className="head-btns">
                <button className={`pin-btn ${searching ? 'on' : ''}`} title="Search chats" onClick={() => {
                    if (searching) setQuery('')
                    setSearching(!searching)
                  }}>
                  <RailIcon name="search" />
                </button>
                <button className="pin-btn" title={pinned ? 'Undock (open on hover)' : 'Dock'} onClick={togglePin}>
                  <RailIcon name={pinned ? 'unpin' : 'pin'} />
                </button>
              </div>
            </div>
            {searching && <input className="chat-search" autoFocus placeholder="Search chats" value={query} onChange={(e) => setQuery(e.target.value)} />}
            <button className="side-item" onClick={newChat} disabled={!!pending}>
              <RailIcon name="new" /> New chat
            </button>
            <div className="chat-list-label">{query ? `Matching “${query}”` : 'Recent'}</div>
            <nav className="chat-list">
              {shownChats.length === 0 && <p className="empty-list">{query ? 'No chats match.' : 'No chats yet. Plant the first one.'}</p>}
              {shownChats.map((c) => (
                <div
                  key={c.id}
                  className={`chat-item ${chat?.id === c.id ? 'active' : ''}`}
                  onClick={() => {
                    void openChat(c.id)
                    if (!pinned) setPanel(null)
                  }}
                >
                  <span className="chat-title">{c.title}</span>
                  <button
                    className="del"
                    title="Delete chat"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleting({ id: c.id, title: c.title }) // Plotter's own popup: the browser's confirm() is blocked in the dev pane
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </nav>
          </>
        )}
      </aside>

      <main
        className="main"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) e.preventDefault()
        }}
        onDrop={(e) => {
          e.preventDefault()
          void onDropFiles(e.dataTransfer.files)
        }}
      >
        <header className="topbar">
          <button className="topbar-new" title="New chat" onClick={newChat} disabled={!!pending}>
            <RailIcon name="new" />
          </button>
          <span className="chat-heading">{chat?.title ?? ''}</span>
          {messages.length > 0 && (
            <button className="topbar-pdf" title="Convert this chat to a PDF" onClick={() => savePdf()} disabled={!!pending || !!pdf}>
              <PdfBadge />
              Convert chat to PDF
            </button>
          )}
        </header>

        <div className="scroller" ref={scroller}>
          {messages.length === 0 ? (
            <div className="hello">
              <img src={icon} alt="" />
              <h2>What shall we grow today?</h2>
              {modelError && (
                <p className="error">
                  {modelError}{' '}
                  <button className="link" onClick={loadModel}>
                    Try again
                  </button>
                </p>
              )}
            </div>
          ) : (
            <div className="thread">
              <div className="print-head">
                <div className="print-title">{chat?.title || 'Plotter chat'}</div>
                <div className="print-meta">Plotter · {new Date().toLocaleDateString()}</div>
              </div>
              {messages.map((m, i) => (
                <Message key={m.id} m={m} typing={!!pending && i === messages.length - 1 && m.role === 'assistant'} activity={activity} onPdf={pdf ? undefined : (id) => savePdf(id)} />
              ))}
            </div>
          )}
        </div>

        <div className="composer-wrap">
          {limitHit && (
            <div className="limit">
              <span>You’ve reached your ChatGPT plan’s usage limit for now.</span>
              <button className="btn primary" onClick={() => void api.openUsage()}>
                Manage usage
              </button>
            </div>
          )}
          {toast && (
            <div className="toast" onClick={() => setToast(null)}>
              {toast}
            </div>
          )}
          <Composer
            draft={draft}
            setDraft={setDraft}
            attachments={attachments}
            setAttachments={setAttachments}
            efforts={model?.efforts ?? []}
            effort={effort}
            setEffort={setEffort}
            pending={!!pending}
            ready={!!model}
            placeholder={model ? 'Ask Plotter anything' : modelError ? 'Plotter could not load its model' : 'Loading…'}
            onSend={() => void sendMessage().catch(() => undefined)}
            onStop={stop}
            onVoice={() => setVoice(true)}
            onError={setToast}
            research={research}
            setResearch={setResearch}
          />
          <div className="plan-note">
            {auth.planUsage ? 'Using ChatGPT plan' : 'Plan usage not granted at sign-in'} ·{' '}
            <button className="link" onClick={() => void api.openUsage()}>
              Manage usage
            </button>
          </div>
        </div>
      </main>

      {canvas && <CanvasPanel doc={canvas} onChange={setCanvas} onClose={() => setCanvas(null)} />}

      {pdf && (
        <PdfPreview
          bytes={pdf.bytes}
          name={pdf.name}
          error={pdf.error}
          onClose={closePdf}
        />
      )}

      {deleting && (
        <ConfirmDelete
          title={deleting.title}
          onCancel={() => setDeleting(null)}
          onDelete={() => {
            setDeleting(null)
            void removeChat(deleting.id)
          }}
        />
      )}

      {settingsOpen && <Settings initialTab={settingsTab} onClose={() => setSettingsOpen(false)} />}

      {voice && (
        <VoiceMode
          ask={ask}
          onClose={() => {
            setVoice(false)
            stop()
          }}
        />
      )}

      {showWelcome && (
        <div className="modal-back">
          <div className="modal">
            <img src={icon} alt="" />
            <h3>You’re using your ChatGPT plan</h3>
            <p>Replies in Plotter count toward your ChatGPT plan’s usage. You can set a weekly limit for Plotter in ChatGPT’s usage settings.</p>
            <button
              className="btn primary"
              onClick={() => {
                setShowWelcome(false)
                void api.auth.markWelcomeSeen()
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
    </CanvasContext.Provider>
  )
}

function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function Message({ m, typing, activity, onPdf }: { m: ChatMessage; typing: boolean; activity?: string | null; onPdf?: (id: string) => void }): React.JSX.Element {
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
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- theme switch and account menu

/** One click switches light ↔ dark. The icon shows where the click takes you. */
function ThemeButton({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }): React.JSX.Element {
  const toDark = theme === 'light'
  return (
    <button className="theme-btn" title={toDark ? 'Switch to dark mode' : 'Switch to light mode'} onClick={() => onChange(toDark ? 'dark' : 'light')}>
      {toDark ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
        </svg>
      )}
    </button>
  )
}

/** Opens from the account button; Sign out lives here so it can't be clicked by accident. */
function AccountMenu(p: { name?: string; email?: string; onClose: () => void; onUsage: () => void; onSettings: () => void; onSignOut: () => void }): React.JSX.Element {
  useEffect(() => {
    const close = (): void => p.onClose()
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') p.onClose()
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', esc)
    }
  }, [p])
  return (
    <div className="account-menu" onClick={(e) => e.stopPropagation()}>
      <div className="account-menu-who">
        {p.name && <div className="account-menu-name">{p.name}</div>}
        {p.email && <div className="account-menu-email">{p.email}</div>}
      </div>
      <button
        className="pop-item"
        onClick={() => {
          p.onClose()
          p.onUsage()
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
        Manage ChatGPT usage
      </button>
      <button
        className="pop-item"
        onClick={() => {
          p.onClose()
          p.onSettings()
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
        Settings
      </button>
      <div className="account-menu-sep" />
      <button
        className="pop-item danger"
        onClick={() => {
          p.onClose()
          p.onSignOut()
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
        </svg>
        Sign out
      </button>
    </div>
  )
}

/** Line icons for the rail. */
/** Asks before a chat is deleted. Esc or a click outside cancels. */
function ConfirmDelete({ title, onCancel, onDelete }: { title: string; onCancel: () => void; onDelete: () => void }): React.JSX.Element {
  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onCancel])
  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal confirm-delete" role="alertdialog" aria-label="Delete chat" onClick={(e) => e.stopPropagation()}>
        <h3>Delete chat?</h3>
        <p>
          <b>{title}</b> will be deleted from this PC. This can’t be undone.
        </p>
        <div className="confirm-actions">
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn danger" onClick={onDelete} autoFocus>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function RailIcon({ name }: { name: 'new' | 'chats' | 'home' | 'customize' | 'search' | 'settings' | 'pin' | 'unpin' }): React.JSX.Element {
  const common = { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (name === 'new')
    return (
      <svg {...common}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    )
  if (name === 'home')
    return (
      <svg {...common}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9v11h5v-6h4v6h5V9" />
      </svg>
    )
  if (name === 'customize')
    return (
      <svg {...common}>
        <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="10" cy="17" r="2" />
      </svg>
    )
  if (name === 'search')
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m20 20-4.2-4.2" />
      </svg>
    )
  if (name === 'chats')
    return (
      <svg {...common}>
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
        <path d="M8.5 10.5h7M8.5 13.5h4.5" />
      </svg>
    )
  if (name === 'settings')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
      </svg>
    )
  // pin / unpin: a sidebar outline, filled when docked
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
      {name === 'unpin' && <path d="M4.5 6h3M4.5 9h3M4.5 12h3" />}
    </svg>
  )
}

/** A picture in a sent message: a thumbnail that grows into the full-screen viewer. */
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
