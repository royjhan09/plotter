import { shell } from 'electron'
import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import type { LocalTool } from './openai'
import { readConnectorSecrets, readSettings, updateSettings, writeConnectorSecrets } from './store'
import type { ConnectorId, ConnectorStatus } from '../shared/api'

/**
 * Connectors: read-only access to the user's own Google (Gmail, Calendar, Drive) and Notion, exposed to the
 * model as tools. Credentials belong to the user: Google needs an OAuth "Desktop app" client they create in
 * Google Cloud (the consent screen can stay in Testing with themselves as test user); Notion needs an internal
 * integration secret, with the pages they want shared to that integration. Everything is stored encrypted.
 * Scopes are read-only: Plotter can search and read, never send, edit or delete.
 */

interface GoogleSecrets {
  clientId: string
  clientSecret: string
  refreshToken?: string
  accessToken?: string
  expiresAt?: number
  email?: string
}
interface Secrets {
  google?: GoogleSecrets
  notion?: { token: string; workspace?: string }
}

const read = (): Secrets => readConnectorSecrets<Secrets>() ?? {}
const write = (s: Secrets): void => writeConnectorSecrets(s)
const enabledFlags = (): Partial<Record<ConnectorId, boolean>> => readSettings().connectorsEnabled ?? {}

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.readonly'
]

export function listConnectors(): ConnectorStatus[] {
  const s = read()
  const en = enabledFlags()
  return [
    {
      id: 'google',
      name: 'Google',
      covers: 'Gmail, Calendar and Drive (read-only)',
      configured: !!s.google?.clientId,
      connected: !!s.google?.refreshToken,
      enabled: en.google ?? true,
      account: s.google?.email
    },
    {
      id: 'notion',
      name: 'Notion',
      covers: 'Pages shared with your Plotter integration (read-only)',
      configured: !!s.notion?.token,
      connected: !!s.notion?.token,
      enabled: en.notion ?? true,
      account: s.notion?.workspace
    }
  ]
}

export function setGoogleClient(clientId: string, clientSecret: string): ConnectorStatus[] {
  const s = read()
  const id = clientId.trim()
  if (!/\.apps\.googleusercontent\.com$/.test(id)) throw new Error('That does not look like a Google OAuth client ID (it ends in .apps.googleusercontent.com).')
  s.google = { clientId: id, clientSecret: clientSecret.trim() }
  write(s)
  return listConnectors()
}

export async function setNotionToken(token: string): Promise<ConnectorStatus[]> {
  const t = token.trim()
  if (!t) throw new Error('Paste the integration secret first.')
  const res = await fetch('https://api.notion.com/v1/users/me', { headers: notionHeaders(t) })
  if (!res.ok) throw new Error(`Notion did not accept that secret (HTTP ${res.status}).`)
  const me = (await res.json()) as { bot?: { workspace_name?: string } }
  const s = read()
  s.notion = { token: t, workspace: me.bot?.workspace_name }
  write(s)
  return listConnectors()
}

export async function disconnect(id: ConnectorId): Promise<ConnectorStatus[]> {
  const s = read()
  if (id === 'google' && s.google) {
    if (s.google.refreshToken) {
      // connected: sign out (revoke) but keep the OAuth client for reconnecting
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(s.google.refreshToken)}`, { method: 'POST' }).catch(() => undefined)
      s.google = { clientId: s.google.clientId, clientSecret: s.google.clientSecret }
    } else {
      // not connected: forget the OAuth client too ("Change client")
      delete s.google
    }
  }
  if (id === 'notion') delete s.notion
  write(s)
  return listConnectors()
}

export function setEnabled(id: ConnectorId, enabled: boolean): ConnectorStatus[] {
  updateSettings({ connectorsEnabled: { ...enabledFlags(), [id]: enabled } })
  return listConnectors()
}

// ---------------------------------------------------------------- Google sign-in (OAuth, PKCE, loopback)

export async function connectGoogle(): Promise<ConnectorStatus[]> {
  const s = read()
  const g = s.google
  if (!g?.clientId) throw new Error('Add your Google OAuth client first.')
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(16).toString('base64url')
  const server = createServer()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  const redirect = `http://127.0.0.1:${port}`
  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Google sign-in timed out.')), 5 * 60_000)
    const finish = (err: Error | null, value?: string): void => {
      clearTimeout(timer)
      server.close()
      if (err) reject(err)
      else resolve(value!)
    }
    server.on('request', (req, res) => {
      const q = new URL(req.url ?? '/', redirect).searchParams
      if (!q.get('code') && !q.get('error')) {
        res.writeHead(404).end()
        return
      }
      const ok = q.get('state') === state && q.get('code')
      res
        .writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' })
        .end(`<body style="font:16px system-ui;padding:40px">${ok ? 'Google is connected to Plotter. You can close this tab.' : 'Google sign-in did not finish.'}</body>`)
      if (ok) finish(null, q.get('code')!)
      else finish(new Error(q.get('error') === 'access_denied' ? 'You cancelled the Google sign-in.' : 'Google sign-in failed.'))
    })
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.search = new URLSearchParams({
      client_id: g.clientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
      state
    }).toString()
    void shell.openExternal(url.toString())
  })
  const t = await googleToken({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect }, g)
  if (!t.refresh_token) throw new Error('Google did not return a refresh token. Remove Plotter at myaccount.google.com/permissions and connect again.')
  g.refreshToken = t.refresh_token
  g.accessToken = t.access_token
  g.expiresAt = Date.now() + (t.expires_in ?? 3600) * 1000
  try {
    const info = (await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${g.accessToken}` } })).json()) as { email?: string }
    g.email = info.email
  } catch {
    // the email is only a label
  }
  write({ ...s, google: g })
  return listConnectors()
}

async function googleToken(params: Record<string, string>, g: GoogleSecrets): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, ...params }).toString()
  })
  if (!res.ok) throw new Error(`Google token request failed (HTTP ${res.status}).`)
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number }
}

async function googleAccess(): Promise<string> {
  const s = read()
  const g = s.google
  if (!g?.refreshToken) throw new Error('Google is not connected.')
  if (g.accessToken && (g.expiresAt ?? 0) - Date.now() > 60_000) return g.accessToken
  const t = await googleToken({ grant_type: 'refresh_token', refresh_token: g.refreshToken }, g)
  g.accessToken = t.access_token
  g.expiresAt = Date.now() + (t.expires_in ?? 3600) * 1000
  write({ ...s, google: g })
  return g.accessToken
}

async function gget<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await googleAccess()}` } })
  if (!res.ok) throw new Error(`Google API error (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

async function gtext(url: string): Promise<string> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await googleAccess()}` } })
  if (!res.ok) throw new Error(`Google API error (HTTP ${res.status}).`)
  return res.text()
}

const b64url = (s: string): string => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
const stripHtml = (h: string): string =>
  h
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
const cap = (s: string, n = 40_000): string => (s.length > n ? `${s.slice(0, n)}\n… (truncated)` : s)

type GPart = { mimeType?: string; body?: { data?: string }; parts?: GPart[]; headers?: { name: string; value: string }[] }
function bodyText(p: GPart): string {
  if (p.mimeType === 'text/plain' && p.body?.data) return b64url(p.body.data)
  if (p.parts) {
    const plain = p.parts.map(bodyText).filter(Boolean)
    if (plain.length) return plain.join('\n')
  }
  if (p.mimeType === 'text/html' && p.body?.data) return stripHtml(b64url(p.body.data))
  return ''
}
const header = (p: GPart, name: string): string => p.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

function googleTools(): LocalTool[] {
  return [
    {
      name: 'gmail_search',
      description: 'Search the user\'s Gmail with Gmail search syntax (e.g. "from:bank newer_than:30d", "subject:invoice"). Returns id, from, subject, date and snippet.',
      parameters: { type: 'object', properties: { query: { type: 'string' }, max: { type: 'integer', description: '1-25, default 10' } }, required: ['query'] },
      label: (a) => `Searching Gmail for “${String(a['query'] ?? '')}”…`,
      run: async (a) => {
        const max = Math.min(25, Math.max(1, Number(a['max'] ?? 10)))
        const list = await gget<{ messages?: { id: string }[] }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(String(a['query'] ?? ''))}`)
        const items = await Promise.all(
          (list.messages ?? []).map(async (m) => {
            const d = await gget<{ id: string; snippet?: string; payload: GPart }>(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
            )
            return { id: d.id, from: header(d.payload, 'From'), subject: header(d.payload, 'Subject'), date: header(d.payload, 'Date'), snippet: d.snippet }
          })
        )
        return {
          output: JSON.stringify(items),
          run: { kind: 'connector', title: `Searched Gmail · ${items.length} result${items.length === 1 ? '' : 's'}`, code: String(a['query'] ?? ''), output: items.map((i) => `${i.date} · ${i.from} · ${i.subject}`).join('\n') }
        }
      }
    },
    {
      name: 'gmail_read',
      description: 'Read one Gmail message (by id from gmail_search): headers and plain-text body.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      label: () => 'Reading an email…',
      run: async (a) => {
        const d = await gget<{ payload: GPart }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(String(a['id'] ?? ''))}?format=full`)
        const subject = header(d.payload, 'Subject')
        return {
          output: JSON.stringify({ from: header(d.payload, 'From'), to: header(d.payload, 'To'), date: header(d.payload, 'Date'), subject, body: cap(bodyText(d.payload)) }),
          run: { kind: 'connector', title: 'Read an email', output: subject }
        }
      }
    },
    {
      name: 'calendar_events',
      description: 'List events from the user\'s primary Google Calendar between two ISO dates/times (default: next 7 days). Optional text query.',
      parameters: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' }, query: { type: 'string' } } },
      label: () => 'Checking your calendar…',
      run: async (a) => {
        const start = a['start'] ? new Date(String(a['start'])) : new Date()
        const end = a['end'] ? new Date(String(a['end'])) : new Date(start.getTime() + 7 * 864e5)
        const p = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '50' })
        if (a['query']) p.set('q', String(a['query']))
        const r = await gget<{ items?: { summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; location?: string; description?: string }[] }>(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${p}`
        )
        const items = (r.items ?? []).map((e) => ({ title: e.summary, start: e.start?.dateTime ?? e.start?.date, end: e.end?.dateTime ?? e.end?.date, location: e.location, notes: e.description?.slice(0, 500) }))
        return {
          output: JSON.stringify(items),
          run: { kind: 'connector', title: `Checked Calendar · ${items.length} event${items.length === 1 ? '' : 's'}`, output: items.map((i) => `${i.start} · ${i.title}`).join('\n') }
        }
      }
    },
    {
      name: 'drive_search',
      description: 'Search the user\'s Google Drive by words in file names or contents. Returns id, name, type, modified time and link.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      label: (a) => `Searching Drive for “${String(a['query'] ?? '')}”…`,
      run: async (a) => {
        const q = String(a['query'] ?? '').replace(/'/g, "\\'")
        const p = new URLSearchParams({ q: `(name contains '${q}' or fullText contains '${q}') and trashed = false`, pageSize: '20', fields: 'files(id,name,mimeType,modifiedTime,webViewLink)' })
        const r = await gget<{ files?: { id: string; name: string; mimeType: string; modifiedTime: string; webViewLink?: string }[] }>(`https://www.googleapis.com/drive/v3/files?${p}`)
        const files = r.files ?? []
        return {
          output: JSON.stringify(files),
          run: { kind: 'connector', title: `Searched Drive · ${files.length} file${files.length === 1 ? '' : 's'}`, code: String(a['query'] ?? ''), output: files.map((f) => f.name).join('\n') }
        }
      }
    },
    {
      name: 'drive_read',
      description: 'Read a Google Drive file by id: Google Docs/Slides as text, Sheets as CSV, plain-text files as text.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      label: () => 'Reading a Drive file…',
      run: async (a) => {
        const id = encodeURIComponent(String(a['id'] ?? ''))
        const meta = await gget<{ name: string; mimeType: string }>(`https://www.googleapis.com/drive/v3/files/${id}?fields=name,mimeType`)
        const exportAs: Record<string, string> = {
          'application/vnd.google-apps.document': 'text/plain',
          'application/vnd.google-apps.presentation': 'text/plain',
          'application/vnd.google-apps.spreadsheet': 'text/csv'
        }
        let text: string
        if (exportAs[meta.mimeType]) text = await gtext(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(exportAs[meta.mimeType]!)}`)
        else if (/^text\/|json|xml|csv/.test(meta.mimeType)) text = await gtext(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`)
        else return { output: JSON.stringify({ name: meta.name, error: `Plotter cannot read ${meta.mimeType} files from Drive yet.` }) }
        return { output: JSON.stringify({ name: meta.name, content: cap(text) }), run: { kind: 'connector', title: 'Read a Drive file', output: meta.name } }
      }
    }
  ]
}

// ---------------------------------------------------------------- Notion

const notionHeaders = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' })

async function notion<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = read().notion?.token
  if (!token) throw new Error('Notion is not connected.')
  const res = await fetch(`https://api.notion.com/v1${path}`, { ...init, headers: notionHeaders(token) })
  if (!res.ok) throw new Error(`Notion API error (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

type RichText = { plain_text?: string }[]
const plain = (r?: RichText): string => (r ?? []).map((t) => t.plain_text ?? '').join('')
function titleOf(o: { properties?: Record<string, { type?: string; title?: RichText }>; title?: RichText }): string {
  if (o.title) return plain(o.title)
  const p = Object.values(o.properties ?? {}).find((v) => v.type === 'title')
  return plain(p?.title) || 'Untitled'
}

function notionTools(): LocalTool[] {
  return [
    {
      name: 'notion_search',
      description: 'Search the user\'s Notion pages and databases shared with Plotter. Returns id, title, type, URL and last edit time.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      label: (a) => `Searching Notion for “${String(a['query'] ?? '')}”…`,
      run: async (a) => {
        const r = await notion<{ results: { id: string; object: string; url?: string; last_edited_time?: string }[] }>('/search', {
          method: 'POST',
          body: JSON.stringify({ query: String(a['query'] ?? ''), page_size: 20 })
        })
        const items = r.results.map((x) => ({ id: x.id, type: x.object, title: titleOf(x as never), url: x.url, edited: x.last_edited_time }))
        return {
          output: JSON.stringify(items),
          run: { kind: 'connector', title: `Searched Notion · ${items.length} result${items.length === 1 ? '' : 's'}`, code: String(a['query'] ?? ''), output: items.map((i) => i.title).join('\n') }
        }
      }
    },
    {
      name: 'notion_read',
      description: 'Read a Notion page by id (from notion_search) as plain text.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      label: () => 'Reading a Notion page…',
      run: async (a) => {
        const id = encodeURIComponent(String(a['id'] ?? ''))
        const page = await notion<Record<string, unknown>>(`/pages/${id}`)
        const lines: string[] = []
        let cursor: string | undefined
        for (let i = 0; i < 5; i++) {
          const r = await notion<{ results: Record<string, unknown>[]; next_cursor?: string; has_more?: boolean }>(`/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`)
          for (const b of r.results) {
            const type = String(b['type'])
            const content = b[type] as { rich_text?: RichText; checked?: boolean } | undefined
            const text = plain(content?.rich_text)
            const prefix: Record<string, string> = { heading_1: '# ', heading_2: '## ', heading_3: '### ', bulleted_list_item: '- ', numbered_list_item: '1. ', quote: '> ', to_do: content?.checked ? '- [x] ' : '- [ ] ' }
            if (text) lines.push((prefix[type] ?? '') + text)
          }
          if (!r.has_more) break
          cursor = r.next_cursor
        }
        const title = titleOf(page as never)
        return { output: JSON.stringify({ title, content: cap(lines.join('\n')) }), run: { kind: 'connector', title: 'Read a Notion page', output: title } }
      }
    }
  ]
}

/** The tools (and a line of instructions) for every connected, enabled service. */
export async function connectorTools(): Promise<{ tools: LocalTool[]; instructions: string }> {
  const on = listConnectors().filter((c) => c.connected && c.enabled)
  const tools: LocalTool[] = []
  const names: string[] = []
  if (on.some((c) => c.id === 'google')) {
    tools.push(...googleTools())
    names.push('Gmail, Google Calendar and Google Drive (gmail_search, gmail_read, calendar_events, drive_search, drive_read)')
  }
  if (on.some((c) => c.id === 'notion')) {
    tools.push(...notionTools())
    names.push('Notion (notion_search, notion_read)')
  }
  const instructions = names.length
    ? `Connected services (read-only): ${names.join('; ')}. Use them when the user asks about their own email, schedule, files or notes. Today is ${new Date().toISOString().slice(0, 10)}. Summarise what you found; quote only what is needed; never claim you sent, edited or deleted anything (you cannot).`
    : ''
  return { tools, instructions }
}

export async function connect(id: ConnectorId): Promise<ConnectorStatus[]> {
  if (id === 'google') return connectGoogle()
  throw new Error('Notion connects with its integration secret.')
}
