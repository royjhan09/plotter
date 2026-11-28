import { createRoot } from 'react-dom/client'
import './plotter.css'
import { applyTheme } from './theme'

/** ?print=<chat id> is the hidden window that makes PDFs: always light, only the conversation. */
const params = new URLSearchParams(location.search)
const printChat = params.get('print')

applyTheme(printChat ? 'light' : undefined) // before the first paint, so dark mode never flashes light

/** In a plain browser during development there is no Electron preload: use the dev bridge instead.
 *  The app is imported only afterwards, because its modules read window.plotter when they load. */
/** Plotter's own address opened in its browser pane: an iframe of the dev window, or the app's webview (no preload). */
function insideOwnBrowser(): boolean {
  if (navigator.userAgent.includes('Electron') && !window.plotter) return true
  if (window.top === window.self) return false
  try {
    return !!window.parent.document.querySelector('.browser-pane')
  } catch {
    return false // framed by another site: not Plotter's pane
  }
}

async function start(): Promise<void> {
  const root = createRoot(document.getElementById('root')!)
  if (insideOwnBrowser()) {
    root.render(
      <div className="own-browser-note">
        <b>This is Plotter itself.</b>
        <span>Plotter does not open inside its own browser. Open another address above.</span>
      </div>
    )
    return
  }
  if (import.meta.env.DEV && !window.plotter) (await import('./devBridgeClient')).installDevBridge()
  if (printChat) {
    const { PrintView } = await import('@private/renderer/PrintView')
    root.render(<PrintView chatId={printChat} messageId={params.get('msg') ?? undefined} />)
    return
  }
  const { App } = await import('./App')
  root.render(<App />)
}

void start()
