import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ClaudeCodeUpdate, PlotterApi, PythonStatus, ReplyEvent, SideDelivery, SpeechStatus } from '../shared/api'

const fromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

/** The window's only way to the main process. */
const api: PlotterApi = {
  auth: {
    state: () => ipcRenderer.invoke('auth:state'),
    signIn: () => ipcRenderer.invoke('auth:signIn'),
    cancelSignIn: () => ipcRenderer.invoke('auth:cancelSignIn'),
    signOut: () => ipcRenderer.invoke('auth:signOut'),
    markWelcomeSeen: () => ipcRenderer.invoke('auth:welcomeSeen')
  },
  model: () => ipcRenderer.invoke('model'),
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: (name) => ipcRenderer.invoke('projects:create', name),
    rename: (id, name) => ipcRenderer.invoke('projects:rename', id, name),
    remove: (id) => ipcRenderer.invoke('projects:remove', id),
    addNote: (id, text) => ipcRenderer.invoke('projects:addNote', id, text),
    setKit: (id, kitId) => ipcRenderer.invoke('projects:setKit', id, kitId),
    setBrand: (id, brandId) => ipcRenderer.invoke('projects:setBrand', id, brandId),
    setRole: (id, deployment) => ipcRenderer.invoke('projects:setRole', id, deployment),
    recruit: (id) => ipcRenderer.invoke('projects:recruit', id),
    hire: (id, pick) => ipcRenderer.invoke('projects:hire', id, pick),
    removeRole: (id, roleId) => ipcRenderer.invoke('projects:removeRole', id, roleId),
    editNote: (id, noteId, text) => ipcRenderer.invoke('projects:editNote', id, noteId, text),
    removeNote: (id, noteId) => ipcRenderer.invoke('projects:removeNote', id, noteId),
    onChanged: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on('projects:changed', handler)
      return () => ipcRenderer.removeListener('projects:changed', handler)
    }
  },
  images: {
    status: () => ipcRenderer.invoke('images:status'),
    setKey: (key) => ipcRenderer.invoke('images:setKey', key),
    clearKey: () => ipcRenderer.invoke('images:clearKey'),
    setOptions: (patch) => ipcRenderer.invoke('images:setOptions', patch),
    setOn: (on) => ipcRenderer.invoke('images:setOn', on)
  },
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    get: (ref) => ipcRenderer.invoke('library:get', ref)
  },
  team: {
    next: (chatId, history, turnsLeft) => ipcRenderer.invoke('team:next', chatId, history, turnsLeft),
    route: (chatId, history) => ipcRenderer.invoke('team:route', chatId, history),
    also: (chatId, history, spoke) => ipcRenderer.invoke('team:also', chatId, history, spoke),
    suggest: (purpose) => ipcRenderer.invoke('team:suggest', purpose)
  },
  company: {
    get: () => ipcRenderer.invoke('company:get'),
    rename: (name) => ipcRenderer.invoke('company:rename', name),
    place: (roleId, reportsTo) => ipcRenderer.invoke('company:place', roleId, reportsTo),
    labelLine: (roleId, label) => ipcRenderer.invoke('company:labelLine', roleId, label),
    setPrefer: (prefer) => ipcRenderer.invoke('company:setPrefer', prefer),
    link: (link) => ipcRenderer.invoke('company:link', link),
    unlink: (id) => ipcRenderer.invoke('company:unlink', id),
    onChanged: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on('company:changed', handler)
      return () => ipcRenderer.removeListener('company:changed', handler)
    }
  },
  browser: {
    capture: (id) => ipcRenderer.invoke('browser:capture', id),
    captureUrl: (url, width, height) => ipcRenderer.invoke('browser:captureUrl', url, width, height),
    saveMarkup: (dataUrl) => ipcRenderer.invoke('browser:saveMarkup', dataUrl),
    onOpen: (listener) => {
      const handler = (_e: unknown, p: { url: string }): void => listener(p.url)
      ipcRenderer.on('browser:open', handler)
      return () => ipcRenderer.removeListener('browser:open', handler)
    },
    report: (state) => ipcRenderer.invoke('browser:state', state),
    onMarkShortcut: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on('browser:mark', handler)
      return () => ipcRenderer.removeListener('browser:mark', handler)
    },
    onAgent: (listener) => {
      const handler = (_e: unknown, a: { who: string; what: string }): void => listener(a)
      ipcRenderer.on('browser:agent', handler)
      return () => ipcRenderer.removeListener('browser:agent', handler)
    }
  },
  lab: {
    get: () => ipcRenderer.invoke('lab:get'),
    add: (idea) => ipcRenderer.invoke('lab:add', idea),
    update: (id, change) => ipcRenderer.invoke('lab:update', id, change),
    remove: (id) => ipcRenderer.invoke('lab:remove', id),
    setCapture: (on) => ipcRenderer.invoke('lab:setCapture', on),
    estimate: (test) => ipcRenderer.invoke('lab:estimate', test),
    run: (id, test) => ipcRenderer.invoke('lab:run', id, test),
    stop: (id) => ipcRenderer.invoke('lab:stop', id),
    onChanged: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on('lab:changed', handler)
      return () => ipcRenderer.removeListener('lab:changed', handler)
    }
  },
  roles: {
    list: () => ipcRenderer.invoke('roles:list'),
    save: (role) => ipcRenderer.invoke('roles:save', role),
    remove: (id) => ipcRenderer.invoke('roles:remove', id),
    draft: (input) => ipcRenderer.invoke('roles:draft', input),
    interview: (messages) => ipcRenderer.invoke('roles:interview', messages),
    suggestTools: (id) => ipcRenderer.invoke('roles:suggestTools', id),
    grantWish: (id, tool, give) => ipcRenderer.invoke('roles:grantWish', id, tool, give),
    combineDraft: (a, b) => ipcRenderer.invoke('roles:combineDraft', a, b),
    combine: (a, b, draft) => ipcRenderer.invoke('roles:combine', a, b, draft),
    restore: (id) => ipcRenderer.invoke('roles:restore', id),
    combineSuggestions: () => ipcRenderer.invoke('roles:combineSuggestions'),
    dismissCombo: (a, b) => ipcRenderer.invoke('roles:dismissCombo', a, b),
    onChanged: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on('roles:changed', handler)
      return () => ipcRenderer.removeListener('roles:changed', handler)
    }
  },
  brands: {
    list: () => ipcRenderer.invoke('brands:list'),
    get: (id) => ipcRenderer.invoke('brands:get', id),
    create: (name, copyFrom) => ipcRenderer.invoke('brands:create', name, copyFrom),
    update: (id, patch) => ipcRenderer.invoke('brands:update', id, patch),
    remove: (id) => ipcRenderer.invoke('brands:remove', id),
    setDefault: (id) => ipcRenderer.invoke('brands:setDefault', id),
    saveRule: (id, rule) => ipcRenderer.invoke('brands:saveRule', id, rule),
    removeRule: (id, ruleId) => ipcRenderer.invoke('brands:removeRule', id, ruleId)
  },
  kits: {
    list: () => ipcRenderer.invoke('kits:list'),
    get: (id) => ipcRenderer.invoke('kits:get', id),
    create: (name, copyFrom) => ipcRenderer.invoke('kits:create', name, copyFrom),
    update: (id, patch) => ipcRenderer.invoke('kits:update', id, patch),
    remove: (id) => ipcRenderer.invoke('kits:remove', id),
    setDefault: (id) => ipcRenderer.invoke('kits:setDefault', id),
    saveRule: (id, rule) => ipcRenderer.invoke('kits:saveRule', id, rule),
    removeRule: (id, ruleId) => ipcRenderer.invoke('kits:removeRule', id, ruleId),
    saveComponent: (id, c) => ipcRenderer.invoke('kits:saveComponent', id, c),
    removeComponent: (id, cid) => ipcRenderer.invoke('kits:removeComponent', id, cid),
    openFolder: (id) => ipcRenderer.invoke('kits:openFolder', id),
    usage: (id) => ipcRenderer.invoke('kits:usage', id),
    versionCode: (id, cid, v) => ipcRenderer.invoke('kits:versionCode', id, cid, v),
    restoreVersion: (id, cid, v) => ipcRenderer.invoke('kits:restoreVersion', id, cid, v),
    addUseWhen: (id, cid, situation) => ipcRenderer.invoke('kits:addUseWhen', id, cid, situation),
    addFromReply: (projectId, piece, chatTitle) => ipcRenderer.invoke('kits:addFromReply', projectId, piece, chatTitle),
    onChanged: (listener) => {
      const handler = (_e: IpcRendererEvent, p: { kitId: string }): void => listener(p.kitId)
      ipcRenderer.on('kits:changed', handler)
      return () => ipcRenderer.removeListener('kits:changed', handler)
    }
  },
  onSideDelivery: (listener) => {
    const handler = (_e: IpcRendererEvent, d: SideDelivery): void => listener(d)
    ipcRenderer.on('side:deliver', handler)
    return () => ipcRenderer.removeListener('side:deliver', handler)
  },
  chats: {
    list: () => ipcRenderer.invoke('chats:list'),
    get: (id) => ipcRenderer.invoke('chats:get', id),
    save: (chat) => ipcRenderer.invoke('chats:save', chat),
    remove: (id) => ipcRenderer.invoke('chats:remove', id),
    update: (id, patch) => ipcRenderer.invoke('chats:update', id, patch),
    title: (userText, replyText) => ipcRenderer.invoke('chats:title', userText, replyText),
    suggest: (kind, userText, replyText) => ipcRenderer.invoke('chats:suggest', kind, userText, replyText),
    brief: (chatId) => ipcRenderer.invoke('chats:brief', chatId)
  },
  reply: {
    send: (request) => ipcRenderer.invoke('reply:send', request),
    stop: (requestId) => ipcRenderer.invoke('reply:stop', requestId),
    onEvent: (listener) => {
      const handler = (_e: IpcRendererEvent, event: ReplyEvent): void => listener(event)
      ipcRenderer.on('reply:event', handler)
      return () => ipcRenderer.removeListener('reply:event', handler)
    }
  },
  features: {
    get: () => ipcRenderer.invoke('features:get'),
    set: (patch) => ipcRenderer.invoke('features:set', patch)
  },
  memory: {
    list: () => ipcRenderer.invoke('memory:list'),
    remove: (id) => ipcRenderer.invoke('memory:remove', id),
    clear: () => ipcRenderer.invoke('memory:clear')
  },
  connectors: {
    list: () => ipcRenderer.invoke('connectors:list'),
    setGoogleClient: (id, secret) => ipcRenderer.invoke('connectors:setGoogleClient', id, secret),
    setNotionToken: (token) => ipcRenderer.invoke('connectors:setNotionToken', token),
    connect: (id) => ipcRenderer.invoke('connectors:connect', id),
    disconnect: (id) => ipcRenderer.invoke('connectors:disconnect', id),
    setEnabled: (id, on) => ipcRenderer.invoke('connectors:setEnabled', id, on)
  },
  market: {
    list: () => ipcRenderer.invoke('market:list'),
    save: (tool) => ipcRenderer.invoke('market:save', tool),
    remove: (id) => ipcRenderer.invoke('market:remove', id),
    setConnected: (id, on) => ipcRenderer.invoke('market:setConnected', id, on),
    check: (id) => ipcRenderer.invoke('market:check', id),
    setApproval: (id, level) => ipcRenderer.invoke('market:setApproval', id, level),
    signIn: (id) => ipcRenderer.invoke('market:signIn', id),
    signOut: (id) => ipcRenderer.invoke('market:signOut', id)
  },
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    get: (id) => ipcRenderer.invoke('skills:get', id),
    readFile: (id, path) => ipcRenderer.invoke('skills:readFile', id, path),
    save: (draft) => ipcRenderer.invoke('skills:save', draft),
    setEnabled: (id, on) => ipcRenderer.invoke('skills:setEnabled', id, on),
    remove: (id) => ipcRenderer.invoke('skills:remove', id),
    upload: (input) => ipcRenderer.invoke('skills:upload', input),
    onChanged: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on('skills:changed', handler)
      return () => ipcRenderer.removeListener('skills:changed', handler)
    }
  },
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    save: (pl) => ipcRenderer.invoke('plugins:save', pl),
    remove: (id) => ipcRenderer.invoke('plugins:remove', id),
    setIcon: (id, icon) => ipcRenderer.invoke('plugins:setIcon', id, icon),
    upload: (input) => ipcRenderer.invoke('plugins:upload', input),
    catalog: () => ipcRenderer.invoke('plugins:catalog'),
    popular: () => ipcRenderer.invoke('plugins:popular'),
    popularIcons: () => ipcRenderer.invoke('plugins:popularIcons'),
    addPopular: (id, key) => ipcRenderer.invoke('plugins:addPopular', id, key),
    addFromCatalog: (kind, id) => ipcRenderer.invoke('plugins:addFromCatalog', kind, id),
    builtinApproval: () => ipcRenderer.invoke('plugins:builtinApproval'),
    setBuiltinApproval: (id, level) => ipcRenderer.invoke('plugins:setBuiltinApproval', id, level),
    onChanged: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on('plugins:changed', handler)
      return () => ipcRenderer.removeListener('plugins:changed', handler)
    }
  },
  approvals: {
    onAsk: (listener) => {
      const handler = (_e: unknown, a: Parameters<typeof listener>[0]): void => listener(a)
      ipcRenderer.on('approval:ask', handler)
      return () => ipcRenderer.removeListener('approval:ask', handler)
    },
    answer: (id, allow) => ipcRenderer.invoke('approvals:answer', id, allow)
  },
  claudeCode: {
    available: () => ipcRenderer.invoke('claudeCode:available'),
    folders: () => ipcRenderer.invoke('claudeCode:folders'),
    pickFolder: () => ipcRenderer.invoke('claudeCode:pickFolder'),
    send: (chatId, messageId, beside) => ipcRenderer.invoke('claudeCode:send', chatId, messageId, beside),
    sendMember: (chatId, messageId, roleId, by) => ipcRenderer.invoke('claudeCode:sendMember', chatId, messageId, roleId, by),
    stop: (chatId) => ipcRenderer.invoke('claudeCode:stop', chatId),
    openFolder: (folder) => ipcRenderer.invoke('claudeCode:openFolder', folder),
    suggestFolder: (name) => ipcRenderer.invoke('claudeCode:suggestFolder', name),
    makeFolder: (path) => ipcRenderer.invoke('claudeCode:makeFolder', path),
    onUpdate: (listener) => {
      const handler = (_e: IpcRendererEvent, u: ClaudeCodeUpdate): void => listener(u)
      ipcRenderer.on('claudeCode:update', handler)
      return () => ipcRenderer.removeListener('claudeCode:update', handler)
    }
  },
  python: {
    status: () => ipcRenderer.invoke('python:status'),
    onStatus: (listener) => {
      const handler = (_e: IpcRendererEvent, s: PythonStatus): void => listener(s)
      ipcRenderer.on('python:status', handler)
      return () => ipcRenderer.removeListener('python:status', handler)
    }
  },
  speech: {
    transcribe: (samples) => ipcRenderer.invoke('speech:transcribe', samples),
    status: () => ipcRenderer.invoke('speech:status'),
    warm: () => ipcRenderer.invoke('speech:warm'),
    onStatus: (listener) => {
      const handler = (_e: IpcRendererEvent, status: SpeechStatus): void => listener(status)
      ipcRenderer.on('speech:status', handler)
      return () => ipcRenderer.removeListener('speech:status', handler)
    }
  },
  ui: {
    put: (html, dark, live) => ipcRenderer.invoke('ui:put', html, dark, live),
    frameUrl: (id) => `plotter-ui://frame/${id}`,
    sandbox: 'allow-scripts'
  },
  setTheme: (choice) => ipcRenderer.invoke('theme:set', choice),
  openUsage: () => ipcRenderer.invoke('openUsage'),
  pdf: {
    make: async (chatId, messageId) => fromBase64(await ipcRenderer.invoke('pdf:make', chatId, messageId)),
    ready: () => ipcRenderer.send('pdf:ready'),
    save: (name) => ipcRenderer.invoke('pdf:save', name),
    discard: () => ipcRenderer.invoke('pdf:discard'),
    show: (path) => ipcRenderer.invoke('pdf:show', path)
  }
}

contextBridge.exposeInMainWorld('plotter', api)
