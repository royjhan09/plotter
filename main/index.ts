import { app, BrowserWindow, ipcMain, shell, nativeImage, nativeTheme, session } from 'electron'
import { join } from 'node:path'
import { authState, cancelSignIn, loadSession, signIn, signOut } from './auth'
import { forgetModel, primaryModel, ReplyError, streamReply } from './openai'
import { onSpeechStatus, speechStatus, transcribe, warmSpeech } from './speech'
import { getChat, listChats, readSettings, removeChat, saveChat, updateSettings } from './store'
import { startDevBridge } from './devBridge'
import { USAGE_URL, type Chat, type ReplyEvent, type SendRequest } from '../shared/api'

app.setName('Plotter')
if (process.platform === 'win32') app.setAppUserModelId('com.plotter.app')

/** `npm run dev:browser`: no Electron window; the UI runs in a browser and talks to this process over the dev bridge. */
const BROWSER_ONLY = process.env['PLOTTER_BROWSER_ONLY'] === '1' && !!process.env['ELECTRON_RENDERER_URL']

const iconPath = join(__dirname, '../../assets/icon.ico')
let win: BrowserWindow | null = null

const windowBackground = (): string => (nativeTheme.shouldUseDarkColors ? '#1a1511' : '#fffaf3')

function createWindow(): void {
  nativeTheme.themeSource = readSettings().theme ?? 'system' // before the first choice: Windows decides
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 500,
    title: 'Plotter',
    icon: nativeImage.createFromPath(iconPath),
    backgroundColor: windowBackground(),
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

// ---------------------------------------------------------------- one set of handlers, two doors

type Emit = (channel: string, payload: unknown) => void
const emitters = new Set<Emit>()
const emit: Emit = (channel, payload) => emitters.forEach((e) => e(channel, payload))

const running = new Map<string, AbortController>()
const sendReply = (event: ReplyEvent): void => emit('reply:event', event)

/** Every call the window can make. The preload reaches them over IPC; the dev bridge over HTTP. */
export const handlers: Record<string, (...args: never[]) => unknown> = {
  'auth:state': () => authState(),
  'auth:signIn': async () => {
    const state = await signIn()
    win?.show()
    win?.focus()
    return state
  },
  'auth:cancelSignIn': () => cancelSignIn(),
  'auth:signOut': () => {
    forgetModel()
    return signOut()
  },
  'auth:welcomeSeen': () => void updateSettings({ welcomeSeen: true }),

  model: () => primaryModel(),

  'speech:transcribe': (samples: Float32Array) => transcribe(samples),
  'speech:status': () => speechStatus(),
  'speech:warm': () => warmSpeech(),

  'chats:list': () => listChats(),
  'chats:get': (id: string) => getChat(id),
  'chats:save': (chat: Chat) => {
    saveChat(chat)
    updateSettings({ lastModel: chat.model })
  },
  'chats:remove': (id: string) => removeChat(id),

  'reply:send': (req: SendRequest) => {
    const ctrl = new AbortController()
    running.set(req.requestId, ctrl)
    const id = req.requestId
    void streamReply(
      req.model,
      req.effort,
      req.history,
      {
        onDelta: (text) => sendReply({ requestId: id, type: 'delta', text }),
        onActivity: (label) => sendReply({ requestId: id, type: 'activity', label }),
        onSource: (s) => sendReply({ requestId: id, type: 'source', url: s.url, title: s.title })
      },
      ctrl.signal
    )
      .then(() => sendReply({ requestId: req.requestId, type: 'done' }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) {
          sendReply({ requestId: req.requestId, type: 'error', code: 'stopped', message: 'Stopped.', usageLimit: false })
          return
        }
        const re = err instanceof ReplyError ? err : null
        sendReply({
          requestId: req.requestId,
          type: 'error',
          code: re?.code ?? 'error',
          message: err instanceof Error ? err.message : String(err),
          usageLimit: re?.usageLimit ?? false
        })
      })
      .finally(() => running.delete(req.requestId))
  },
  'reply:stop': (requestId: string) => running.get(requestId)?.abort(),

  'theme:set': (theme: 'light' | 'dark') => {
    if (theme !== 'light' && theme !== 'dark') return
    nativeTheme.themeSource = theme
    updateSettings({ theme })
    win?.setBackgroundColor(windowBackground())
  },

  openUsage: () => shell.openExternal(USAGE_URL)
}

function registerIpc(): void {
  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_e, ...args: unknown[]) => (fn as (...a: unknown[]) => unknown)(...args))
  }
  emitters.add((channel, payload) => win?.webContents.send(channel, payload))
  onSpeechStatus((s) => emit('speech:status', s))
}

const single = app.requestSingleInstanceLock()
if (!single) {
  if (BROWSER_ONLY) console.error('[plotter] Plotter is already open. Close the desktop Plotter window, then start the browser dev mode again.')
  app.quit()
} else {
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
    if (process.env['ELECTRON_RENDERER_URL']) startDevBridge(handlers, (e) => emitters.add(e))
    if (!BROWSER_ONLY) createWindow()
  })
  app.on('window-all-closed', () => {
    if (!BROWSER_ONLY) app.quit()
  })
}
