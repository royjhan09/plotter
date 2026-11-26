import { useEffect, useState } from 'react'
import type { ConnectorStatus, Features, Memory, PythonStatus } from '../../shared/api'

const api = window.plotter

type Tab = 'features' | 'memory' | 'connectors'

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

export function Settings({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('features')
  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="settings" onClick={(e) => e.stopPropagation()}>
        <nav className="settings-nav">
          <div className="settings-heading">Settings</div>
          {(
            [
              ['features', 'Features'],
              ['memory', 'Memory'],
              ['connectors', 'Connectors']
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </nav>
        <section className="settings-body">
          <button className="settings-close" onClick={onClose} title="Close">
            ×
          </button>
          {tab === 'features' && <FeaturesTab />}
          {tab === 'memory' && <MemoryTab />}
          {tab === 'connectors' && <ConnectorsTab />}
        </section>
      </div>
    </div>
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
