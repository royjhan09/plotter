import type { Theme } from './theme'

/** The rail's and top bar's line icons. */
export function RailIcon({ name }: { name: 'new' | 'chats' | 'home' | 'customize' | 'search' | 'settings' | 'pin' | 'unpin' | 'market' | 'kits' | 'roles' }): React.JSX.Element {
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
  if (name === 'roles')
    return (
      <svg {...common}>
        <path d="M7.5 7.5h9" />
        <path d="M9 7.5 10 3.5h4l1 4" />
        <circle cx="12" cy="11.5" r="3" />
        <path d="M5.5 20.5c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5" />
        <path d="m12 15.5-1 2 1 2.5 1-2.5Z" />
      </svg>
    )
  if (name === 'market')
    return (
      <svg {...common}>
        <path d="M4 9.5 5.5 4h13L20 9.5" />
        <path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" />
        <path d="M5.5 12.5V20h13v-7.5M10 20v-4.5h4V20" />
      </svg>
    )
  if (name === 'kits')
    return (
      <svg {...common}>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
        <circle cx="17" cy="7" r="3.5" />
        <path d="M7 13.5 10.5 20h-7Z" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="3.5" />
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

/** One click switches light ↔ dark. The icon shows where the click takes you. */
export function ThemeButton({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }): React.JSX.Element {
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
