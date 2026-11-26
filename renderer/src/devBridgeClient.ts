import type { PlotterApi, PythonStatus, ReplyEvent, SpeechStatus } from '../../shared/api'

/**
 * Development only: when the UI is opened in an ordinary browser (no Electron preload), stand in for
 * window.plotter by calling the running Plotter process over its dev bridge (main/devBridge.ts).
 */

const BRIDGE = 'http://127.0.0.1:5199'

function encode(a: unknown): unknown {
  if (a instanceof Float32Array) {
    const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return { $f32: btoa(s) }
  }
  return a
}

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BRIDGE}/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, args: args.map(encode) }) })
  } catch {
    throw new Error('Plotter’s dev process is not running (start it with npm run dev:browser).')
  }
  const body = (await res.json()) as { ok: boolean; result?: T; error?: string }
  if (!body.ok) throw new Error(body.error)
  return body.result as T
}

const listeners = { reply: new Set<(e: ReplyEvent) => void>(), speech: new Set<(s: SpeechStatus) => void>(), python: new Set<(s: PythonStatus) => void>() }

export function installDevBridge(): void {
  if (window.plotter) return
  const events = new EventSource(`${BRIDGE}/events`)
  events.addEventListener('reply:event', (e) => listeners.reply.forEach((l) => l(JSON.parse((e as MessageEvent).data))))
  events.addEventListener('python:status', (e) => listeners.python.forEach((l) => l(JSON.parse((e as MessageEvent).data))))
  events.addEventListener('speech:status', (e) => listeners.speech.forEach((l) => l(JSON.parse((e as MessageEvent).data))))

  const api: PlotterApi = {
    auth: {
      state: () => call('auth:state'),
      signIn: () => call('auth:signIn'),
      cancelSignIn: () => call('auth:cancelSignIn'),
      signOut: () => call('auth:signOut'),
      markWelcomeSeen: () => call('auth:welcomeSeen')
    },
    model: () => call('model'),
    chats: {
      list: () => call('chats:list'),
      get: (id) => call('chats:get', id),
      save: (chat) => call('chats:save', chat),
      remove: (id) => call('chats:remove', id),
      title: (userText, replyText) => call('chats:title', userText, replyText)
    },
    reply: {
      send: (request) => call('reply:send', request),
      stop: (requestId) => call('reply:stop', requestId),
      onEvent: (l) => {
        listeners.reply.add(l)
        return () => listeners.reply.delete(l)
      }
    },
    features: {
      get: () => call('features:get'),
      set: (patch) => call('features:set', patch)
    },
    memory: {
      list: () => call('memory:list'),
      remove: (id) => call('memory:remove', id),
      clear: () => call('memory:clear')
    },
    connectors: {
      list: () => call('connectors:list'),
      setGoogleClient: (id, secret) => call('connectors:setGoogleClient', id, secret),
      setNotionToken: (token) => call('connectors:setNotionToken', token),
      connect: (id) => call('connectors:connect', id),
      disconnect: (id) => call('connectors:disconnect', id),
      setEnabled: (id, on) => call('connectors:setEnabled', id, on)
    },
    python: {
      status: () => call('python:status'),
      onStatus: (listener) => {
        listeners.python.add(listener)
        return () => listeners.python.delete(listener)
      }
    },
    speech: {
      transcribe: (samples) => call('speech:transcribe', samples),
      status: () => call('speech:status'),
      warm: () => call('speech:warm'),
      onStatus: (l) => {
        listeners.speech.add(l)
        return () => listeners.speech.delete(l)
      }
    },
    ui: {
      put: (html, dark) => call('ui:put', html, dark),
      frameUrl: (id) => `${BRIDGE}/ui/${id}`,
      // Some browsers (e.g. Claude's browser pane) refuse opaque-origin frames from loopback; there the
      // preview keeps the bridge's origin (still not Plotter's page, and its CSP allows no network).
      sandbox: 'allow-scripts allow-same-origin'
    },
    setTheme: (choice) => call('theme:set', choice),
    openUsage: () => call('openUsage'),
    // No Electron window here: use the browser's own print dialog (Save as PDF).
    pdf: {
      print: async () => window.print(),
      save: async () => null
    }
  }
  window.plotter = api
}
