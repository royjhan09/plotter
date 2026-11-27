import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AuthState, CanvasDoc, ChatKind, ChatMetaPatch, ChatSummary, HandOff, Model, Project, BesideChat } from '../../shared/api'
import { useThemeSetting } from './theme'
import { CanvasContext, CanvasPanel } from './Canvas'
import { CustomizePanel, Settings, type Tab as SettingsTab } from './Settings'
import { PDF_EXPORT, PdfPreview } from '@private/renderer/PdfPreview'
import { ChatList } from './ChatList'
import { ProjectPage } from './Projects'
import { ClaudeBuddy } from './ClaudeBuddy'
import { CLAUDE_CODE } from '@private/renderer/ClaudeCode'
import { ChatPane, announceRename, cleanError } from './ChatPane'
import { RailIcon } from './RailIcon'
import { MARKET, Market } from '@private/renderer/Market'
import { KITS, Kits } from '@private/renderer/Kits'
import icon from '../../assets/sprout.svg'

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
  type NewChat = { kind: ChatKind; seed?: string; from?: HandOff; projectId?: string; n: number }
  const [leftNew, setLeftNew] = useState<NewChat>({ kind: 'chatgpt', n: 0 })
  const [rightNew, setRightNew] = useState<NewChat>({ kind: 'chatgpt', n: 0 })
  const setSideNew = (s: 'left' | 'right', kind: ChatKind, seed?: string, from?: HandOff, projectId?: string): void =>
    (s === 'left' ? setLeftNew : setRightNew)((prev) => ({ kind, seed, from, projectId, n: prev.n + 1 }))
  // Which kind of chat each side shows (a side's new chat may have been switched from its own menu).
  const [paneKind, setPaneKind] = useState<Record<'left' | 'right', ChatKind>>({ left: 'chatgpt', right: 'chatgpt' })
  const onLeftKind = useCallback((k: ChatKind) => setPaneKind((p) => (p.left === k ? p : { ...p, left: k })), [])
  const onRightKind = useCallback((k: ChatKind) => setPaneKind((p) => (p.right === k ? p : { ...p, right: k })), [])
  // What one side's chat sent to the other (that side answers it right away).
  const [leftIn, setLeftIn] = useState<{ from: HandOff; n: number; attach?: boolean } | undefined>(undefined)
  const [rightIn, setRightIn] = useState<{ from: HandOff; n: number; attach?: boolean } | undefined>(undefined)
  useEffect(
    () =>
      api.onSideDelivery((d) => {
        const set = d.pane === 'left' ? setLeftIn : setRightIn
        set((prev) => ({ from: d.from, n: (prev?.n ?? 0) + 1 }))
      }),
    []
  )
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
  // While a chat is dragged out of the panel, the panel must stay (hiding the dragged row cancels the drag).
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)
  /** The chat being dragged from the list (kept here, so the drop never depends on what the browser passes along). */
  const dragChat = useRef<string | null>(null)
  const hoverOut = (): void => {
    if (draggingRef.current) return
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
  const [marketOpen, setMarketOpen] = useState(false)
  const [kitsOpen, setKitsOpen] = useState(false)
  // Projects: groups of chats with a shared memory; one project's page can be open instead of the chats.
  const [projects, setProjects] = useState<Project[]>([])
  const [projectOpen, setProjectOpen] = useState<string | null>(null)
  const refreshProjects = useCallback(() => void api.projects.list().then(setProjects), [])
  useEffect(() => {
    refreshProjects()
    return api.projects.onChanged(refreshProjects)
  }, [refreshProjects])
  const openSettings = (tab: SettingsTab): void => {
    setMarketOpen(false)
    setKitsOpen(false)
    setProjectOpen(null)
    setSettingsTab(tab)
    setSettingsOpen(true)
    setPanel(null)
  }
  const [canvas, setCanvas] = useState<CanvasDoc | null>(null)
  const canvasApi = useMemo(() => ({ open: (doc: CanvasDoc) => setCanvas(doc), current: canvas }), [canvas])

  const refreshList = useCallback(() => void api.chats.list().then(setChats), [])
  const openProject = projectOpen ? projects.find((p) => p.id === projectOpen) : undefined
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
    setMarketOpen(false)
    setKitsOpen(false)
    setProjectOpen(null)
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
    setMarketOpen(false)
    setKitsOpen(false)
    setProjectOpen(null)
    setSideNew(side, 'chatgpt')
    setSideId(side, null)
  }

  /** Opens a new Claude Code chat right away (on this side, or beside it), optionally with its first message typed in. */
  const newClaudeChat = (beside: boolean, seed?: string, from?: HandOff, projectId?: string): void => {
    setSettingsOpen(false)
    setMarketOpen(false)
    setKitsOpen(false)
    setProjectOpen(null)
    const where: 'left' | 'right' = beside ? (side === 'left' ? 'right' : 'left') : side
    if (where === 'right') setSplit(true)
    setSideNew(where, 'claude', seed, from, projectId)
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
    void api.chats.update(id, patch).then((list) => {
      setChats(list)
      if (patch.projectId !== undefined) refreshProjects()
    })
    if (patch.title) announceRename(id, patch.title)
    if (patch.projectId !== undefined) window.dispatchEvent(new CustomEvent('plotter-chat-project', { detail: { id, projectId: patch.projectId } }))
  }, [refreshProjects])

  /** A new project (with a chat moved into it, when given); its page opens. */
  const newProject = async (chatId?: string): Promise<void> => {
    const from = chatId ? chats.find((c) => c.id === chatId) : undefined
    const p = await api.projects.create(from ? from.title : 'New project')
    if (chatId) updateChat(chatId, { projectId: p.id })
    refreshProjects()
    setSettingsOpen(false)
    setMarketOpen(false)
    setKitsOpen(false)
    setProjectOpen(p.id)
  }
  /** A new chat of a kind inside a project, on the focused side. */
  const newChatInProject = (kind: ChatKind, projectId: string): void => {
    setProjectOpen(null)
    setSettingsOpen(false)
    setMarketOpen(false)
    setKitsOpen(false)
    setSideNew(side, kind, undefined, undefined, projectId)
    setSideId(side, null)
  }
  const sideInfo = (s: 'left' | 'right'): BesideChat => {
    const id = s === 'left' ? leftId : rightId
    const c = id ? chats.find((x) => x.id === id) : undefined
    return { pane: s, chatId: id, kind: c?.kind ?? paneKind[s], title: c?.title ?? '' }
  }

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
  /** A drag from the Chats panel began: a chat (its id) or a new chat ('new:chatgpt' / 'new:claude'). */
  const beginDrag = (what: string): void => {
    dragChat.current = what
    draggingRef.current = true
    clearTimeout(hoverTimer.current)
    // after the drag has begun: let it pass through the panel to the chat area beneath
    setTimeout(() => setDragging(true), 0)
  }
  const startDrag = (e: React.DragEvent, what: string, label: string): void => {
    e.dataTransfer.setData('application/x-plotter-chat', what)
    e.dataTransfer.setData('text/plain', label)
    e.dataTransfer.effectAllowed = 'move'
    beginDrag(what)
  }
  const lastDrag = useRef(0)
  const endDrag = (): void => {
    lastDrag.current = Date.now() // a drag never also counts as a click
    setTimeout(() => (dragChat.current = null), 0)
    draggingRef.current = false
    setDragging(false)
    setDropSide(null)
    if (!pinned) setPanel(null)
  }
  /** A new chat of a kind dropped on a side. */
  const openNew = (kind: ChatKind, where: 'left' | 'right'): void => {
    setSettingsOpen(false)
    setMarketOpen(false)
    setKitsOpen(false)
    if (where === 'right') setSplit(true)
    setProjectOpen(null)
    setSideNew(where, kind)
    setSideId(where, null)
    setFocus(where)
  }

  const chatDrag = (e: React.DragEvent): boolean => !!dragChat.current || e.dataTransfer.types.includes('application/x-plotter-chat')
  const sideAt = (e: React.DragEvent<HTMLDivElement>): 'left' | 'right' => {
    const r = e.currentTarget.getBoundingClientRect()
    return e.clientX - r.left > r.width / 2 ? 'right' : 'left'
  }
  const onPanesDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!chatDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropSide(sideAt(e))
  }
  const onPanesDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!chatDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    const id = dragChat.current ?? (e.dataTransfer.getData('application/x-plotter-chat') || null)
    dragChat.current = null
    setDropSide(null)
    if (id?.startsWith('new:')) openNew(id === 'new:claude' ? 'claude' : 'chatgpt', sideAt(e))
    else if (id) openChat(id, sideAt(e))
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
          {MARKET && (
            <button
              className={`rail-btn ${marketOpen ? 'on' : ''}`}
              title="Market: your tools"
              onClick={() => {
                setSettingsOpen(false)
                setPanel(null)
                setKitsOpen(false)
                setMarketOpen(!marketOpen)
              }}
            >
              <RailIcon name="market" />
            </button>
          )}
          {KITS && (
            <button
              className={`rail-btn ${kitsOpen ? 'on' : ''}`}
              title="Design kits: your rules and components"
              onClick={() => {
                setSettingsOpen(false)
                setMarketOpen(false)
                setProjectOpen(null)
                setPanel(null)
                setKitsOpen(!kitsOpen)
              }}
            >
              <RailIcon name="kits" />
            </button>
          )}
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
      <aside className={`sidebar ${panel ? 'open' : ''} ${dragging ? 'dragging' : ''}`} onMouseEnter={hoverKeep} onMouseLeave={hoverOut}>
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
            <button
              className="side-item"
              title="New ChatGPT chat (or drag it to a side)"
              draggable
              onDragStart={(e) => startDrag(e, 'new:chatgpt', 'New chat')}
              onDragEnd={endDrag}
              onClick={() => Date.now() - lastDrag.current > 400 && newChat()}
            >
              <img src={icon} alt="" className="side-item-icon" /> New chat
            </button>
            {CLAUDE_CODE && (
            <button
              className="side-item claude-new"
              title="New Claude Code chat (or drag it to a side)"
              draggable
              onDragStart={(e) => startDrag(e, 'new:claude', 'New Claude Code chat')}
              onDragEnd={endDrag}
              onClick={() => Date.now() - lastDrag.current > 400 && newClaudeChat(false)}
            >
              <ClaudeBuddy size={20} /> New chat
            </button>
            )}
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
              onPdf={PDF_EXPORT ? (c) => savePdf(undefined, c) : undefined}
              onOpenBeside={(id) => {
                openChat(id, side === 'left' || !split ? 'right' : 'left')
                if (!pinned) setPanel(null)
              }}
              onDragStart={beginDrag}
              onDragEnd={endDrag}
              projects={projects}
              openProjectId={projectOpen}
              onOpenProject={(id) => {
                setSettingsOpen(false)
                setMarketOpen(false)
                setKitsOpen(false)
                setProjectOpen(id)
                if (!pinned) setPanel(null)
              }}
              onNewProject={(id) => void newProject(id)}
              dragged={() => (dragChat.current && !dragChat.current.startsWith('new:') ? dragChat.current : null)}
            />
          </>
        )}
      </aside>

      {marketOpen && !settingsOpen && <Market onClose={() => setMarketOpen(false)} />}
      {kitsOpen && !settingsOpen && !marketOpen && <Kits onClose={() => setKitsOpen(false)} />}

      {openProject && !settingsOpen && !marketOpen && !kitsOpen && (
        <ProjectPage
          project={openProject}
          chats={chats}
          onClose={() => setProjectOpen(null)}
          onOpenChat={(id) => openChat(id)}
          onNewChat={(kind) => newChatInProject(kind, openProject.id)}
          onRemoveChat={(id) => updateChat(id, { projectId: null })}
          onDeleted={() => {
            setProjectOpen(null)
            refreshProjects()
            refreshList()
          }}
          toast={showToast}
        />
      )}

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
        hidden={settingsOpen || marketOpen || kitsOpen || !!openProject}
        onDragOver={onPanesDragOver}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropSide(null)
        }}
        onDrop={onPanesDrop}
      >
        <ChatPane {...paneProps} chatId={leftId} onChatId={onLeftId} side="left" split={split} focused={!split || focus === 'left'} onFocus={() => setFocus('left')} newChat={leftNew} onSendToClaude={(task, from, projectId) => newClaudeChat(true, task, from, projectId)} beside={split ? sideInfo('right') : undefined} incoming={leftIn} projects={projects} onOpenProject={setProjectOpen} onKind={onLeftKind} sendBeside={split ? (from) => setRightIn((prev) => ({ from, attach: true, n: (prev?.n ?? 0) + 1 })) : undefined} />
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
            onSendToClaude={(task, from, projectId) => newClaudeChat(true, task, from, projectId)}
            beside={sideInfo('left')}
            incoming={rightIn}
            projects={projects}
            onOpenProject={setProjectOpen}
            onKind={onRightKind}
            sendBeside={(from) => setLeftIn((prev) => ({ from, attach: true, n: (prev?.n ?? 0) + 1 }))}
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
