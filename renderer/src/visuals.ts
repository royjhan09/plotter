import { Chart, registerables, type ChartConfiguration } from 'chart.js'
import { currentTheme } from './theme'

Chart.register(...registerables)

/** Plotter's chart palette: the icon's orange and greens first, then friendly companions. */
export const PALETTE = ['#e8590c', '#40c057', '#1c7ed6', '#f59f00', '#ae3ec9', '#12b886', '#fa5252', '#7950f2', '#69db7c', '#868e96']
const DARK_PALETTE = ['#f06a1d', '#51cf66', '#4dabf7', '#fcc419', '#cc5de8', '#38d9a9', '#ff6b6b', '#9775fa', '#8ce99a', '#adb5bd']
const palette = (): string[] => (currentTheme() === 'dark' ? DARK_PALETTE : PALETTE)

const alpha = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}
/** A theme colour as seen where the visual is drawn (the chat area has its own neutral colours). */
const cssVar = (name: string, at: Element = document.documentElement): string => getComputedStyle(at).getPropertyValue(name).trim()

Chart.defaults.font.family = "'Segoe UI Variable Text', 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif"

function showError(el: HTMLElement, what: string, src: string, err: unknown): void {
  el.innerHTML = ''
  const note = document.createElement('div')
  note.className = 'viz-error'
  note.textContent = `Couldn’t draw this ${what}: ${err instanceof Error ? err.message : String(err)}`
  const pre = document.createElement('pre')
  pre.textContent = src
  el.append(note, pre)
}

/** ```chart blocks: a Chart.js config as JSON. Missing colours get Plotter's palette for the current theme. */
export function renderChart(el: HTMLElement, src: string): () => void {
  let chart: Chart | null = null
  try {
    const dark = currentTheme() === 'dark'
    Chart.defaults.color = cssVar('--muted', el) || '#6b6b6b'
    Chart.defaults.borderColor = dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
    const colors = palette()
    const cfg = JSON.parse(src) as ChartConfiguration & { title?: string }
    if (!cfg.type || !cfg.data) throw new Error('needs "type" and "data"')
    const perPoint = ['pie', 'doughnut', 'polarArea'].includes(cfg.type as string)
    cfg.data.datasets?.forEach((ds, i) => {
      const d = ds as unknown as Record<string, unknown>
      const color = colors[i % colors.length]!
      const n = (ds.data as unknown[])?.length ?? 0
      if (perPoint) {
        d['backgroundColor'] ??= Array.from({ length: n }, (_, j) => colors[j % colors.length])
        d['borderColor'] ??= cssVar('--surface', el) || '#ffffff'
        d['borderWidth'] ??= 2
      } else {
        const line = cfg.type === 'line' || cfg.type === 'radar' || d['type'] === 'line'
        d['backgroundColor'] ??= line ? alpha(color, dark ? 0.25 : 0.18) : alpha(color, 0.85)
        d['borderColor'] ??= color
        if (line) {
          d['borderWidth'] ??= 2.5
          d['tension'] ??= 0.3
          d['pointRadius'] ??= 3
        } else {
          d['borderRadius'] ??= 6
        }
      }
    })
    const options = (cfg.options ??= {}) as Record<string, unknown>
    options['responsive'] = true
    options['maintainAspectRatio'] = false
    const plugins = (options['plugins'] ??= {}) as Record<string, unknown>
    if (cfg.title && !plugins['title']) plugins['title'] = { display: true, text: cfg.title, color: cssVar('--ink', el), font: { size: 15, weight: '600' } }
    el.innerHTML = ''
    el.classList.remove('diagram')
    const box = document.createElement('div')
    box.className = 'chart-box'
    const canvas = document.createElement('canvas')
    box.appendChild(canvas)
    el.appendChild(box)
    chart = new Chart(canvas, cfg)
  } catch (e) {
    showError(el, 'chart', src, e)
  }
  return () => chart?.destroy()
}

type Mermaid = typeof import('mermaid').default
let mermaidLib: Promise<Mermaid> | null = null
let mermaidTheme: string | null = null
let seq = 0

function mermaidVariables(dark: boolean): Record<string, string> {
  const p = dark ? DARK_PALETTE : PALETTE
  const pies = Object.fromEntries(p.slice(0, 8).map((c, i) => [`pie${i + 1}`, c]))
  return dark
    ? {
        primaryColor: '#3a2a20',
        primaryBorderColor: '#f06a1d',
        primaryTextColor: '#ececec',
        secondaryColor: '#1d3122',
        secondaryBorderColor: '#51cf66',
        tertiaryColor: '#2a2a2a',
        lineColor: '#a3a3a3',
        textColor: '#ececec',
        mainBkg: '#3a2a20',
        nodeBorder: '#f06a1d',
        clusterBkg: '#2a2a2a',
        edgeLabelBackground: '#212121',
        noteBkgColor: '#2f2f2f',
        noteTextColor: '#ececec',
        noteBorderColor: '#424242',
        background: '#2a2a2a',
        pieTitleTextColor: '#ececec',
        pieLegendTextColor: '#ececec',
        ...pies
      }
    : {
        primaryColor: '#fde3cf',
        primaryBorderColor: '#e8590c',
        primaryTextColor: '#1f1f1f',
        secondaryColor: '#e3f7e6',
        secondaryBorderColor: '#40c057',
        tertiaryColor: '#f9f9f9',
        lineColor: '#8a8a8a',
        textColor: '#1f1f1f',
        noteBkgColor: '#f9f9f9',
        noteBorderColor: '#d6d6d6',
        ...pies
      }
}

/** ```mermaid blocks: flowcharts, sequence, timelines, mind maps, pie, gantt … in Plotter's colours. */
export async function renderMermaid(el: HTMLElement, src: string): Promise<void> {
  try {
    mermaidLib ??= import('mermaid').then((m) => m.default)
    const mermaid = await mermaidLib
    const theme = currentTheme()
    if (mermaidTheme !== theme) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        darkMode: theme === 'dark',
        fontFamily: "'Segoe UI Variable Text', 'Segoe UI', 'Malgun Gothic', sans-serif",
        themeVariables: mermaidVariables(theme === 'dark')
      })
      mermaidTheme = theme
    }
    const { svg } = await mermaid.render(`mmd-${Date.now()}-${seq++}`, src)
    el.innerHTML = svg
    el.classList.add('diagram')
    // Mermaid draws at width:100%; use the drawing's own width so labels stay readable (wide ones scroll).
    const node = el.querySelector('svg')
    const w = node?.viewBox.baseVal?.width
    if (node && w) {
      node.removeAttribute('width')
      node.style.width = `${Math.round(w)}px`
    }
  } catch (e) {
    document.querySelectorAll('[id^="dmmd-"]').forEach((n) => n.remove()) // mermaid's leftover error boxes
    showError(el, 'diagram', src, e)
  }
}

/**
 * ```ui blocks: model-written HTML/CSS/JS mockups (wireframes, cards, palettes, clickable quizzes …).
 * They run in a sandboxed iframe with scripts but no same-origin, served from Plotter's isolated preview
 * origin with a no-network policy (main/uiFrames.ts). The page reports its height by postMessage.
 */
export function renderUi(el: HTMLElement, src: string): () => void {
  const dark = currentTheme() === 'dark'
  el.innerHTML = '<div class="viz-wait">Drawing preview…</div>'
  el.classList.remove('diagram')
  el.classList.add('ui')
  let frame: HTMLIFrameElement | null = null
  let gone = false
  const onMessage = (e: MessageEvent): void => {
    if (!frame || e.source !== frame.contentWindow) return
    const h = (e.data as { plotterUiHeight?: unknown } | null)?.plotterUiHeight
    if (typeof h === 'number' && h > 0) frame.style.height = `${Math.min(Math.ceil(h), 4000)}px`
  }
  window.addEventListener('message', onMessage)
  window.plotter.ui
    .put(src, dark)
    .then((id) => {
      if (gone) return
      frame = document.createElement('iframe')
      frame.className = 'ui-frame'
      frame.setAttribute('sandbox', window.plotter.ui.sandbox)
      frame.setAttribute('referrerpolicy', 'no-referrer')
      frame.title = 'Interactive preview'
      frame.src = window.plotter.ui.frameUrl(id)
      el.innerHTML = ''
      el.appendChild(frame)
    })
    .catch((e: unknown) => showError(el, 'preview', src, e))
  return () => {
    gone = true
    window.removeEventListener('message', onMessage)
  }
}
