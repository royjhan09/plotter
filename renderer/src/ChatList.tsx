import { useEffect, useRef, useState } from 'react'
import type { ChatMetaPatch, ChatSummary } from '../../shared/api'
import { ClaudeBuddy } from './ClaudeCode'
import icon from '../../assets/icon.png'

/** Small line icons for the chat rows and their ⋯ menu. */
function Icon({ name }: { name: 'pin' | 'unpin' | 'more' | 'rename' | 'pdf' | 'archive' | 'unarchive' | 'trash' | 'chevron' | 'split' }): React.JSX.Element {
  const p = { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'pin':
      return (
        <svg {...p}>
          <path d="M9 4h6l-1 6 3 3H7l3-3-1-6Z" />
          <path d="M12 13v7" />
        </svg>
      )
    case 'unpin':
      return (
        <svg {...p}>
          <path d="M9 4h6l-1 6 3 3H7l3-3-1-6Z" />
          <path d="M12 13v7M4 4l16 16" />
        </svg>
      )
    case 'more':
      return (
        <svg {...p} strokeWidth={2.6}>
          <path d="M5 12h.01M12 12h.01M19 12h.01" />
        </svg>
      )
    case 'rename':
      return (
        <svg {...p}>
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      )
    case 'pdf':
      return (
        <svg {...p}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
          <path d="M14 3v5h5M12 11v6M9.5 14.5 12 17l2.5-2.5" />
        </svg>
      )
    case 'archive':
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="5" rx="1.5" />
          <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" />
        </svg>
      )
    case 'unarchive':
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="5" rx="1.5" />
          <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M12 18v-6M9.5 14.5 12 12l2.5 2.5" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...p}>
          <path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13M10 11v6M14 11v6" />
        </svg>
      )
    case 'split':
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <path d="M12 4v16" />
        </svg>
      )
    case 'chevron':
      return (
        <svg {...p}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      )
  }
}

interface Props {
  chats: ChatSummary[]
  /** The chats open on the left and right. */
  activeIds: string[]
  query: string
  /** False while the panel is closed: any open menu or rename is dropped. */
  visible: boolean
  onOpen: (id: string) => void
  onUpdate: (id: string, patch: ChatMetaPatch) => void
  onDelete: (chat: ChatSummary) => void
  onPdf: (chat: ChatSummary) => void
  /** Open this chat on the other side (side by side). */
  onOpenBeside: (id: string) => void
  /** A row started being dragged (towards the chat area). */
  onDragStart: () => void
}

/**
 * The chat list, as in ChatGPT: rows show only the title until hovered; then a pin button and a ⋯ menu
 * (Pin, Rename, Convert to PDF, Archive, Delete) appear. Pinned chats sit on top; archived ones fold away at the bottom.
 */
export function ChatList({ chats, activeIds, query, visible, onOpen, onUpdate, onDelete, onPdf, onOpenBeside, onDragStart }: Props): React.JSX.Element {
  const [menu, setMenu] = useState<{ id: string; left: number; top: number } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const q = query.trim().toLowerCase()
  const match = (c: ChatSummary): boolean => !q || c.title.toLowerCase().includes(q)
  const pinned = chats.filter((c) => c.pinned && !c.archived && match(c))
  const recent = chats.filter((c) => !c.pinned && !c.archived && match(c))
  const archived = chats.filter((c) => c.archived && match(c))
  const menuChat = menu ? chats.find((c) => c.id === menu.id) : undefined

  useEffect(() => {
    if (!visible) {
      setMenu(null)
      setRenaming(null)
    }
  }, [visible])

  // The open menu: a click elsewhere or Esc closes it; P, R, A and Delete are its shortcuts.
  useEffect(() => {
    if (!menuChat) return
    const away = (e: MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null)
    }
    const keys = (e: KeyboardEvent): void => {
      const k = e.key.toLowerCase()
      if (k === 'escape') return setMenu(null)
      const run: Record<string, () => void> = {
        p: () => !menuChat.archived && onUpdate(menuChat.id, { pinned: !menuChat.pinned }),
        r: () => setRenaming(menuChat.id),
        a: () => onUpdate(menuChat.id, { archived: !menuChat.archived }),
        delete: () => onDelete(menuChat)
      }
      if (run[k]) {
        e.preventDefault()
        setMenu(null)
        run[k]()
      }
    }
    document.addEventListener('mousedown', away)
    window.addEventListener('keydown', keys)
    return () => {
      document.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', keys)
    }
  }, [menuChat, onUpdate, onDelete])

  const openMenu = (e: React.MouseEvent, id: string): void => {
    e.stopPropagation()
    if (menu?.id === id) return setMenu(null)
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const height = 270
    const top = r.bottom + 4 + height > window.innerHeight ? Math.max(8, r.top - height - 4) : r.bottom + 4
    setMenu({ id, left: Math.min(r.left - 8, window.innerWidth - 220), top })
  }

  const row = (c: ChatSummary): React.JSX.Element => (
    <div
      key={c.id}
      className={`chat-item ${c.kind === 'claude' ? 'claude' : 'chatgpt'} ${activeIds.includes(c.id) ? 'active' : ''} ${menu?.id === c.id ? 'menu-open' : ''} ${renaming === c.id ? 'renaming' : ''}`}
      onClick={() => renaming !== c.id && onOpen(c.id)}
      draggable={renaming !== c.id}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-plotter-chat', c.id)
        e.dataTransfer.effectAllowed = 'move'
        setMenu(null)
        onDragStart()
      }}
      title={c.kind === 'claude' ? 'Claude Code chat. Drag to the right side to open it beside another chat' : 'Drag to the right side to open it beside another chat'}
    >
      <span className="chat-kind">{c.kind === 'claude' ? <ClaudeBuddy size={18} /> : <img src={icon} alt="" />}</span>
      {renaming === c.id ? (
        <RenameInput
          initial={c.title}
          onDone={(title) => {
            setRenaming(null)
            if (title && title !== c.title) onUpdate(c.id, { title })
          }}
        />
      ) : (
        <span className="chat-title" title={c.title}>
          {c.title}
        </span>
      )}
      {renaming !== c.id && (
        <span className="row-tools">
          {c.archived ? (
            <button className="row-btn" title="Unarchive" onClick={(e) => (e.stopPropagation(), onUpdate(c.id, { archived: false }))}>
              <Icon name="unarchive" />
            </button>
          ) : (
            <button className={`row-btn ${c.pinned ? 'on' : ''}`} title={c.pinned ? 'Unpin' : 'Pin'} onClick={(e) => (e.stopPropagation(), onUpdate(c.id, { pinned: !c.pinned }))}>
              <Icon name={c.pinned ? 'unpin' : 'pin'} />
            </button>
          )}
          <button className="row-btn" title="More" aria-haspopup="menu" aria-expanded={menu?.id === c.id} onClick={(e) => openMenu(e, c.id)}>
            <Icon name="more" />
          </button>
        </span>
      )}
    </div>
  )

  const item = (icon: Parameters<typeof Icon>[0]['name'], label: string, key: string, run: () => void, danger = false): React.JSX.Element => (
    <button
      role="menuitem"
      className={`row-menu-item ${danger ? 'danger' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        setMenu(null)
        run()
      }}
    >
      <Icon name={icon} />
      <span>{label}</span>
      {key && <kbd>{key}</kbd>}
    </button>
  )

  return (
    <div className="chat-scroll" onScroll={() => setMenu(null)}>
      {pinned.length > 0 && (
        <>
          <div className="chat-list-label">Pinned</div>
          <nav className="chat-list">{pinned.map(row)}</nav>
        </>
      )}
      <div className="chat-list-label">{q ? `Matching “${query.trim()}”` : 'Recent'}</div>
      <nav className="chat-list">
        {recent.length === 0 && <p className="empty-list">{q ? 'No chats match.' : pinned.length ? 'Everything else is pinned.' : 'No chats yet. Plant the first one.'}</p>}
        {recent.map(row)}
      </nav>
      {archived.length > 0 && (
        <>
          <button className={`chat-list-label archived-toggle ${showArchived || q ? 'open' : ''}`} onClick={() => setShowArchived(!showArchived)}>
            <Icon name="chevron" />
            Archived · {archived.length}
          </button>
          {(showArchived || q) && <nav className="chat-list archived">{archived.map(row)}</nav>}
        </>
      )}

      {menu && menuChat && (
        <div ref={menuRef} className="row-menu" role="menu" style={{ left: menu.left, top: menu.top }} onClick={(e) => e.stopPropagation()}>
          {!menuChat.archived && item(menuChat.pinned ? 'unpin' : 'pin', menuChat.pinned ? 'Unpin' : 'Pin', 'P', () => onUpdate(menuChat.id, { pinned: !menuChat.pinned }))}
          {item('rename', 'Rename', 'R', () => setRenaming(menuChat.id))}
          {item('split', 'Open side by side', '', () => onOpenBeside(menuChat.id))}
          {item('pdf', 'Convert to PDF', '', () => onPdf(menuChat))}
          {item(menuChat.archived ? 'unarchive' : 'archive', menuChat.archived ? 'Unarchive' : 'Archive', 'A', () => onUpdate(menuChat.id, { archived: !menuChat.archived }))}
          <div className="row-menu-sep" />
          {item('trash', 'Delete', '', () => onDelete(menuChat), true)}
        </div>
      )}
    </div>
  )
}

/** Renames in place: Enter or clicking away saves, Esc cancels. */
function RenameInput({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }): React.JSX.Element {
  const [value, setValue] = useState(initial)
  const done = useRef(false)
  const finish = (title: string | null): void => {
    if (done.current) return
    done.current = true
    onDone(title)
  }
  return (
    <input
      className="rename-input"
      autoFocus
      value={value}
      maxLength={200}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(value.trim() || null)
        if (e.key === 'Escape') {
          e.stopPropagation()
          finish(null)
        }
      }}
      onBlur={() => finish(value.trim() || null)}
    />
  )
}
