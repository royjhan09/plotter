import { useEffect, useState } from 'react'
import type { MessageModes, Project, ToolPick } from '../../shared/api'

const api = window.plotter

type IconName = 'files' | 'library' | 'image' | 'search' | 'project' | 'research' | 'sketch' | 'claude' | 'google' | 'notion' | 'back' | 'check' | 'plus'

/** The + menu's icons: small and colourful, as in ChatGPT's menu. */
export function MenuIcon({ name }: { name: IconName }): React.JSX.Element {
  const p = { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (name) {
    case 'files':
      return (
        <svg {...p} stroke="#8a8f98">
          <path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
        </svg>
      )
    case 'library':
      return (
        <svg {...p}>
          <rect x="6.5" y="3.5" width="12" height="15" rx="2" fill="#e4e6ea" stroke="#b9bec6" />
          <rect x="4" y="6" width="12" height="15" rx="2" fill="#f4f5f7" stroke="#9aa0a8" />
        </svg>
      )
    case 'image':
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="16" rx="3.5" fill="#7cc8ff" />
          <path d="M3 16.5 8.5 11l4 4 2.5-2.5L21 18v-.5" fill="#ffd25a" stroke="#ffb020" strokeWidth="1.4" />
          <circle cx="15.5" cy="8.5" r="1.8" fill="#fff6c9" />
        </svg>
      )
    case 'search':
      return (
        <svg {...p} stroke="#2f9be8">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.3 3.8 8.5s-1.2 6.1-3.8 8.5M12 3.5C9.4 5.9 8.2 8.8 8.2 12s1.2 6.1 3.8 8.5" />
        </svg>
      )
    case 'project':
      return (
        <svg {...p} stroke="#5c636c">
          <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6l2 2.2h7.4A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z" />
        </svg>
      )
    case 'research':
      return (
        <svg {...p}>
          <path d="m4 14 9-6.5 2.5 3.5-9 6.5Z" fill="#4c8dff" stroke="#2f6fe0" strokeWidth="1.3" />
          <path d="m15 7 2.6-1.9 2.5 3.5-2.6 1.9Z" fill="#ff8a5c" stroke="#e8673a" strokeWidth="1.3" />
          <path d="M9 14.5 7.5 20M11 13l2.5 6.5" stroke="#5c636c" strokeWidth="1.5" />
        </svg>
      )
    case 'sketch':
      return (
        <svg {...p} stroke="#17b890" strokeWidth="2.2">
          <path d="M4 17c2.5-6 5-9 6.5-7.5S8 15 10 16.5s4.5-6.5 6.5-5S15 17 17 17.5c1.2.3 2.2-.7 3-1.8" />
        </svg>
      )
    case 'claude':
      return (
        <svg {...p} stroke="#5c636c">
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="m7 10 3 2-3 2M12.5 14.5H17" />
        </svg>
      )
    case 'google':
      return (
        <svg {...p} strokeWidth="2.4">
          <path d="M20 12.2c0-.6 0-1.1-.1-1.6H12v3.1h4.5a3.9 3.9 0 0 1-1.7 2.5" stroke="#4285f4" />
          <path d="M14.8 16.2A5 5 0 0 1 7.3 13.6" stroke="#34a853" />
          <path d="M7.3 13.6a5 5 0 0 1 0-3.2" stroke="#fbbc05" />
          <path d="M7.3 10.4A5 5 0 0 1 15.4 8.4" stroke="#ea4335" />
        </svg>
      )
    case 'notion':
      return (
        <svg {...p} stroke="#222">
          <rect x="4" y="4" width="16" height="16" rx="2.5" />
          <path d="M9 16V8.5l6 7.5V8" />
        </svg>
      )
    case 'back':
      return (
        <svg {...p} stroke="currentColor">
          <path d="M15 5 8 12l7 7" />
        </svg>
      )
    case 'check':
      return (
        <svg {...p} stroke="currentColor" strokeWidth="2.4">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      )
    case 'plus':
      return (
        <svg {...p} stroke="currentColor">
          <path d="M12 5v14M5 12h14" />
        </svg>
      )
  }
}

/**
 * The + menu, laid out like ChatGPT's: a wide list of what can go with the next message, each with an icon
 * and a grey line saying what it does, then the tools you connected ($gmail…).
 */
export function PlusMenu(p: {
  research: boolean
  modes: MessageModes
  projects?: Project[]
  canSketch: boolean
  canLibrary: boolean
  onClose: () => void
  onFiles: () => void
  onLibrary: () => void
  onSketch: () => void
  onResearch: (on: boolean) => void
  onModes: (m: MessageModes) => void
  onStartInProject?: (id: string) => void
  onClaudeCode?: () => void
}): React.JSX.Element {
  const [view, setView] = useState<'main' | 'projects'>('main')
  const [tools, setTools] = useState<(ToolPick & { desc: string })[]>([])
  useEffect(() => {
    void Promise.all([api.connectors.list().catch(() => []), api.market.list().catch(() => [])]).then(([cons, market]) =>
      setTools([
        ...cons
          .filter((c) => c.connected && c.enabled)
          .map((c) => ({ id: `connector:${c.id}`, name: c.id === 'google' ? 'Google' : c.name, kind: 'connector' as const, desc: c.covers })),
        ...market.filter((t) => t.connected).map((t) => ({ id: `market:${t.id}`, name: t.name, kind: 'market' as const, icon: t.icon, desc: t.description }))
      ])
    )
  }, [])
  const picked = new Set((p.modes.tools ?? []).map((t) => t.id))
  const run = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
    p.onClose()
  }
  const item = (icon: React.ReactNode, label: string, desc: string, onClick: (e: React.MouseEvent) => void, on = false, more = false): React.JSX.Element => (
    <button className={`plus-item ${on ? 'on' : ''}`} role="menuitem" onClick={onClick}>
      <span className="plus-icon">{icon}</span>
      <span className="plus-label">{label}</span>
      <span className="plus-desc">{desc}</span>
      {on && (
        <span className="plus-check">
          <MenuIcon name="check" />
        </span>
      )}
      {more && <span className="plus-more">›</span>}
    </button>
  )

  if (view === 'projects')
    return (
      <div className="plus-menu" role="menu" onClick={(e) => e.stopPropagation()}>
        <button className="plus-item plus-back" onClick={() => setView('main')}>
          <span className="plus-icon">
            <MenuIcon name="back" />
          </span>
          <span className="plus-label">Start in a project</span>
        </button>
        <div className="plus-sep" />
        <div className="plus-list">
          {(p.projects ?? []).map((pr) =>
            item(<MenuIcon name="project" />, pr.name, `${pr.notes.length} shared note${pr.notes.length === 1 ? '' : 's'}`, run(() => p.onStartInProject?.(pr.id)))
          )}
          {item(<MenuIcon name="plus" />, 'New project', 'Make a project and start this chat in it', run(() => p.onStartInProject?.('new')))}
        </div>
      </div>
    )

  return (
    <div className="plus-menu" role="menu" onClick={(e) => e.stopPropagation()}>
      <div className="plus-list">
        {item(<MenuIcon name="files" />, 'Add photos & files', 'Upload from this PC', run(p.onFiles))}
        {p.canLibrary && item(<MenuIcon name="library" />, 'Import from library', 'Files and pictures from your chats', run(p.onLibrary))}
        {item(<MenuIcon name="image" />, 'Image generation', 'Make a picture of anything', run(() => p.onModes({ ...p.modes, image: !p.modes.image })), !!p.modes.image)}
        {item(<MenuIcon name="search" />, 'Web search', 'Find real-time news and information', run(() => p.onModes({ ...p.modes, search: !p.modes.search })), !!p.modes.search)}
        {p.onStartInProject &&
          item(
            <MenuIcon name="project" />,
            'Start in a project',
            'Start a chat that shares a project’s memory',
            (e) => {
              e.stopPropagation()
              setView('projects')
            },
            false,
            true
          )}
        {item(<MenuIcon name="research" />, 'Deep research', 'Get a detailed, cited report', run(() => p.onResearch(!p.research)), p.research)}
        {p.canSketch && item(<MenuIcon name="sketch" />, 'Sketch', 'Draw a picture and attach it', run(p.onSketch))}
        {p.onClaudeCode && item(<MenuIcon name="claude" />, 'Send to Claude Code', 'Hand a coding task to Claude Code', run(p.onClaudeCode))}
        {tools.length > 0 && <div className="plus-sep" />}
        {tools.map((t) =>
          item(
            t.kind === 'connector' ? <MenuIcon name={t.id === 'connector:notion' ? 'notion' : 'google'} /> : <span className="plus-emoji">{t.icon || '🧩'}</span>,
            t.name,
            t.desc,
            run(() => {
              const now = p.modes.tools ?? []
              const { desc: _d, ...pick } = t
              p.onModes({ ...p.modes, tools: picked.has(t.id) ? now.filter((x) => x.id !== t.id) : [...now, pick] })
            }),
            picked.has(t.id)
          )
        )}
      </div>
    </div>
  )
}
