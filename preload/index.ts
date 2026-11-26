import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { PlotterApi, ReplyEvent, SpeechStatus } from '../shared/api'

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
  openUsage: () => ipcRenderer.invoke('openUsage')
}

contextBridge.exposeInMainWorld('plotter', api)
