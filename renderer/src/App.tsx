import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AuthState, CanvasDoc, ChatKind, ChatMetaPatch, ChatSummary, Model } from '../../shared/api'
import { useThemeSetting } from './theme'
import { CanvasContext, CanvasPanel } from './Canvas'
import { CustomizePanel, Settings, type Tab as SettingsTab } from './Settings'
import { PdfPreview } from './PdfPreview'
import { ChatList } from './ChatList'
import { ClaudeBuddy } from './ClaudeCode'
import { ChatPane, announceRename, cleanError } from './ChatPane'
import { RailIcon } from './RailIcon'
import icon from '../../assets/icon.png'

const api = window.plotter
const EFFORT_KEY = 'plotter.effort'

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

function ChatApp({ auth, setAuth }: { auth: Extract<AuthState, { signedIn: true }>; setAuth: (s: AuthState) => void }): React.JSX.Element {
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [model, setModel] = useState<Model | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)
  const [effort, setEffortState] = useState<string>('')
  const [toast, setToast] = useState<string | null>(null)
  const [pdf, setPdf] = useState<{ bytes: Uint8Array | null; name: string; error?: string } | null>(null)
  const pdfJob = useRef(0)
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null)
  const [showWelcome, setShowWelcome] = useState(auth.planUsage && !auth.welcomeSeen)
  const [theme, setTheme] = useThemeSetting()
  const [accountMenu, setAccountMenu] = useState(false)

  // Two sides: the left chat always; the right one when split. Each can show any chat, of either kind.
  const [leftId, setLeftId] = useState<string | null>(null)
  const [rightId, setRightId] = useState<string | null>(null)
  const [split, setSplit] = useState(false)
  const [focus, setFocus] = useState<'left' | 'right'>('left')
  const [dropSide, setDropSide] = useState<'left' | 'right' | null>(null)
  const side = split ? focus : 'left'
  const setSideId = (s: 'left' | 'right', id: string | null): void => (s === 'left' ? setLeftId(id) : setRightId(id))
  // What a side's *new* chat is (a ChatGPT chat, or a Claude Code chat), and text to start its message box with.
  const [leftNew, setLeftNew] = useState<{ kind: ChatKind; seed?: string; n: number }>({ kind: 'chatgpt', n: 0 })
  const [rightNew, setRightNew] = useState<{ kind: ChatKind; seed?: string; n: number }>({ kind: 'chatgpt', n: 0 })
  const setSideNew = (s: 'left' | 'right', kind: ChatKind, seed?: string): void =>
    (s === 'left' ? setLeftNew : setRightNew)((prev) => ({ kind, seed, n: prev.n + 1 }))
  const onLeftId = useCallback((id: string | null) => setLeftId(id), [])
  const onRightId = useCallback((id: string | null) => setRightId(id), [])

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
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('account')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = (tab: SettingsTab): void => {
    setSettingsTab(tab)
    setSettingsOpen(true)
    setPanel(null)
  }
  const [canvas, setCanvas] = useState<CanvasDoc | null>(null)
  const canvasApi = useMemo(() => ({ open: (doc: CanvasDoc) => setCanvas(doc), current: canvas }), [canvas])

  const refreshList = useCallback(() => void api.chats.list().then(setChats), [])
  const showToast = useCallback((m: string) => setToast(m), [])

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

  /** Opens a chat on a side (the focused one unless given). Already open on the other side: just go there. */
  const openChat = (id: string, where: 'left' | 'right' = side): void => {
    setSettingsOpen(false)
    if (where === 'right') setSplit(true)
    const other = where === 'left' ? rightId : leftId
    if (split && other === id && where !== side) return setFocus(where === 'left' ? 'right' : 'left')
    if (split && other === id) {
      // dropped on the other side: swap the two
      setSideId(where === 'left' ? 'right' : 'left', where === 'left' ? leftId : rightId)
    }
    setSideId(where, id)
    setFocus(where)
  }

  const newChat = (): void => {
    setSettingsOpen(false)
    setSideNew(side, 'chatgpt')
    setSideId(side, null)
  }

  /** Opens a new Claude Code chat right away (on this side, or beside it), optionally with its first message typed in. */
  const newClaudeChat = (beside: boolean, seed?: string): void => {
    setSettingsOpen(false)
    const where: 'left' | 'right' = beside ? (side === 'left' ? 'right' : 'left') : side
    if (where === 'right') setSplit(true)
    setSideNew(where, 'claude', seed)
    setSideId(where, null)
    setFocus(where)
  }

  const closeRight = (): void => {
    setSplit(false)
    setRightId(null)
    setFocus('left')
  }

  /** Converts a whole chat, or one reply with its question, to a PDF and shows it; Download in the preview saves it. */
  const savePdf = useCallback((messageId: string | undefined, target: { id: string; title: string }): void => {
    const job = ++pdfJob.current
    setPdf({ bytes: null, name: target.title || 'Plotter chat' }) // the preview opens at once, saying Converting…
    api.pdf.make(target.id, messageId).then(
      (bytes) => {
        if (pdfJob.current === job) setPdf((p) => p && { ...p, bytes })
        else void api.pdf.discard() // closed while converting
      },
      (e: unknown) => {
        if (pdfJob.current === job) setPdf((p) => p && { ...p, error: e instanceof Error ? e.message : String(e) })
      }
    )
  }, [])
  const closePdf = (): void => {
    pdfJob.current++
    setPdf(null)
    void api.pdf.discard()
  }

  /** Rename, pin or archive from the chat list's ⋯ menu; a renamed open chat shows its new name at once. */
  const updateChat = useCallback((id: string, patch: ChatMetaPatch): void => {
    void api.chats.update(id, patch).then(setChats)
    if (patch.title) announceRename(id, patch.title)
  }, [])

  const removeChat = async (id: string): Promise<void> => {
    await api.chats.remove(id)
    if (leftId === id) setLeftId(null)
    if (rightId === id) setRightId(null)
    refreshList()
  }

  const signOut = async (): Promise<void> => {
    setAuth(await api.auth.signOut())
  }

  // Dragging a chat from the list: drop it on the right half to open it beside, or the left half to open it there.
  const chatDrag = (e: React.DragEvent): boolean => e.dataTransfer.types.includes('application/x-plotter-chat')
  const onPanesDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!chatDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const r = e.currentTarget.getBoundingClientRect()
    setDropSide(e.clientX - r.left > r.width / 2 ? 'right' : 'left')
  }
  const onPanesDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!chatDrag(e)) return
    e.preventDefault()
    const id = e.dataTransfer.getData('application/x-plotter-chat')
    const where = dropSide ?? 'right'
    setDropSide(null)
    if (id) openChat(id, where)
  }

  const paneProps = {
    model,
    modelError,
    loadModel,
    effort,
    setEffort,
    planUsage: auth.planUsage,
    refreshList,
    toast: showToast,
    savePdf,
    pdfBusy: !!pdf,
    theme,
    setTheme
  }

  return (
    <CanvasContext.Provider value={canvasApi}>
    <div className={`shell ${canvas ? 'with-canvas' : ''} ${pinned ? 'pinned' : ''}`}>
      {/* The rail: always there. Hovering an icon slides its panel out (Chats, Customize); a docked panel stays. */}
      <nav className="rail">
        <div className="rail-top">
          <button className="rail-logo" title="New chat" onClick={newChat}>
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
          <button className={`rail-btn ${settingsOpen ? 'on' : ''}`} title="Settings" onClick={() => (settingsOpen ? setSettingsOpen(false) : openSettings('general'))}>
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
              onSettings={() => openSettings('account')}
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
            <button className="side-item" onClick={newChat}>
              <RailIcon name="new" /> New chat
            </button>
            <button className="side-item claude-new" onClick={() => newClaudeChat(false)}>
              <ClaudeBuddy size={20} /> New Claude Code chat
            </button>
            <ChatList
              chats={chats}
              activeIds={[leftId, split ? rightId : null].filter((x): x is string => !!x)}
              query={query}
              visible={shownPanel === 'chats'}
              onOpen={(id) => {
                openChat(id)
                if (!pinned) setPanel(null)
              }}
              onUpdate={updateChat}
              onDelete={(c) => setDeleting({ id: c.id, title: c.title })}
              onPdf={(c) => savePdf(undefined, c)}
              onOpenBeside={(id) => {
                openChat(id, side === 'left' || !split ? 'right' : 'left')
                if (!pinned) setPanel(null)
              }}
              onDragStart={() => {
                if (!pinned) setTimeout(() => setPanel(null), 0)
              }}
            />
          </>
        )}
      </aside>

      {settingsOpen && (
        <Settings
          initialTab={settingsTab}
          onClose={() => setSettingsOpen(false)}
          account={auth.account}
          planUsage={auth.planUsage}
          theme={theme}
          setTheme={setTheme}
          onUsage={() => void api.openUsage()}
          onSignOut={() => void signOut()}
          chats={chats}
          onOpenChat={(id) => openChat(id)}
          onUpdateChat={updateChat}
          onDeleteChat={(c) => setDeleting({ id: c.id, title: c.title })}
        />
      )}

      <div
        className={`panes ${split ? 'split' : ''}`}
        hidden={settingsOpen}
        onDragOver={onPanesDragOver}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropSide(null)
        }}
        onDrop={onPanesDrop}
      >
        <ChatPane {...paneProps} chatId={leftId} onChatId={onLeftId} side="left" split={split} focused={!split || focus === 'left'} onFocus={() => setFocus('left')} newChat={leftNew} onSendToClaude={(task) => newClaudeChat(true, task)} />
        {split && (
          <ChatPane
            {...paneProps}
            chatId={rightId}
            onChatId={onRightId}
            side="right"
            split
            focused={focus === 'right'}
            onFocus={() => setFocus('right')}
            onClose={closeRight}
            newChat={rightNew}
            onSendToClaude={(task) => newClaudeChat(true, task)}
          />
        )}
        {dropSide && (
          <div className="drop-zones">
            <div className={`drop-zone ${dropSide === 'left' ? 'on' : ''}`}>{split ? 'Open on the left' : 'Open here'}</div>
            <div className={`drop-zone ${dropSide === 'right' ? 'on' : ''}`}>{split ? 'Open on the right' : 'Open side by side'}</div>
          </div>
        )}
      </div>

      {canvas && !settingsOpen && <CanvasPanel doc={canvas} onChange={setCanvas} onClose={() => setCanvas(null)} />}

      {toast && (
        <div className="toast floating" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}

      {pdf && <PdfPreview bytes={pdf.bytes} name={pdf.name} error={pdf.error} onClose={closePdf} />}

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


// ---------------------------------------------------------------- theme switch and account menu

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
