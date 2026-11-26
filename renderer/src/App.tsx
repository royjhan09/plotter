import { useCallback, useEffect, useRef, useState } from 'react'
import type { Attachment, AuthState, Chat, ChatMessage, ChatSummary, Model, ReplyEvent } from '../../shared/api'
import { Markdown } from './Markdown'
import { Composer } from './Composer'
import { VoiceMode } from './VoiceMode'
import { sizeLabel, toAttachment } from './attachments'
import { useThemeChoice, type ThemeChoice } from './theme'
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
  const [voice, setVoice] = useState(false)
  const [showWelcome, setShowWelcome] = useState(auth.planUsage && !auth.welcomeSeen)
  const [themeChoice, setThemeChoice] = useThemeChoice()
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
        if (ev.type === 'delta') {
          msgs[msgs.length - 1] = { ...last, text: last.text + ev.text }
          chatRef.current = { ...current, messages: msgs }
          setChat(chatRef.current)
          return
        }
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
        const w = waiters.current.get(ev.requestId)
        waiters.current.delete(ev.requestId)
        if (w) {
          if (ev.type === 'error' && !last.text) w.reject(new Error(ev.message))
          else w.resolve(last.text)
        }
      }),
    [refreshList]
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

  const newChat = (): void => {
    if (pending) return
    setChat(null)
    setDraft('')
    setAttachments([])
  }

  const removeChat = async (id: string): Promise<void> => {
    if (pending?.chatId === id) return
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
    const user: ChatMessage = { id: newId(), role: 'user', text, at: now, ...(files.length ? { attachments: files } : {}) }
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
        history: history.map((m) => ({ role: m.role, text: m.text, ...(m.attachments ? { attachments: m.attachments } : {}) }))
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
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={icon} alt="" />
          <span>Plotter</span>
        </div>
        <button className="btn primary new" onClick={newChat} disabled={!!pending}>
          <span className="plus">+</span> New chat
        </button>
        <nav className="chat-list">
          {chats.length === 0 && <p className="empty-list">No chats yet. Plant the first one.</p>}
          {chats.map((c) => (
            <div key={c.id} className={`chat-item ${chat?.id === c.id ? 'active' : ''}`} onClick={() => void openChat(c.id)}>
              <span className="chat-title">{c.title}</span>
              <button
                className="del"
                title="Delete chat"
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`Delete “${c.title}”?`)) void removeChat(c.id)
                }}
              >
                ×
              </button>
            </div>
          ))}
        </nav>
        <div className="account">
          {auth.account.picture ? (
            <img src={auth.account.picture} alt="" className="avatar" />
          ) : (
            <div className="avatar letter">{(auth.account.name ?? auth.account.email ?? '?')[0]?.toUpperCase()}</div>
          )}
          <div className="who">
            <div className="name">{auth.account.name ?? 'Signed in'}</div>
            <div className="email">{auth.account.email}</div>
          </div>
          <ThemeButton choice={themeChoice} onChange={setThemeChoice} />
          <button className="link" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
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
          <span className="topbar-name">Plotter</span>
          {model && <span className="topbar-model">{model.displayName}</span>}
          <span className="chat-heading">{chat?.title ?? ''}</span>
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
              {messages.map((m, i) => (
                <Message key={m.id} m={m} typing={!!pending && i === messages.length - 1 && m.role === 'assistant'} />
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
          />
          <div className="plan-note">
            {auth.planUsage ? 'Using ChatGPT plan' : 'Plan usage not granted at sign-in'} ·{' '}
            <button className="link" onClick={() => void api.openUsage()}>
              Manage usage
            </button>
          </div>
        </div>
      </main>

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
  )
}

function Message({ m, typing }: { m: ChatMessage; typing: boolean }): React.JSX.Element {
  if (m.role === 'user')
    return (
      <div className="msg user">
        {m.attachments && m.attachments.length > 0 && (
          <div className="msg-attachments">
            {m.attachments.map((a) =>
              a.kind === 'image' ? (
                <img key={a.id} src={a.data} alt={a.name} className="msg-image" />
              ) : (
                <div key={a.id} className="attach file in-msg">
                  <span className="file-badge">{a.kind === 'pdf' ? 'PDF' : 'TXT'}</span>
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
    <div className="msg assistant">
      <img src={icon} alt="" className="sprout" />
      <div className="body">
        {m.text ? (
          <Markdown text={m.text} streaming={typing} />
        ) : typing ? (
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
        ) : null}
        {m.error && m.error !== 'Stopped.' && <div className="error">{m.error}</div>}
        {m.error === 'Stopped.' && <div className="stopped">Stopped</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- theme switch

const NEXT_THEME: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_NAME: Record<ThemeChoice, string> = { system: 'Match Windows', light: 'Light', dark: 'Dark' }

function ThemeButton({ choice, onChange }: { choice: ThemeChoice; onChange: (c: ThemeChoice) => void }): React.JSX.Element {
  const icon =
    choice === 'light' ? (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
      </svg>
    ) : choice === 'dark' ? (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
      </svg>
    ) : (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="12.5" rx="2" />
        <path d="M8.5 20.5h7M12 16.5v4" />
      </svg>
    )
  return (
    <button className="theme-btn" title={`Theme: ${THEME_NAME[choice]} (click for ${THEME_NAME[NEXT_THEME[choice]]})`} onClick={() => onChange(NEXT_THEME[choice])}>
      {icon}
    </button>
  )
}
