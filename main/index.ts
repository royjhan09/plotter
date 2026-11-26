import { app, BrowserWindow, ipcMain, shell, nativeImage, session } from 'electron'
import { join } from 'node:path'
import { authState, cancelSignIn, loadSession, signIn, signOut } from './auth'
import { forgetModel, primaryModel, ReplyError, streamReply } from './openai'
import { onSpeechStatus, speechStatus, transcribe, warmSpeech } from './speech'
import { getChat, listChats, removeChat, saveChat, updateSettings } from './store'
import { USAGE_URL, type Chat, type ReplyEvent, type SendRequest } from '../shared/api'

app.setName('Plotter')
if (process.platform === 'win32') app.setAppUserModelId('com.plotter.app')

const iconPath = join(__dirname, '../../assets/icon.ico')
let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 500,
    title: 'Plotter',
    icon: nativeImage.createFromPath(iconPath),
    backgroundColor: '#fff8ef',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => win?.show())
  // Links in replies open in the real browser, never inside Plotter.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) {
      e.preventDefault()
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  win.on('closed', () => (win = null))
}

/** Plotter's own window may use the microphone (mic + voice mode); nothing else is granted. */
function allowMicrophone(): void {
  const own = (url: string): boolean => url.startsWith('file://') || (!!process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL']))
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const audioOnly = permission === 'media' && (details as { mediaTypes?: string[] }).mediaTypes?.every((t) => t === 'audio')
    callback(!!audioOnly && own(wc.getURL()))
  })
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media' && !!wc && own(wc.getURL()))
}

const running = new Map<string, AbortController>()

function send(event: ReplyEvent): void {
  win?.webContents.send('reply:event', event)
}

function registerIpc(): void {
  ipcMain.handle('auth:state', () => authState())
  ipcMain.handle('auth:signIn', async () => {
    const state = await signIn()
    win?.show()
    win?.focus()
    return state
  })
  ipcMain.handle('auth:cancelSignIn', () => cancelSignIn())
  ipcMain.handle('auth:signOut', () => {
    forgetModel()
    return signOut()
  })
  ipcMain.handle('auth:welcomeSeen', () => void updateSettings({ welcomeSeen: true }))

  ipcMain.handle('model', () => primaryModel())

  ipcMain.handle('speech:transcribe', (_e, samples: Float32Array) => transcribe(samples))
  ipcMain.handle('speech:status', () => speechStatus())
  ipcMain.handle('speech:warm', () => warmSpeech())
  onSpeechStatus((s) => win?.webContents.send('speech:status', s))

  ipcMain.handle('chats:list', () => listChats())
  ipcMain.handle('chats:get', (_e, id: string) => getChat(id))
  ipcMain.handle('chats:save', (_e, chat: Chat) => {
    saveChat(chat)
    updateSettings({ lastModel: chat.model })
  })
  ipcMain.handle('chats:remove', (_e, id: string) => removeChat(id))

  ipcMain.handle('reply:send', (_e, req: SendRequest) => {
    const ctrl = new AbortController()
    running.set(req.requestId, ctrl)
    void streamReply(req.model, req.effort, req.history, { onDelta: (text) => send({ requestId: req.requestId, type: 'delta', text }) }, ctrl.signal)
      .then(() => send({ requestId: req.requestId, type: 'done' }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) {
          send({ requestId: req.requestId, type: 'error', code: 'stopped', message: 'Stopped.', usageLimit: false })
          return
        }
        const re = err instanceof ReplyError ? err : null
        send({
          requestId: req.requestId,
          type: 'error',
          code: re?.code ?? 'error',
          message: err instanceof Error ? err.message : String(err),
          usageLimit: re?.usageLimit ?? false
        })
      })
      .finally(() => running.delete(req.requestId))
  })
  ipcMain.handle('reply:stop', (_e, requestId: string) => running.get(requestId)?.abort())

  ipcMain.handle('openUsage', () => shell.openExternal(USAGE_URL))
}

const single = app.requestSingleInstanceLock()
if (!single) app.quit()
else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  void app.whenReady().then(() => {
    loadSession()
    allowMicrophone()
    registerIpc()
    createWindow()
  })
  app.on('window-all-closed', () => app.quit())
}
