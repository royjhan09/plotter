import { app, BrowserWindow, session } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { LocalTool } from './openai'
import type { Attachment, PythonStatus } from '../shared/api'

/**
 * run_python: Python 3 (Pyodide, WebAssembly) in a hidden, sandboxed window with its own session.
 *  - no Node, no preload, no access to the user's disk; files reach it only when the user attached them;
 *  - its page may load only from plotter-py://, which serves Pyodide's own files and its packages; packages
 *    are downloaded once from Pyodide's CDN, checked against the SHA-256 in pyodide-lock.json, then cached;
 *  - no other network at all (CSP), so code cannot send anything anywhere;
 *  - a run longer than RUN_TIMEOUT_MS is stopped by destroying the window.
 */

export const PY_SCHEME = 'plotter-py'
const PARTITION = 'plotter-python'
const RUN_TIMEOUT_MS = 120_000
const MAX_OUT = 20_000

const pyodideDir = (): string => dirname(require.resolve('pyodide/package.json'))
const cacheDir = (): string => join(app.getPath('userData'), 'pyodide')
let lock: { info: unknown; packages: Record<string, { file_name: string; sha256: string }> } | null = null
const lockFile = (): NonNullable<typeof lock> => (lock ??= JSON.parse(readFileSync(join(pyodideDir(), 'pyodide-lock.json'), 'utf8')))
const version = (): string => (JSON.parse(readFileSync(join(pyodideDir(), 'package.json'), 'utf8')) as { version: string }).version

let status: PythonStatus = { state: 'idle' }
const listeners = new Set<(s: PythonStatus) => void>()
function setStatus(s: PythonStatus): void {
  status = s
  listeners.forEach((l) => l(s))
}
export const pythonStatus = (): PythonStatus => status
export function onPythonStatus(l: (s: PythonStatus) => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

const PAGE_CSP =
  "default-src 'none'; script-src plotter-py: 'unsafe-eval' 'wasm-unsafe-eval'; connect-src plotter-py:; style-src 'unsafe-inline'; img-src data: blob:"

const PAGE = `<!doctype html><meta charset="utf-8"><title>python</title><script type="module" src="runner.mjs"></script>`

const RUNNER = String.raw`
import { loadPyodide } from './pyodide.mjs'
let py = null
let busyLog = null
window.pyReady = (async () => {
  py = await loadPyodide({ indexURL: 'plotter-py://app/', stdout: () => {}, stderr: () => {} })
  py.runPython("import os; os.environ['MPLBACKEND'] = 'Agg'")
  return true
})()
window.pyStatus = () => busyLog
window.runPython = async (payload) => {
  await window.pyReady
  const out = [], err = []
  py.setStdout({ batched: (s) => out.push(s) })
  py.setStderr({ batched: (s) => err.push(s) })
  py.FS.mkdirTree('/data')
  for (const f of payload.files) {
    const data = f.b64 ? Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0)) : f.text
    py.FS.writeFile(f.path, data)
  }
  const loaded = []
  await py.loadPackagesFromImports(payload.code, { messageCallback: (m) => { busyLog = m; loaded.push(m) }, errorCallback: (m) => err.push(m) })
  busyLog = null
  if (!window.fontReady && /matplotlib/.test(payload.code)) {
    // Korean (and Latin) chart labels: Windows' Malgun Gothic, served from this PC by plotter-py://app/fonts/
    window.fontReady = true
    try {
      const res = await fetch('plotter-py://app/fonts/malgun.ttf')
      if (res.ok) {
        py.FS.mkdirTree('/fonts')
        py.FS.writeFile('/fonts/malgun.ttf', new Uint8Array(await res.arrayBuffer()))
        py.runPython("from matplotlib import font_manager as _fm\nimport matplotlib as _mpl\n_fm.fontManager.addfont('/fonts/malgun.ttf')\n_mpl.rcParams['font.family'] = 'Malgun Gothic'\n_mpl.rcParams['axes.unicode_minus'] = False")
      }
    } catch (e) { err.push('font setup: ' + e) }
  }
  let result = null, error = null, figures = []
  try {
    const r = await py.runPythonAsync(payload.code)
    if (r !== undefined && r !== null) {
      result = String(r && r.toString ? r.toString() : r)
      if (r && r.destroy) r.destroy()
    }
  } catch (e) {
    error = String(e && e.message ? e.message : e)
  }
  try {
    const figs = py.runPython(` + '`' + String.raw`
import sys, json
_figs = []
if 'matplotlib.pyplot' in sys.modules:
    import io, base64
    import matplotlib.pyplot as _plt
    for _n in _plt.get_fignums():
        _b = io.BytesIO()
        _plt.figure(_n).savefig(_b, format='png', dpi=110, bbox_inches='tight')
        _figs.append(base64.b64encode(_b.getvalue()).decode())
    _plt.close('all')
json.dumps(_figs)
` + '`' + String.raw`)
    figures = JSON.parse(figs)
  } catch (e) { err.push('figure export: ' + e) }
  return { stdout: out.join('\n'), stderr: err.join('\n'), result, error, figures }
}
`

/** plotter-py://app/<file>: the page, the runner, Pyodide's own files, and verified, cached packages. */
async function serve(req: Request): Promise<Response> {
  const name = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''))
  const headers = (type: string): Record<string, string> => ({ 'Content-Type': type, 'Content-Security-Policy': PAGE_CSP })
  if (name === 'index.html') return new Response(PAGE, { headers: headers('text/html; charset=utf-8') })
  if (name === 'runner.mjs') return new Response(RUNNER, { headers: headers('text/javascript') })
  const own: Record<string, string> = {
    'pyodide.mjs': 'text/javascript',
    'pyodide.asm.mjs': 'text/javascript',
    'pyodide.asm.wasm': 'application/wasm',
    'python_stdlib.zip': 'application/zip',
    'pyodide-lock.json': 'application/json'
  }
  if (own[name]) return new Response(readFileSync(join(pyodideDir(), name)), { headers: headers(own[name]!) })
  if (name === 'fonts/malgun.ttf') {
    const font = join(process.env['WINDIR'] ?? 'C:\\Windows', 'Fonts', 'malgun.ttf')
    return existsSync(font) ? new Response(readFileSync(font), { headers: headers('font/ttf') }) : new Response('not found', { status: 404 })
  }
  // a package wheel: only files listed in the lock file, checked against its SHA-256
  const pkg = Object.values(lockFile().packages).find((p) => p.file_name === name)
  if (!pkg) return new Response('not found', { status: 404 })
  const cached = join(cacheDir(), name)
  if (!existsSync(cached)) {
    setStatus({ state: 'loading', detail: `Downloading ${name.split('-')[0]} (first time only)…` })
    const res = await fetch(`https://cdn.jsdelivr.net/pyodide/v${version()}/full/${name}`)
    if (!res.ok) return new Response('download failed', { status: 502 })
    const bytes = Buffer.from(await res.arrayBuffer())
    if (createHash('sha256').update(bytes).digest('hex') !== pkg.sha256) return new Response('checksum mismatch', { status: 502 })
    mkdirSync(cacheDir(), { recursive: true })
    writeFileSync(cached, bytes)
  }
  return new Response(readFileSync(cached), { headers: headers('application/zip') })
}

let win: BrowserWindow | null = null
let ready: Promise<BrowserWindow> | null = null
let protocolDone = false

function start(): Promise<BrowserWindow> {
  if (ready) return ready
  ready = (async () => {
    const ses = session.fromPartition(PARTITION)
    if (!protocolDone) {
      ses.protocol.handle(PY_SCHEME, serve)
      ses.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
      protocolDone = true
    }
    setStatus({ state: 'loading', detail: 'Starting Python…' })
    const w = new BrowserWindow({
      show: false,
      webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true }
    })
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    w.webContents.on('will-navigate', (e) => e.preventDefault())
    w.on('closed', () => {
      if (win === w) {
        win = null
        ready = null
      }
    })
    await w.loadURL(`${PY_SCHEME}://app/index.html`)
    await w.webContents.executeJavaScript('window.pyReady')
    win = w
    setStatus({ state: 'ready' })
    return w
  })().catch((e: unknown) => {
    ready = null
    setStatus({ state: 'error', message: e instanceof Error ? e.message : String(e) })
    throw e
  })
  return ready
}

interface RunResult {
  stdout: string
  stderr: string
  result: string | null
  error: string | null
  figures: string[]
}

/** Files Python can open: sheets as CSV per sheet, text/doc as text, other originals as bytes. */
function filesFor(attachments: Attachment[]): { path: string; text?: string; b64?: string }[] {
  const files: { path: string; text?: string; b64?: string }[] = []
  const safe = (s: string): string => s.replace(/[\\/:*?"<>|]/g, '_')
  for (const a of attachments) {
    if (a.kind === 'sheet' && a.sheets) for (const s of a.sheets) files.push({ path: `/data/${safe(a.name.replace(/\.[^.]+$/, ''))}__${safe(s.name)}.csv`, text: s.csv })
    else if (a.kind === 'text') files.push({ path: `/data/${safe(a.name)}`, text: a.data })
    else if (a.kind === 'doc') files.push({ path: `/data/${safe(a.name)}.txt`, text: a.data })
    if (a.raw && a.kind !== 'text') files.push({ path: `/data/${safe(a.name)}`, b64: a.raw.slice(a.raw.indexOf(',') + 1) })
  }
  return files
}

export async function runPython(code: string, attachments: Attachment[], signal: AbortSignal): Promise<RunResult> {
  const w = await start()
  const payload = JSON.stringify({ code, files: filesFor(attachments) })
  let timer: NodeJS.Timeout | undefined
  const kill = (): void => {
    if (!w.isDestroyed()) w.destroy()
  }
  signal.addEventListener('abort', kill, { once: true })
  try {
    return await Promise.race([
      w.webContents.executeJavaScript(`window.runPython(${payload})`) as Promise<RunResult>,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          kill()
          reject(new Error(`Python took longer than ${RUN_TIMEOUT_MS / 1000}s and was stopped.`))
        }, RUN_TIMEOUT_MS)
      })
    ])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', kill)
    if (status.state === 'loading') setStatus({ state: 'ready' })
  }
}

const clip = (s: string): string => (s.length > MAX_OUT ? `${s.slice(0, MAX_OUT)}\n… (${s.length - MAX_OUT} more characters)` : s)

export function pythonTool(files: () => Attachment[]): LocalTool {
  return {
    name: 'run_python',
    description: 'Run Python 3 code (numpy, pandas, matplotlib, scipy available; no internet). Attached files are under /data. Returns stdout, the last expression value, errors, and how many figures were produced.',
    parameters: { type: 'object', properties: { code: { type: 'string', description: 'Complete Python code to run.' } }, required: ['code'] },
    label: () => (status.state === 'loading' ? status.detail : 'Running Python…'),
    run: async (args, signal) => {
      const code = String(args['code'] ?? '')
      const r = await runPython(code, files(), signal)
      const text = [r.stdout, r.result ? `→ ${r.result}` : ''].filter(Boolean).join('\n')
      return {
        output: JSON.stringify({ stdout: clip(r.stdout), result: r.result, error: r.error ? clip(r.error) : null, stderr: clip(r.stderr), figures: r.figures.length }),
        run: {
          kind: 'python',
          title: r.error ? 'Python error' : 'Ran Python',
          code,
          output: clip(text),
          error: r.error ? clip(r.error) : undefined,
          figures: r.figures.map((b) => `data:image/png;base64,${b}`)
        }
      }
    }
  }
}
