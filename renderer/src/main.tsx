import { createRoot } from 'react-dom/client'
import './plotter.css'
import { applyTheme } from './theme'

/** ?print=<chat id> is the hidden window that makes PDFs: always light, only the conversation. */
const params = new URLSearchParams(location.search)
const printChat = params.get('print')

applyTheme(printChat ? 'light' : undefined) // before the first paint, so dark mode never flashes light

/** In a plain browser during development there is no Electron preload: use the dev bridge instead.
 *  The app is imported only afterwards, because its modules read window.plotter when they load. */
async function start(): Promise<void> {
  if (import.meta.env.DEV && !window.plotter) (await import('./devBridgeClient')).installDevBridge()
  const root = createRoot(document.getElementById('root')!)
  if (printChat) {
    const { PrintView } = await import('./PrintView')
    root.render(<PrintView chatId={printChat} messageId={params.get('msg') ?? undefined} />)
    return
  }
  const { App } = await import('./App')
  root.render(<App />)
}

void start()
