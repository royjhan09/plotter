import { writeFile } from 'node:fs/promises'
import { app, BrowserWindow, dialog, ipcMain, shell, nativeImage, nativeTheme, protocol, session } from 'electron'
import { join } from 'node:path'
import { authState, cancelSignIn, loadSession, signIn, signOut } from './auth'
import { forgetModel, generateTitle, primaryModel, ReplyError } from './openai'
import { reply } from './assistant'
import { onPythonStatus, pythonStatus, PY_SCHEME } from './python'
import { connect as connectService, disconnect as disconnectService, listConnectors, setEnabled as setConnectorEnabled, setGoogleClient, setNotionToken } from './connectors'
import { onSpeechStatus, speechStatus, transcribe, warmSpeech } from './speech'
import { clearMemories, getChat, listChats, listMemories, readFeatures, readSettings, removeChat, removeMemory, saveChat, updateFeatures, updateSettings } from './store'
import { startDevBridge } from './devBridge'
import { getUiFrame, putUiFrame, UI_FRAME_CSP } from './uiFrames'
import { USAGE_URL, type Chat, type ConnectorId, type Features, type ReplyEvent, type SendRequest } from '../shared/api'

app.setName('Plotter')
// Interactive previews live on their own scheme/origin (see uiFrames.ts). Must be registered before ready.
protocol.registerSchemesAsPrivileged([
  { scheme: 'plotter-ui', privileges: { standard: true, secure: true } },
  // the sandboxed Python window loads Pyodide and its packages from here (see python.ts)
  { scheme: PY_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
])
if (process.platform === 'win32') app.setAppUserModelId('com.plotter.app')

/** `npm run dev:browser`: no Electron window; the UI runs in a browser and talks to this process over the dev bridge. */
const BROWSER_ONLY = process.env['PLOTTER_BROWSER_ONLY'] === '1' && !!process.env['ELECTRON_RENDERER_URL']

const iconPath = join(__dirname, '../../assets/icon.ico')
let win: BrowserWindow | null = null

const windowBackground = (): string => (nativeTheme.shouldUseDarkColors ? '#212121' : '#ffffff')

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
      nodeIntegration: false,
      plugins: true // Chromium's PDF viewer, for the PDF preview before downloading
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
  'chats:title': (userText: string, replyText: string) => generateTitle(userText, replyText),
  'ui:put': (html: string, dark: boolean) => putUiFrame(String(html), !!dark),

  'features:get': () => readFeatures(),
  'features:set': (patch: Partial<Features>) => updateFeatures(patch ?? {}),
  'memory:list': () => listMemories(),
  'memory:remove': (id: string) => removeMemory(String(id)),
  'memory:clear': () => clearMemories(),
  'connectors:list': () => listConnectors(),
  'connectors:setGoogleClient': (id: string, secret: string) => setGoogleClient(String(id), String(secret)),
  'connectors:setNotionToken': (token: string) => setNotionToken(String(token)),
  'connectors:connect': (id: ConnectorId) => connectService(id),
  'connectors:disconnect': (id: ConnectorId) => disconnectService(id),
  'connectors:setEnabled': (id: ConnectorId, on: boolean) => setConnectorEnabled(id, !!on),
  'python:status': () => pythonStatus(),

  'reply:send': (req: SendRequest) => {
    const ctrl = new AbortController()
    running.set(req.requestId, ctrl)
    const id = req.requestId
    void reply(
      req,
      {
        onDelta: (text) => sendReply({ requestId: id, type: 'delta', text }),
        onActivity: (label) => sendReply({ requestId: id, type: 'activity', label }),
        onSource: (s) => sendReply({ requestId: id, type: 'source', url: s.url, title: s.title }),
        onToolRun: (run) => sendReply({ requestId: id, type: 'tool', run })
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

  openUsage: () => shell.openExternal(USAGE_URL),

}

function registerIpc(): void {
  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_e, ...args: unknown[]) => (fn as (...a: unknown[]) => unknown)(...args))
  }
  emitters.add((channel, payload) => win?.webContents.send(channel, payload))
  onSpeechStatus((s) => emit('speech:status', s))
  onPythonStatus((s) => emit('python:status', s))
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
    protocol.handle('plotter-ui', (req) => {
      const id = new URL(req.url).pathname.replace(/^\//, '')
      const html = getUiFrame(id)
      if (!html) return new Response('Not found', { status: 404 })
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': UI_FRAME_CSP } })
    })
    registerIpc()
    if (process.env['ELECTRON_RENDERER_URL']) startDevBridge(handlers, (e) => emitters.add(e))
    if (!BROWSER_ONLY) createWindow()
  })
  app.on('window-all-closed', () => {
    if (!BROWSER_ONLY) app.quit()
  })
}
