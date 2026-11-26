// `npm run dev:browser`: Plotter's dev server without an Electron window. Open http://localhost:5173 in a
// browser (e.g. Claude's browser pane); the page talks to this Plotter process over the dev bridge.
import { spawn } from 'node:child_process'

const child = spawn('npx', ['electron-vite', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PLOTTER_BROWSER_ONLY: '1' }
})
child.on('exit', (code) => process.exit(code ?? 0))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig))
