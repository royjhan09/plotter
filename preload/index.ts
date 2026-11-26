import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { PlotterApi, PythonStatus, ReplyEvent, SpeechStatus } from '../shared/api'

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
  chats: {
    list: () => ipcRenderer.invoke('chats:list'),
    get: (id) => ipcRenderer.invoke('chats:get', id),
    save: (chat) => ipcRenderer.invoke('chats:save', chat),
    remove: (id) => ipcRenderer.invoke('chats:remove', id),
    title: (userText, replyText) => ipcRenderer.invoke('chats:title', userText, replyText)
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
    put: (html, dark) => ipcRenderer.invoke('ui:put', html, dark),
    frameUrl: (id) => `plotter-ui://frame/${id}`,
    sandbox: 'allow-scripts'
  },
  setTheme: (choice) => ipcRenderer.invoke('theme:set', choice),
  openUsage: () => ipcRenderer.invoke('openUsage'),
  pdf: {
    make: async (chatId, messageId) => fromBase64(await ipcRenderer.invoke('pdf:make', chatId, messageId)),
    ready: () => ipcRenderer.send('pdf:ready'),
    save: (name) => ipcRenderer.invoke('pdf:save', name),
    discard: () => ipcRenderer.invoke('pdf:discard')
  }
}

contextBridge.exposeInMainWorld('plotter', api)
