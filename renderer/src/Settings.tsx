import { useEffect, useState } from 'react'
import type { ChatMetaPatch, ChatSummary, ConnectorStatus, Features, ImageKeyStatus, Memory, PythonStatus } from '../../shared/api'
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
      { tab: 'connectors', label: 'Connectors', words: 'google gmail calendar drive notion' }
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
        <button className="settings-back" onClick={onClose} title="Back to the chat (Esc)">
          <NavIcon tab="back" />
          Back to chat
        </button>
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
          {tab === 'images' && <ImagesTab />}
          {tab === 'memory' && <MemoryTab />}
          {tab === 'connectors' && <ConnectorsTab />}
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

const QUALITY_TEXT: Record<string, string> = {
  low: 'Low: fastest and cheapest, good for drafts',
  medium: 'Medium: a good balance',
  high: 'High: best detail, costs the most'
}

/**
 * Pictures: drawn by the chats (free, always on) or made by OpenAI's image model with the user's own API key.
 * The key is typed here by the user, checked with OpenAI, and kept encrypted on this PC.
 */
function ImagesTab(): React.JSX.Element {
  const [st, setSt] = useState<ImageKeyStatus | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => void api.images.status().then(setSt), [])
  if (!st) return <div className="muted">Loading…</div>
  const clean = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  const save = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setSt(await api.images.setKey(key))
      setKey('')
    } catch (e) {
      setError(clean(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <h3>Images</h3>
      <p className="settings-lead">
        Ask any chat for a picture. Without a key, ChatGPT and Claude Code draw it themselves as a vector picture (free, on your plans): good for icons, logos, illustrations and banners. Add your own OpenAI API key to use OpenAI’s image model as well, for photos and detailed artwork.
      </p>
      <div className="setting-row">
        <div className="setting-text">
          <div className="setting-name">Drawn pictures</div>
          <div className="setting-desc">Always on. Each picture can be saved as a PNG.</div>
        </div>
        <span className="setting-value">On</span>
      </div>
      {st.models.length === 0 ? (
        <div className="setting-row">
          <div className="setting-text">
            <div className="setting-name">OpenAI’s image model</div>
            <div className="setting-desc">Not part of this build.</div>
          </div>
        </div>
      ) : (
        <>
          <div className="setting-row images-key">
            <div className="setting-text">
              <div className="setting-name">OpenAI API key</div>
              <div className="setting-desc">
                {st.set
                  ? `Saved (${st.hint}), encrypted on this PC. Pictures from the image model are billed to this key, not to your ChatGPT plan.`
                  : 'Pictures from the image model are billed to your key (roughly $0.01 to $0.20 each, by quality and size), not to your ChatGPT plan. Create a key at platform.openai.com › API keys. OpenAI may ask you to verify your organisation before its image models work.'}
              </div>
              {!st.set && (
                <div className="images-key-form">
                  <input type="password" placeholder="sk-…" value={key} autoComplete="off" spellCheck={false} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && key.trim() && void save()} />
                  <button className="btn small primary" disabled={!key.trim() || busy} onClick={() => void save()}>
                    {busy ? 'Checking…' : 'Save key'}
                  </button>
                </div>
              )}
              {error && <div className="settings-error">{error}</div>}
            </div>
            {st.set && (
              <button className="btn small" onClick={() => void api.images.clearKey().then(setSt)}>
                Remove key
              </button>
            )}
          </div>
          <div className="setting-row">
            <div className="setting-text">
              <div className="setting-name">Image model</div>
              <div className="setting-desc">gpt-image-2 is OpenAI’s newest.</div>
            </div>
            <select className="setting-select" value={st.options.model} onChange={(e) => void api.images.setOptions({ model: e.target.value }).then(setSt)}>
              {st.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="setting-row">
            <div className="setting-text">
              <div className="setting-name">Default quality</div>
              <div className="setting-desc">{QUALITY_TEXT[st.options.quality]}. A chat may choose differently when you ask.</div>
            </div>
            <select className="setting-select" value={st.options.quality} onChange={(e) => void api.images.setOptions({ quality: e.target.value as 'low' | 'medium' | 'high' }).then(setSt)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </>
      )}
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

function ConnectorsTab(): React.JSX.Element {
  const [list, setList] = useState<ConnectorStatus[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [gid, setGid] = useState('')
  const [gsecret, setGsecret] = useState('')
  const [ntoken, setNtoken] = useState('')
  useEffect(() => void api.connectors.list().then(setList), [])
  const act = async (key: string, f: () => Promise<ConnectorStatus[]>): Promise<void> => {
    setBusy(key)
    setError(null)
    try {
      setList(await f())
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(null)
    }
  }
  if (!list) return <div className="muted">Loading…</div>
  const google = list.find((c) => c.id === 'google')!
  const notion = list.find((c) => c.id === 'notion')!
  return (
    <>
      <h3>Connectors</h3>
      <p className="settings-lead">Let Plotter read your own email, calendar, files and notes when you ask about them. Read-only: Plotter can search and read, never send, edit or delete. Sign-ins are stored encrypted on this PC.</p>
      {error && <div className="settings-error">{error}</div>}

      <div className="connector">
        <div className="connector-head">
          <div>
            <div className="setting-name">Google</div>
            <div className="setting-desc">{google.covers}</div>
            {google.connected && <div className="setting-status">Connected{google.account ? ` as ${google.account}` : ''}</div>}
          </div>
          {google.connected && <Toggle on={google.enabled} label="Use Google in chats" onChange={(v) => void act('g-en', () => api.connectors.setEnabled('google', v))} />}
        </div>
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
          <button className="btn ghost" disabled={busy !== null} onClick={() => void act('g-off', () => api.connectors.disconnect('google'))}>
            Disconnect
          </button>
        ) : (
          <div className="row-actions">
            <button className="btn primary" disabled={busy !== null} onClick={() => void act('g-on', () => api.connectors.connect('google'))}>
              {busy === 'g-on' ? 'Finish in your browser…' : 'Connect Google'}
            </button>
            <button className="btn ghost" disabled={busy !== null} onClick={() => void act('g-reset', () => api.connectors.disconnect('google'))}>
              Change client
            </button>
          </div>
        )}
      </div>

      <div className="connector">
        <div className="connector-head">
          <div>
            <div className="setting-name">Notion</div>
            <div className="setting-desc">{notion.covers}</div>
            {notion.connected && <div className="setting-status">Connected{notion.account ? ` to ${notion.account}` : ''}</div>}
          </div>
          {notion.connected && <Toggle on={notion.enabled} label="Use Notion in chats" onChange={(v) => void act('n-en', () => api.connectors.setEnabled('notion', v))} />}
        </div>
        {notion.connected ? (
          <button className="btn ghost" disabled={busy !== null} onClick={() => void act('n-off', () => api.connectors.disconnect('notion'))}>
            Disconnect
          </button>
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
      </div>
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
