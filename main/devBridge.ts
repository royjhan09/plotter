import { createServer, type ServerResponse } from 'node:http'

/**
 * Development only (started when ELECTRON_RENDERER_URL is set, i.e. `npm run dev` / `dev:browser`):
 * lets the UI run in an ordinary browser tab (e.g. Claude's browser pane) while building. The page has
 * no Electron preload there, so renderer/src/devBridgeClient.ts calls these same handlers over HTTP:
 *   POST /rpc     {channel, args}  → handler result
 *   GET  /events  server-sent events: reply:event, speech:status
 * Listens on 127.0.0.1 only and answers only the dev server's own origin. Never runs in a built app.
 */

export const DEV_BRIDGE_PORT = 5199

type Handlers = Record<string, (...args: never[]) => unknown>
type Emit = (channel: string, payload: unknown) => void

export function startDevBridge(handlers: Handlers, subscribe: (emit: Emit) => void): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!devUrl) return
  const allowed = new Set([new URL(devUrl).origin, new URL(devUrl).origin.replace('localhost', '127.0.0.1'), new URL(devUrl).origin.replace('127.0.0.1', 'localhost')])
  const clients = new Set<ServerResponse>()

  subscribe((channel, payload) => {
    const line = `event: ${channel}\ndata: ${JSON.stringify(payload)}\n\n`
    for (const c of clients) c.write(line)
  })

  const server = createServer((req, res) => {
    const origin = req.headers.origin ?? ''
    if (!allowed.has(origin)) {
      res.writeHead(403).end()
      return
    }
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Vary', 'Origin')
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }

    if (req.method === 'GET' && req.url === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      res.write(': connected\n\n')
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }

    if (req.method === 'POST' && req.url === '/rpc') {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', async () => {
        try {
          const { channel, args } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { channel: string; args: unknown[] }
          const fn = handlers[channel] as ((...a: unknown[]) => unknown) | undefined
          if (!fn) throw new Error(`unknown call ${channel}`)
          // Float32Array travels as {$f32: base64}
          const decoded = args.map((a) =>
            a && typeof a === 'object' && '$f32' in a ? new Float32Array(new Uint8Array(Buffer.from((a as { $f32: string }).$f32, 'base64')).buffer) : a
          )
          const result = await fn(...decoded)
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, result: result ?? null }))
        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }))
        }
      })
      return
    }
    res.writeHead(404).end()
  })
  server.on('error', (e) => console.error(`[plotter] dev bridge could not start on ${DEV_BRIDGE_PORT}:`, e.message))
  server.listen(DEV_BRIDGE_PORT, '127.0.0.1', () => console.log(`[plotter] dev bridge on http://127.0.0.1:${DEV_BRIDGE_PORT} for ${devUrl}`))
}
