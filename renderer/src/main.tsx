import { createRoot } from 'react-dom/client'
import './plotter.css'

/** In a plain browser during development there is no Electron preload: use the dev bridge instead.
 *  The app is imported only afterwards, because its modules read window.plotter when they load. */
async function start(): Promise<void> {
  if (import.meta.env.DEV && !window.plotter) (await import('./devBridgeClient')).installDevBridge()
  const { App } = await import('./App')
  createRoot(document.getElementById('root')!).render(<App />)
}

void start()
