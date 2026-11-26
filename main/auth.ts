import { shell } from 'electron'
import { createServer, type Server } from 'node:http'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { clearSecrets, readSecrets, readSettings, updateSettings, writeSecrets } from './store'
import type { Account, AuthState } from '../shared/api'

/**
 * Sign in with ChatGPT, open-source token sharing (developers.openai.com/siwc/token-sharing-open-source).
 * OAuth 2 authorization code + PKCE against auth.openai.com, public client (no secret), loopback redirect.
 * The first sign-in registers this install with client_id=dynamic_agent_client; the issued client id is
 * kept and reused afterwards.
 */

const ISSUER = 'https://auth.openai.com'
const AUTHORIZE_URL = `${ISSUER}/api/accounts/authorize`
const TOKEN_URL = `${ISSUER}/api/accounts/oauth/token`
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`
const RESOURCE = 'https://api.openai.com/v1'
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
const PLAN_SCOPE = 'chatgpt.tokens.use.direct'
const APP_NAME = 'Plotter'
const CALLBACK_PATH = '/auth/callback'
const PREFERRED_PORT = 1455
const SIGN_IN_TIMEOUT_MS = 5 * 60_000

interface Session {
  clientId: string
  accessToken: string
  refreshToken: string
  idToken: string
  /** ms epoch */
  expiresAt: number
  scope: string
  account: Account
  sub: string
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in?: number
  scope?: string
}

const b64url = (buf: Buffer): string => buf.toString('base64url')

function hostId(): string {
  const s = readSettings()
  if (s.hostId) return s.hostId
  const id = `urn:uuid:${randomUUID()}`
  updateSettings({ hostId: id })
  return id
}

let discovery: { jwks_uri: string; revocation_endpoint?: string } | null = null
async function getDiscovery(): Promise<{ jwks_uri: string; revocation_endpoint?: string }> {
  if (discovery) return discovery
  const res = await fetch(DISCOVERY_URL)
  if (!res.ok) throw new Error(`Could not read OpenAI's sign-in configuration (HTTP ${res.status}).`)
  discovery = (await res.json()) as { jwks_uri: string; revocation_endpoint?: string }
  return discovery
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
async function verifyIdToken(idToken: string, clientId: string, nonce: string): Promise<{ sub: string; account: Account }> {
  if (!jwks) jwks = createRemoteJWKSet(new URL((await getDiscovery()).jwks_uri))
  const { payload } = await jwtVerify(idToken, jwks, { issuer: ISSUER, audience: clientId })
  if (payload.nonce !== nonce) throw new Error('Sign-in reply did not match this request (nonce).')
  if (!payload.sub) throw new Error('Sign-in reply had no account id.')
  return {
    sub: payload.sub,
    account: {
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined
    }
  }
}

async function postToken(form: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(form).toString()
  })
  const text = await res.text()
  if (!res.ok) {
    let code = `HTTP ${res.status}`
    try {
      const j = JSON.parse(text) as { error?: string; error_description?: string }
      code = j.error ?? code
      if (j.error_description) code += `: ${j.error_description}`
    } catch {
      // not JSON
    }
    const err = new Error(`Token request failed (${code}).`) as Error & { oauthError?: string }
    err.oauthError = code
    throw err
  }
  return JSON.parse(text) as TokenResponse
}

// ---------------- state ----------------

let session: Session | null = null

/** Load the stored session; call once the app is ready (OS encryption needs it). A stored record without a
 *  refresh token is only a remembered client id, not a session. */
export function loadSession(): void {
  const s = readSecrets<Session>()
  session = s && s.refreshToken ? s : null
}

export function authState(): AuthState {
  if (!session) return { signedIn: false }
  return {
    signedIn: true,
    account: session.account,
    planUsage: session.scope.split(' ').includes(PLAN_SCOPE),
    welcomeSeen: !!readSettings().welcomeSeen
  }
}

// ---------------- sign in ----------------

let pending: { server: Server; cancel: () => void } | null = null

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject)
      const addr = server.address()
      resolve(typeof addr === 'object' && addr ? addr.port : port)
    })
  })
}

const page = (title: string, body: string): string =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font:16px system-ui;background:#fff4e6;color:#3b2a1a;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h2 style="color:#e8590c">${title}</h2><p>${body}</p></div></body>`

export async function signIn(): Promise<AuthState> {
  cancelSignIn()
  const saved = readSecrets<Session>()
  const returning = saved?.clientId
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const state = b64url(randomBytes(16))
  const nonce = b64url(randomBytes(16))

  const server = createServer()
  let port: number
  try {
    port = await listen(server, PREFERRED_PORT)
  } catch {
    // 1455 busy: the docs allow only the port to vary for a returning client; a first registration needs it.
    if (!returning) throw new Error(`Port ${PREFERRED_PORT} is in use. Close the program using it and try again.`)
    port = await listen(server, 0)
  }
  const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`

  const params = new URLSearchParams({
    client_id: returning ?? 'dynamic_agent_client',
    ext_agent_host_id: hostId(),
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    resource: RESOURCE,
    state,
    nonce,
    code_challenge_method: 'S256',
    code_challenge: challenge
  })
  if (!returning) params.set('agent_name_hint', APP_NAME)
  else {
    if (saved.idToken) params.set('id_token_hint', saved.idToken)
    if (saved.account.email) params.set('login_hint', saved.account.email)
  }

  const result = await new Promise<{ code: string; clientId: string }>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Sign-in timed out.')), SIGN_IN_TIMEOUT_MS)
    const finish = (err: Error | null, value?: { code: string; clientId: string }): void => {
      clearTimeout(timer)
      pending = null
      server.close()
      if (err) reject(err)
      else resolve(value!)
    }
    pending = { server, cancel: () => finish(new Error('Sign-in cancelled.')) }

    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404).end()
        return
      }
      const q = url.searchParams
      const fail = (msg: string): void => {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(page('Sign-in did not finish', msg))
        finish(new Error(msg))
      }
      if (q.get('state') !== state) return fail('This sign-in reply did not match Plotter’s request. Try again from Plotter.')
      const error = q.get('error')
      if (error) return fail(error === 'access_denied' ? 'You cancelled the sign-in.' : `ChatGPT said: ${error}`)
      const code = q.get('code')
      if (!code) return fail('No authorization code came back.')
      const issued = q.get('client_id')
      if (returning && issued && issued !== returning) return fail('ChatGPT returned a different app id than the one Plotter registered.')
      const clientId = issued ?? returning
      if (!clientId) return fail('ChatGPT did not return an app id for Plotter.')
      res
        .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        .end(page('Signed in to Plotter', 'You can close this tab and go back to Plotter.'))
      finish(null, { code, clientId })
    })

    void shell.openExternal(`${AUTHORIZE_URL}?${params.toString()}`)
  })

  const tokens = await postToken({
    grant_type: 'authorization_code',
    client_id: result.clientId,
    code: result.code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    resource: RESOURCE
  })
  if (!tokens.id_token || !tokens.refresh_token) throw new Error('Sign-in reply was missing tokens.')
  const { sub, account } = await verifyIdToken(tokens.id_token, result.clientId, nonce)
  const scope = tokens.scope ?? ''

  session = {
    clientId: result.clientId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    scope,
    account,
    sub
  }
  writeSecrets(session)
  return authState()
}

export function cancelSignIn(): void {
  pending?.cancel()
}

// ---------------- tokens for calls ----------------

let refreshing: Promise<string> | null = null

/** A usable access token, refreshing (one at a time: refresh tokens rotate) when it is near expiry. */
export async function accessToken(force = false): Promise<string> {
  if (!session) throw new Error('Not signed in.')
  if (!force && session.expiresAt - Date.now() > 60_000) return session.accessToken
  if (refreshing) return refreshing
  refreshing = (async () => {
    const s = session!
    try {
      const t = await postToken({
        grant_type: 'refresh_token',
        client_id: s.clientId,
        refresh_token: s.refreshToken,
        resource: RESOURCE
      })
      session = {
        ...s,
        accessToken: t.access_token,
        refreshToken: t.refresh_token ?? s.refreshToken,
        idToken: t.id_token ?? s.idToken,
        expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
        scope: t.scope ?? s.scope
      }
      writeSecrets(session)
      return session.accessToken
    } catch (err) {
      const code = (err as { oauthError?: string }).oauthError ?? ''
      if (code.startsWith('invalid_grant')) {
        // The refresh token is spent or revoked: keep the client id for the next sign-in, drop the rest.
        session = null
        writeSecrets({ ...s, accessToken: '', refreshToken: '', expiresAt: 0 })
        throw new Error('Your ChatGPT sign-in expired. Sign in again.')
      }
      throw err
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

// ---------------- sign out ----------------

export async function signOut(): Promise<AuthState> {
  const s = session
  session = null
  if (s) {
    try {
      const { revocation_endpoint } = await getDiscovery()
      if (revocation_endpoint) {
        await fetch(revocation_endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: s.refreshToken, token_type_hint: 'refresh_token', client_id: s.clientId }).toString()
        })
      }
    } catch {
      // revocation is best effort; the local tokens are gone either way
    }
    // Keep only the issued client id so the next sign-in reuses this registration.
    clearSecrets()
    writeSecrets({ clientId: s.clientId, accessToken: '', refreshToken: '', idToken: '', expiresAt: 0, scope: '', account: {}, sub: '' })
  }
  return authState()
}

