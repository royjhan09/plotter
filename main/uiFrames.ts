import { randomUUID } from 'node:crypto'

/**
 * Interactive ```ui previews. The model's HTML may contain scripts (a quiz that checks answers, tabs,
 * toggles), so it must never run inside Plotter's own page. Each preview is stored here under a random id
 * and served as its own document, from a separate origin, with a strict policy:
 *   - the iframe is sandboxed with allow-scripts only (no allow-same-origin), so it gets an opaque origin:
 *     no access to Plotter's page, storage, cookies or the preload bridge;
 *   - the response's Content-Security-Policy allows inline script and style but no network at all
 *     (no fetch, no remote images, fonts or scripts), so nothing can be sent anywhere;
 *   - no forms, popups or top-level navigation (not granted by the sandbox).
 * The page tells Plotter its height with postMessage so the card fits the content.
 */

const MAX = 300
const frames = new Map<string, string>()

export const UI_FRAME_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; form-action 'none'; base-uri 'none'"

/** Keeps a preview's HTML and returns its id. */
export function putUiFrame(html: string, dark: boolean): string {
  const id = randomUUID()
  frames.set(id, wrap(html, dark))
  while (frames.size > MAX) frames.delete(frames.keys().next().value!)
  return id
}

export function getUiFrame(id: string): string | undefined {
  return frames.get(id)
}

function wrap(body: string, dark: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="color-scheme" content="${dark ? 'dark' : 'light'}">
<style>
  html, body { margin: 0; background: transparent; }
  body { padding: 2px; font: 14px/1.5 'Segoe UI Variable Text', 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif;
         color: ${dark ? '#ececec' : '#1f1f1f'}; overflow: hidden; }
  * { box-sizing: border-box; }
  img, svg { max-width: 100%; }
  button { font: inherit; cursor: pointer; }
</style></head><body>${body}
<script>
  (function () {
    var last = 0;
    function report() {
      var h = Math.ceil(document.documentElement.scrollHeight);
      if (h !== last) { last = h; parent.postMessage({ plotterUiHeight: h }, '*'); }
    }
    new ResizeObserver(report).observe(document.documentElement);
    window.addEventListener('load', report);
    report();
  })();
</script></body></html>`
}
