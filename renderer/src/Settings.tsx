import { useEffect, useState } from 'react'
import type { ChatMetaPatch, ChatSummary, ConnectorStatus, Features, ImageKeyStatus, MarketTool, Memory, PythonStatus, ToolApproval } from '../../shared/api'
import type { Theme } from './theme'
import { ADVICE_LABEL, VISIBILITY } from './visibility'

const api = window.plotter

export type Tab = 'account' | 'general' | 'features' | 'images' | 'memory' | 'connectors' | 'archived' | 'visibility'

const FEATURE_INFO: { key: keyof Features; name: string; text: string }[] = [
  { key: 'webSearch', name: 'Web search', text: 'Search the web and open links you give. Your question is sent to the web search.' },
  {
    key: 'memory',
    name: 'Memory',
    text: 'Remember things about you across chats (preferences, goals, facts you share). Saved only on this PC; you can see and delete them in the Memory tab.'
  },
  {
    key: 'python',
    name: 'Run Python',
    text: 'Run code for exact maths, data analysis and charts from your Excel/CSV files. Runs in a sandbox on this PC with no internet; downloads Python libraries (numpy, pandas, matplotlib) the first time.'
  },
  { key: 'canvas', name: 'Canvas', text: 'Open long documents and code in an editable side panel next to the chat.' }
]

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }): React.JSX.Element {
  return (
    <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span />
    </button>
  )
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** Line icons for the settings navigation. */
function NavIcon({ tab }: { tab: Tab | 'back' }): React.JSX.Element {
  const p = { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (tab) {
    case 'back':
      return (
        <svg {...p}>
          <path d="M15 5 8 12l7 7" />
        </svg>
      )
    case 'account':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="10" r="3" />
          <path d="M6.5 18.5a6.5 6.5 0 0 1 11 0" />
        </svg>
      )
    case 'general':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
        </svg>
      )
    case 'images':
      return (
        <svg {...p}>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
          <circle cx="9" cy="10" r="1.8" />
          <path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" />
        </svg>
      )
    case 'features':
      return (
        <svg {...p}>
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="10" cy="17" r="2" />
        </svg>
      )
    case 'memory':
      return (
        <svg {...p}>
          <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 0V7a3 3 0 0 0-3-3ZM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 0" />
        </svg>
      )
    case 'connectors':
      return (
        <svg {...p}>
          <path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0ZM12 16v5" />
        </svg>
      )
    case 'visibility':
      return (
        <svg {...p}>
          <path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6Z" />
          <path d="M12 3v18" />
        </svg>
      )
    case 'archived':
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="5" rx="1.5" />
          <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" />
        </svg>
      )
  }
}

const NAV: { group: string; items: { tab: Tab; label: string; words: string }[] }[] = [
  { group: 'Account', items: [{ tab: 'account', label: 'Account', words: 'name email plan usage sign out log out chatgpt' }] },
  {
    group: 'App',
    items: [
      { tab: 'general', label: 'General', words: 'theme appearance dark light mode' },
      { tab: 'features', label: 'Features', words: 'web search python canvas tools' },
      { tab: 'images', label: 'Images', words: 'image picture photo generate draw openai api key gpt-image' },
      { tab: 'memory', label: 'Memory', words: 'remember forget memories' },
      { tab: 'connectors', label: 'Connections', words: 'connectors connections plugins google gmail calendar drive notion permissions sign in mcp' }
    ]
  },
  {
    group: 'Data',
    items: [
      { tab: 'archived', label: 'Archived chats', words: 'archive unarchive delete chats' },
      { tab: 'visibility', label: 'Public & private', words: 'public private github open source repo code visibility privacy' }
    ]
  }
]

export interface SettingsProps {
  initialTab?: Tab
  onClose: () => void
  account: { name?: string; email?: string }
  planUsage: boolean
  theme: Theme
  setTheme: (t: Theme) => void
  onUsage: () => void
  onSignOut: () => void
  chats: ChatSummary[]
  onOpenChat: (id: string) => void
  onUpdateChat: (id: string, patch: ChatMetaPatch) => void
  onDeleteChat: (chat: ChatSummary) => void
  /** Opens the Market (where image generation is set up). */
  onOpenMarket?: () => void
}

/** Settings as its own page (as in ChatGPT): navigation on the left, the chosen section in the middle. */
export function Settings(props: SettingsProps): React.JSX.Element {
  const { initialTab = 'account', onClose } = props
  const [tab, setTab] = useState<Tab>(initialTab)
  const [search, setSearch] = useState('')
  useEffect(() => setTab(initialTab), [initialTab])
  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) onClose()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  const q = search.trim().toLowerCase()
  return (
    <div className="settings-page">
      <nav className="settings-nav">
        <div className="settings-heading">Settings</div>
        <input className="settings-search" placeholder="Search settings" value={search} onChange={(e) => setSearch(e.target.value)} />
        {NAV.map((g) => {
          const items = g.items.filter((i) => !q || `${i.label} ${i.words}`.toLowerCase().includes(q))
          if (!items.length) return null
          return (
            <div key={g.group} className="settings-group">
              <div className="settings-group-label">{g.group}</div>
              {items.map((i) => (
                <button key={i.tab} className={tab === i.tab ? 'on' : ''} onClick={() => setTab(i.tab)}>
                  <NavIcon tab={i.tab} />
                  {i.label}
                </button>
              ))}
            </div>
          )
        })}
      </nav>
      <section className="settings-body">
        <div className="settings-content">
          {tab === 'account' && <AccountTab {...props} />}
          {tab === 'general' && <GeneralTab theme={props.theme} setTheme={props.setTheme} />}
          {tab === 'features' && <FeaturesTab />}
          {tab === 'images' && <ImagesTab onOpenMarket={props.onOpenMarket} />}
          {tab === 'memory' && <MemoryTab />}
          {tab === 'connectors' && <ConnectorsTab onOpenMarket={props.onOpenMarket} />}
          {tab === 'archived' && <ArchivedTab {...props} />}
          {tab === 'visibility' && <VisibilityTab />}
        </div>
      </section>
    </div>
  )
}

function AccountTab({ account, planUsage, onUsage, onSignOut }: SettingsProps): React.JSX.Element {
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <h3>Account</h3>
      <p className="settings-lead">The ChatGPT account Plotter signs in with.</p>
      <div className="setting-row">
        <div className="setting-text">
          <div className="setting-name">Name</div>
          <div className="setting-desc">The name on your ChatGPT account</div>
        </div>
        <span className="setting-value">{account.name || '—'}</span>
      </div>
      <div className="setting-row">
        <div className="setting-text">
          <div className="setting-name">Email</div>
          <div className="setting-desc">The email your ChatGPT account uses</div>
        </div>
        <span className="setting-value">{account.email || '—'}</span>
      </div>
      <div className="setting-row">
        <div className="setting-text">
          <div className="setting-name">Plan usage</div>
          <div className="setting-desc">{planUsage ? 'Replies in Plotter count toward your ChatGPT plan.' : 'Plan usage was not granted at sign-in.'}</div>
        </div>
        <button className="btn ghost" onClick={onUsage}>
          Manage usage
        </button>
      </div>
      <div className="setting-row">
        <div className="setting-text">
          <div className="setting-name">Sign out</div>
          <div className="setting-desc">Sign out of ChatGPT on this PC. Your chats stay here.</div>
        </div>
        {confirm ? (
          <div className="row-actions">
            <button className="btn ghost" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button className="btn danger" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        ) : (
          <button className="btn ghost" onClick={() => setConfirm(true)}>
            Sign out…
          </button>
        )}
      </div>
    </>
  )
}

function GeneralTab({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }): React.JSX.Element {
  return (
    <>
      <h3>General</h3>
      <p className="settings-lead">How Plotter looks on this PC.</p>
      <div className="setting-row">
        <div className="setting-text">
          <div className="setting-name">Theme</div>
          <div className="setting-desc">Light or dark. The moon/sun button on the left switches it too.</div>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {(['light', 'dark'] as Theme[]).map((t) => (
            <button key={t} role="radio" aria-checked={theme === t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>
              {t === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

function ArchivedTab({ chats, onOpenChat, onUpdateChat, onDeleteChat }: SettingsProps): React.JSX.Element {
  const archived = chats.filter((c) => c.archived)
  return (
    <>
      <h3>Archived chats</h3>
      <p className="settings-lead">Chats you archived from the ⋯ menu. They are kept on this PC, just out of the Recent list.</p>
      {archived.length === 0 ? (
        <div className="empty-box">No archived chats.</div>
      ) : (
        archived.map((c) => (
          <div key={c.id} className="setting-row">
            <div className="setting-text">
              <button className="link archived-title" onClick={() => onOpenChat(c.id)}>
                {c.title}
              </button>
              <div className="setting-desc">{new Date(c.updatedAt).toLocaleDateString()}</div>
            </div>
            <div className="row-actions">
              <button className="btn ghost" onClick={() => onUpdateChat(c.id, { archived: false })}>
                Unarchive
              </button>
              <button className="btn ghost danger-text" onClick={() => onDeleteChat(c)}>
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </>
  )
}

function FeaturesTab(): React.JSX.Element {
  const [f, setF] = useState<Features | null>(null)
  const [py, setPy] = useState<PythonStatus>({ state: 'idle' })
  useEffect(() => {
    void api.features.get().then(setF)
    void api.python.status().then(setPy)
    return api.python.onStatus(setPy)
  }, [])
  if (!f) return <div className="muted">Loading…</div>
  return (
    <>
      <h3>Features</h3>
      <p className="settings-lead">Choose what Plotter may do while answering. Spreadsheet and Word attachments are always read on this PC. Deep research is chosen per message in the + menu.</p>
      {FEATURE_INFO.map((x) => (
        <div key={x.key} className="setting-row">
          <div className="setting-text">
            <div className="setting-name">{x.name}</div>
            <div className="setting-desc">{x.text}</div>
            {x.key === 'python' && f.python && py.state !== 'idle' && (
              <div className="setting-status">{py.state === 'ready' ? 'Python is ready' : py.state === 'loading' ? py.detail : `Problem: ${py.message}`}</div>
            )}
          </div>
          <Toggle on={f[x.key]} label={x.name} onChange={(v) => void api.features.set({ [x.key]: v }).then(setF)} />
        </div>
      ))}
    </>
  )
}

/**
 * Pictures: drawn by the chats (free, always on). OpenAI's image model, with the user's own API key, is a
 * ready-made tool in the Market, set up and switched on there.
 */
function ImagesTab({ onOpenMarket }: { onOpenMarket?: () => void }): React.JSX.Element {
  const [st, setSt] = useState<ImageKeyStatus | null>(null)
  useEffect(() => void api.images.status().then(setSt), [])
  if (!st) return <div className="muted">Loading…</div>
  return (
    <>
      <h3>Images</h3>
      <p className="settings-lead">
        Ask any chat for a picture. ChatGPT and Claude Code draw it themselves as a vector picture (free, on your plans): good for icons, logos, illustrations and banners. For photos and detailed artwork, set up Image generation in the Market with your own OpenAI API key.
      </p>
      <div className="setting-row">
        <div className="setting-text">
          <div className="setting-name">Drawn pictures</div>
          <div className="setting-desc">Always on. Each picture can be saved as a PNG.</div>
        </div>
        <span className="setting-value">On</span>
      </div>
      <div className="setting-row">
        <div className="setting-text">
          <div className="setting-name">Image generation (OpenAI)</div>
          <div className="setting-desc">
            {st.models.length === 0
              ? 'Not part of this build.'
              : st.on
                ? `Connected in the Market: ${st.options.model}, key ${st.hint}.`
                : st.set
                  ? 'Set up but switched off in the Market.'
                  : 'A tool in the Market: add your OpenAI API key there to use it.'}
          </div>
        </div>
        {st.models.length > 0 && onOpenMarket && (
          <button className="btn small" onClick={onOpenMarket}>
            Open the Market
          </button>
        )}
      </div>
    </>
  )
}

function MemoryTab(): React.JSX.Element {
  const [list, setList] = useState<Memory[] | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  useEffect(() => void api.memory.list().then(setList), [])
  if (!list) return <div className="muted">Loading…</div>
  return (
    <>
      <h3>Memory</h3>
      <p className="settings-lead">What Plotter remembers about you. It is saved only on this PC and sent with your messages so answers fit you. Ask in a chat to remember or forget something, or delete it here.</p>
      {list.length === 0 ? (
        <div className="empty-box">Nothing remembered yet. Try “Remember that I’m studying for 컴활 2급”.</div>
      ) : (
        <>
          <ul className="memory-list">
            {list
              .slice()
              .reverse()
              .map((m) => (
                <li key={m.id}>
                  <span>{m.text}</span>
                  <span className="memory-date">{new Date(m.at).toLocaleDateString()}</span>
                  <button className="memory-del" title="Forget this" onClick={() => void api.memory.remove(m.id).then(setList)}>
                    ×
                  </button>
                </li>
              ))}
          </ul>
          {confirmClear ? (
            <div className="row-actions">
              <span>Forget all {list.length} memories? This can’t be undone.</span>
              <button className="btn danger" onClick={() => void api.memory.clear().then((l) => (setList(l), setConfirmClear(false)))}>
                Forget all
              </button>
              <button className="btn ghost" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button className="btn ghost" onClick={() => setConfirmClear(true)}>
              Forget everything…
            </button>
          )}
        </>
      )}
    </>
  )
}

const CONN_LEVELS: [ToolApproval, string, string][] = [
  ['ask', 'Always ask', 'Ask before reading or changing anything'],
  ['read', 'Allow read-only tools', 'Read without asking; ask before changes'],
  ['low', 'Allow low-risk tools', 'Low-risk tools run without asking; destructive ones ask'],
  ['all', 'Allow all tools', 'Never ask. Riskier']
]
const levelName = (l: ToolApproval | undefined): string => CONN_LEVELS.find((x) => x[0] === l)?.[1] ?? CONN_LEVELS[2]![1]

const CONN_ICON = {
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  api: 'M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5',
  mcp: 'M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
  chevron: 'm9 6 6 6-6 6'
} as const
const ConnIcon = ({ name, size = 20 }: { name: keyof typeof CONN_ICON; size?: number }): React.JSX.Element => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={CONN_ICON[name]} />
  </svg>
)

type ConnOpen = { kind: 'google' } | { kind: 'notion' } | { kind: 'browser' } | { kind: 'tool'; id: string } | null

/**
 * Connections, laid out like ChatGPT's Settings › Plugins: a default permission, then every connection (Google,
 * Notion, the Market's tools, the browser) with its permission level; each opens to its account, permissions
 * and switch. The Market is where new ones are found.
 */
function ConnectorsTab({ onOpenMarket }: { onOpenMarket?: () => void }): React.JSX.Element {
  const [list, setList] = useState<ConnectorStatus[] | null>(null)
  const [tools, setTools] = useState<MarketTool[]>([])
  const [levels, setLevels] = useState<Record<string, ToolApproval>>({})
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<ConnOpen>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [gid, setGid] = useState('')
  const [gsecret, setGsecret] = useState('')
  const [ntoken, setNtoken] = useState('')
  const load = (): void => {
    void api.connectors.list().then(setList)
    void api.market
      .list()
      .then(setTools)
      .catch(() => setTools([]))
    void api.plugins
      .builtinApproval()
      .then(setLevels)
      .catch(() => setLevels({}))
  }
  useEffect(load, [])
  const act = async <T,>(key: string, f: () => Promise<T>): Promise<void> => {
    setBusy(key)
    setError(null)
    try {
      await f()
      load()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(null)
    }
  }
  if (!list) return <div className="muted">Loading…</div>
  const google = list.find((c) => c.id === 'google')!
  const notion = list.find((c) => c.id === 'notion')!
  const needle = q.trim().toLowerCase()
  const match = (...s: (string | undefined)[]): boolean => !needle || s.join(' ').toLowerCase().includes(needle)
  const def = levels['default'] ?? 'low'

  const status = (c: ConnectorStatus): string => (c.connected ? (c.enabled ? 'Connected' : 'Switched off') : c.configured ? 'Not connected' : 'Not set up')
  const toolStatus = (t: MarketTool): string => (t.mcp?.auth === 'oauth' && !t.signedIn ? 'Not signed in' : !t.connected ? 'Switched off' : t.approval ? levelName(t.approval) : `${levelName(def)} (default)`)

  const rowOf = (key: string, icon: keyof typeof CONN_ICON, name: string, desc: string, right: string, onOpen: () => void): React.JSX.Element => (
    <button key={key} className="conn-row" onClick={onOpen}>
      <span className="conn-icon">
        <ConnIcon name={icon} />
      </span>
      <span className="conn-text">
        <b>{name}</b>
        <span>{desc}</span>
      </span>
      <span className="conn-state">{right}</span>
      <ConnIcon name="chevron" size={16} />
    </button>
  )

  const levelsPicker = (value: ToolApproval | undefined, onPick: (l: ToolApproval) => void): React.JSX.Element => (
    <div className="conn-levels" role="radiogroup">
      {CONN_LEVELS.map(([l, name, line]) => (
        <label key={l} className={`conn-level ${value === l ? 'on' : ''}`}>
          <input type="radio" name="conn-level" checked={value === l} onChange={() => onPick(l)} />
          <span>
            <b>{name}</b>
            <span>{line}</span>
          </span>
        </label>
      ))}
    </div>
  )

  const detailHead = (icon: keyof typeof CONN_ICON, name: string, desc: string, actions?: React.ReactNode): React.JSX.Element => (
    <>
      <div className="conn-crumb">
        <button className="link" onClick={() => (setOpen(null), setError(null))}>
          Connections
        </button>{' '}
        › {name}
      </div>
      <div className="conn-detail-head">
        <span className="conn-icon big">
          <ConnIcon name={icon} size={24} />
        </span>
        <span className="conn-text">
          <b>{name}</b>
          <span>{desc}</span>
        </span>
        {actions}
      </div>
      {error && <div className="settings-error">{error}</div>}
    </>
  )

  if (open?.kind === 'google')
    return (
      <div className="conn-detail">
        {detailHead('link', 'Google', google.covers, google.connected ? <Toggle on={google.enabled} label="Use Google in chats" onChange={(v) => void act('g-en', () => api.connectors.setEnabled('google', v))} /> : undefined)}
        <h4>Account</h4>
        {!google.configured ? (
          <div className="connector-setup">
            <ol className="steps">
              <li>
                Open <b>console.cloud.google.com</b>, create a project, and enable the <b>Gmail</b>, <b>Google Calendar</b> and <b>Google Drive</b> APIs.
              </li>
              <li>
                <b>OAuth consent screen</b>: External, keep it in <b>Testing</b>, and add your own Google account as a test user.
              </li>
              <li>
                <b>Credentials → Create credentials → OAuth client ID → Desktop app</b>. Copy its Client ID and Client secret here.
              </li>
            </ol>
            <input placeholder="Client ID (…apps.googleusercontent.com)" value={gid} onChange={(e) => setGid(e.target.value)} />
            <input placeholder="Client secret" type="password" value={gsecret} onChange={(e) => setGsecret(e.target.value)} />
            <button className="btn primary" disabled={!gid || !gsecret || busy !== null} onClick={() => void act('g-save', () => api.connectors.setGoogleClient(gid, gsecret))}>
              Save
            </button>
          </div>
        ) : google.connected ? (
          <div className="conn-account">
            <span>Connected{google.account ? ` as ${google.account}` : ''}</span>
            <button className="btn small" disabled={busy !== null} onClick={() => void act('g-off', () => api.connectors.disconnect('google'))}>
              Disconnect
            </button>
          </div>
        ) : (
          <div className="conn-account">
            <span>Not connected</span>
            <button className="btn small primary" disabled={busy !== null} onClick={() => void act('g-on', () => api.connectors.connect('google'))}>
              {busy === 'g-on' ? 'Finish in your browser…' : 'Connect Google'}
            </button>
            <button className="btn small" disabled={busy !== null} onClick={() => void act('g-reset', () => api.connectors.disconnect('google'))}>
              Change client
            </button>
          </div>
        )}
        <h4>Permissions</h4>
        <p className="conn-note">Read-only: chats search and read, never send, edit or delete.</p>
      </div>
    )

  if (open?.kind === 'notion')
    return (
      <div className="conn-detail">
        {detailHead('link', 'Notion', notion.covers, notion.connected ? <Toggle on={notion.enabled} label="Use Notion in chats" onChange={(v) => void act('n-en', () => api.connectors.setEnabled('notion', v))} /> : undefined)}
        <h4>Account</h4>
        {notion.connected ? (
          <div className="conn-account">
            <span>Connected{notion.account ? ` to ${notion.account}` : ''}</span>
            <button className="btn small" disabled={busy !== null} onClick={() => void act('n-off', () => api.connectors.disconnect('notion'))}>
              Disconnect
            </button>
          </div>
        ) : (
          <div className="connector-setup">
            <ol className="steps">
              <li>
                Open <b>notion.so/profile/integrations</b> → <b>New integration</b> (Internal, read content only) and copy its secret.
              </li>
              <li>
                In Notion, open each page you want Plotter to read → <b>⋯ → Connections</b> → add your integration.
              </li>
            </ol>
            <input placeholder="Integration secret (ntn_… or secret_…)" type="password" value={ntoken} onChange={(e) => setNtoken(e.target.value)} />
            <button className="btn primary" disabled={!ntoken || busy !== null} onClick={() => void act('n-save', () => api.connectors.setNotionToken(ntoken))}>
              {busy === 'n-save' ? 'Checking…' : 'Connect Notion'}
            </button>
          </div>
        )}
        <h4>Permissions</h4>
        <p className="conn-note">Read-only: chats search and read the pages you shared with the integration.</p>
      </div>
    )

  if (open?.kind === 'browser')
    return (
      <div className="conn-detail">
        {detailHead('globe', 'Browser', 'Chats open, read and use pages in the pane beside the chat')}
        <h4>Permissions</h4>
        {levelsPicker(levels['browser'] ?? 'low', (l) => void act('b-lvl', () => api.plugins.setBuiltinApproval('browser', l)))}
      </div>
    )

  const tool = open?.kind === 'tool' ? tools.find((t) => t.id === open.id) : undefined
  if (tool)
    return (
      <div className="conn-detail">
        {detailHead(
          tool.kind === 'api' ? 'api' : 'mcp',
          tool.name,
          tool.description,
          <>
            <Toggle on={tool.connected} label={`Use ${tool.name} in chats`} onChange={(v) => void act('t-on', () => api.market.setConnected(tool.id, v))} />
          </>
        )}
        <h4>Account</h4>
        <div className="conn-account">
          {tool.mcp?.auth === 'oauth' ? (
            tool.signedIn ? (
              <>
                <span>Signed in</span>
                <button className="btn small" disabled={busy !== null} onClick={() => void act('t-out', () => api.market.signOut(tool.id))}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <span>Not signed in</span>
                <button className="btn small primary" disabled={busy !== null} onClick={() => void act('t-in', () => api.market.signIn(tool.id))}>
                  {busy === 't-in' ? 'Finish in your browser…' : 'Sign in'}
                </button>
              </>
            )
          ) : tool.hasSecret ? (
            <span>Key saved, encrypted on this PC (change it in the Market)</span>
          ) : (
            <span>{tool.kind === 'mcp' && tool.mcp?.transport === 'stdio' ? 'Runs on this PC' : 'No account needed'}</span>
          )}
        </div>
        <h4>Permissions</h4>
        {levelsPicker(tool.approval ?? def, (l) => void act('t-lvl', () => api.market.setApproval(tool.id, l)))}
        <div className="conn-foot">
          <button
            className="btn small danger-text"
            onClick={() => {
              if (confirm(`Remove ${tool.name}?`)) void act('t-rm', () => api.market.remove(tool.id)).then(() => setOpen(null))
            }}
          >
            Remove
          </button>
        </div>
      </div>
    )

  const rows: React.JSX.Element[] = []
  if (match('Google gmail calendar drive', google.covers)) rows.push(rowOf('google', 'link', 'Google', google.covers, status(google), () => setOpen({ kind: 'google' })))
  if (match('Notion', notion.covers)) rows.push(rowOf('notion', 'link', 'Notion', notion.covers, status(notion), () => setOpen({ kind: 'notion' })))
  for (const t of tools.filter((t) => match(t.name, t.description))) rows.push(rowOf(t.id, t.kind === 'api' ? 'api' : 'mcp', t.name, t.description, toolStatus(t), () => setOpen({ kind: 'tool', id: t.id })))
  if (match('Browser web pages')) rows.push(rowOf('browser', 'globe', 'Browser', 'Chats open, read and use pages in the pane beside the chat', levelName(levels['browser'] ?? 'low'), () => setOpen({ kind: 'browser' })))

  return (
    <>
      <div className="conn-head">
        <h3>Connections</h3>
        {onOpenMarket && (
          <button className="btn" onClick={onOpenMarket}>
            Browse the Market
          </button>
        )}
      </div>
      <input className="conn-search" placeholder="Search connections" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="conn-default">
        <span className="conn-text">
          <b>Default permission</b>
          <span>When chats must ask before using a connection</span>
        </span>
        <select value={def} onChange={(e) => void act('def', () => api.plugins.setBuiltinApproval('default', e.target.value as ToolApproval))}>
          {CONN_LEVELS.map(([l, name]) => (
            <option key={l} value={l}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="settings-error">{error}</div>}
      <div className="conn-list">{rows.length ? rows : <p className="muted">Nothing matches.</p>}</div>
    </>
  )
}

/** The rail's Customize panel: quick switches, connectors and memory, each a click away from Settings. */
export function CustomizePanel({ open, onSettings }: { open: boolean; onSettings: (tab: Tab) => void }): React.JSX.Element {
  const [f, setF] = useState<Features | null>(null)
  const [conn, setConn] = useState<ConnectorStatus[]>([])
  const [memCount, setMemCount] = useState(0)
  useEffect(() => {
    if (!open) return
    void api.features.get().then(setF)
    void api.connectors.list().then(setConn)
    void api.memory.list().then((l) => setMemCount(l.length))
  }, [open])
  return (
    <div className="customize">
      <div className="chat-list-label">Tools</div>
      {f &&
        FEATURE_INFO.map((x) => (
          <div key={x.key} className="side-row" title={x.text}>
            <span className="side-row-name">{x.name}</span>
            <Toggle on={f[x.key]} label={x.name} onChange={(v) => void api.features.set({ [x.key]: v }).then(setF)} />
          </div>
        ))}
      <div className="chat-list-label">Connectors</div>
      {conn.map((c) => (
        <button key={c.id} className="side-item" onClick={() => onSettings('connectors')}>
          <span className={`dot ${c.connected ? (c.enabled ? 'on' : 'paused') : ''}`} />
          {c.name}
          <span className="side-meta">{c.connected ? (c.enabled ? 'Connected' : 'Paused') : 'Set up'}</span>
        </button>
      ))}
      <div className="chat-list-label">Memory</div>
      <button className="side-item" onClick={() => onSettings('memory')}>
        🧠 Saved memories
        <span className="side-meta">{memCount}</span>
      </button>
      <button className="side-item" onClick={() => onSettings('features')}>
        ⚙ All settings
      </button>
    </div>
  )
}

/** Which parts of Plotter are public (in the GitHub repo) and which are private, with advice and the tradeoff. */
function VisibilityTab(): React.JSX.Element {
  const all = VISIBILITY.flatMap((g) => g.items)
  const count = (f: (a: (typeof all)[number]) => boolean): number => all.filter(f).length
  return (
    <>
      <h3>Public &amp; private</h3>
      <p className="settings-lead">
        What anyone can see in Plotter’s GitHub repo, and what stays private. The rule: code that uses your ChatGPT plan stays public (OpenAI’s plan-usage track is for
        open-source apps); the rest lives in a private folder that’s built into the same app, so nothing is slower. The costs are a second repo to keep, and that code
        pushed before the move stays in the public history.
      </p>
      <div className="vis-summary">
        <div className="vis-stat">
          <b>{count((a) => a.now === 'private')}</b>
          <span>private</span>
        </div>
        <div className="vis-stat">
          <b>{count((a) => a.advice === 'must-public')}</b>
          <span>public: uses ChatGPT</span>
        </div>
        <div className="vis-stat accent">
          <b>{count((a) => a.advice === 'stay-public')}</b>
          <span>public by choice</span>
        </div>
      </div>
      {VISIBILITY.map((g) => (
        <section key={g.title} className="vis-group">
          <h4>{g.title}</h4>
          <p className="vis-lead">{g.lead}</p>
          {g.items.map((it) => (
            <div key={it.name} className="vis-row">
              <div className="vis-main">
                <div className="vis-name">{it.name}</div>
                <div className="vis-why">{it.why}</div>
                <div className="vis-trade">{it.tradeoff}</div>
              </div>
              <div className="vis-badges">
                <span className={`vis-badge now-${it.now}`}>{it.now === 'private' ? '🔒 Private' : '🌐 Public'}</span>
                {it.advice !== 'keep-private' && <span className={`vis-badge advice-${it.advice}`}>{ADVICE_LABEL[it.advice]}</span>}
              </div>
            </div>
          ))}
        </section>
      ))}
    </>
  )
}
