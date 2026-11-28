import type { ClaudeCodeUpdate, PlotterApi, PythonStatus, ReplyEvent, SideDelivery, SpeechStatus } from '../../shared/api'

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

const listeners = {
  reply: new Set<(e: ReplyEvent) => void>(),
  speech: new Set<(s: SpeechStatus) => void>(),
  python: new Set<(s: PythonStatus) => void>(),
  claudeCode: new Set<(u: ClaudeCodeUpdate) => void>(),
  side: new Set<(d: SideDelivery) => void>(),
  projects: new Set<() => void>(),
  kits: new Set<(kitId: string) => void>(),
  roles: new Set<() => void>(),
  company: new Set<() => void>()
}

export function installDevBridge(): void {
  if (window.plotter) return
  const events = new EventSource(`${BRIDGE}/events`)
  events.addEventListener('reply:event', (e) => listeners.reply.forEach((l) => l(JSON.parse((e as MessageEvent).data))))
  events.addEventListener('python:status', (e) => listeners.python.forEach((l) => l(JSON.parse((e as MessageEvent).data))))
  events.addEventListener('claudeCode:update', (e) => listeners.claudeCode.forEach((l) => l(JSON.parse((e as MessageEvent).data))))
  events.addEventListener('side:deliver', (e) => listeners.side.forEach((l) => l(JSON.parse((e as MessageEvent).data))))
  events.addEventListener('projects:changed', () => listeners.projects.forEach((l) => l()))
  events.addEventListener('company:changed', () => listeners.company.forEach((l) => l()))
  events.addEventListener('roles:changed', () => listeners.roles.forEach((l) => l()))
  events.addEventListener('kits:changed', (e) => listeners.kits.forEach((l) => l(JSON.parse((e as MessageEvent).data).kitId)))
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
    projects: {
      list: () => call('projects:list'),
      create: (name) => call('projects:create', name),
      rename: (id, name) => call('projects:rename', id, name),
      remove: (id) => call('projects:remove', id),
      addNote: (id, text) => call('projects:addNote', id, text),
      setKit: (id, kitId) => call('projects:setKit', id, kitId),
      setRole: (id, deployment) => call('projects:setRole', id, deployment),
      recruit: (id) => call('projects:recruit', id),
      hire: (id, pick) => call('projects:hire', id, pick),
      removeRole: (id, roleId) => call('projects:removeRole', id, roleId),
      editNote: (id, noteId, text) => call('projects:editNote', id, noteId, text),
      removeNote: (id, noteId) => call('projects:removeNote', id, noteId),
      onChanged: (l) => {
        listeners.projects.add(l)
        return () => listeners.projects.delete(l)
      }
    },
    images: {
      status: () => call('images:status'),
      setKey: (key) => call('images:setKey', key),
      clearKey: () => call('images:clearKey'),
      setOptions: (patch) => call('images:setOptions', patch)
    },
    library: {
      list: () => call('library:list'),
      get: (ref) => call('library:get', ref)
    },
    team: {
      next: (chatId, history, turnsLeft) => call('team:next', chatId, history, turnsLeft),
      suggest: (purpose) => call('team:suggest', purpose)
    },
    company: {
      get: () => call('company:get'),
      rename: (name) => call('company:rename', name),
      place: (roleId, reportsTo) => call('company:place', roleId, reportsTo),
      labelLine: (roleId, label) => call('company:labelLine', roleId, label),
      setPrefer: (prefer) => call('company:setPrefer', prefer),
      link: (link) => call('company:link', link),
      unlink: (id) => call('company:unlink', id),
      onChanged: (l) => {
        listeners.company.add(l)
        return () => listeners.company.delete(l)
      }
    },
    roles: {
      list: () => call('roles:list'),
      save: (role) => call('roles:save', role),
      remove: (id) => call('roles:remove', id),
      draft: (input) => call('roles:draft', input),
      interview: (messages) => call('roles:interview', messages),
      suggestTools: (id) => call('roles:suggestTools', id),
      grantWish: (id, tool, give) => call('roles:grantWish', id, tool, give),
      combineDraft: (a, b) => call('roles:combineDraft', a, b),
      combine: (a, b, draft) => call('roles:combine', a, b, draft),
      restore: (id) => call('roles:restore', id),
      combineSuggestions: () => call('roles:combineSuggestions'),
      dismissCombo: (a, b) => call('roles:dismissCombo', a, b),
      onChanged: (l) => {
        listeners.roles.add(l)
        return () => listeners.roles.delete(l)
      }
    },
    kits: {
      list: () => call('kits:list'),
      get: (id) => call('kits:get', id),
      create: (name, copyFrom) => call('kits:create', name, copyFrom),
      update: (id, patch) => call('kits:update', id, patch),
      remove: (id) => call('kits:remove', id),
      setDefault: (id) => call('kits:setDefault', id),
      saveRule: (id, rule) => call('kits:saveRule', id, rule),
      removeRule: (id, ruleId) => call('kits:removeRule', id, ruleId),
      saveComponent: (id, c) => call('kits:saveComponent', id, c),
      removeComponent: (id, cid) => call('kits:removeComponent', id, cid),
      openFolder: (id) => call('kits:openFolder', id),
      usage: (id) => call('kits:usage', id),
      versionCode: (id, cid, v) => call('kits:versionCode', id, cid, v),
      restoreVersion: (id, cid, v) => call('kits:restoreVersion', id, cid, v),
      addUseWhen: (id, cid, situation) => call('kits:addUseWhen', id, cid, situation),
      onChanged: (l) => {
        listeners.kits.add(l)
        return () => listeners.kits.delete(l)
      }
    },
    onSideDelivery: (l) => {
      listeners.side.add(l)
      return () => listeners.side.delete(l)
    },
    chats: {
      list: () => call('chats:list'),
      get: (id) => call('chats:get', id),
      save: (chat) => call('chats:save', chat),
      remove: (id) => call('chats:remove', id),
      update: (id, patch) => call('chats:update', id, patch),
      title: (userText, replyText) => call('chats:title', userText, replyText),
      suggest: (kind, userText, replyText) => call('chats:suggest', kind, userText, replyText),
      brief: (chatId) => call('chats:brief', chatId)
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
    market: {
      list: () => call('market:list'),
      save: (tool) => call('market:save', tool),
      remove: (id) => call('market:remove', id),
      setConnected: (id, on) => call('market:setConnected', id, on),
      check: (id) => call('market:check', id)
    },
    claudeCode: {
      available: () => call('claudeCode:available'),
      folders: () => call('claudeCode:folders'),
      pickFolder: () => call('claudeCode:pickFolder'),
      send: (chatId, messageId, beside) => call('claudeCode:send', chatId, messageId, beside),
      stop: (chatId) => call('claudeCode:stop', chatId),
      openFolder: (folder) => call('claudeCode:openFolder', folder),
      suggestFolder: (name) => call('claudeCode:suggestFolder', name),
      makeFolder: (path) => call('claudeCode:makeFolder', path),
      onUpdate: (l) => {
        listeners.claudeCode.add(l)
        return () => listeners.claudeCode.delete(l)
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
    pdf: {
      make: async (chatId, messageId) => Uint8Array.from(atob(await call<string>('pdf:make', chatId, messageId)), (c) => c.charCodeAt(0)),
      ready: () => undefined,
      save: (name) => call('pdf:save', name),
      discard: () => call('pdf:discard'),
      show: (path) => call('pdf:show', path)
    }
  }
  window.plotter = api
}
