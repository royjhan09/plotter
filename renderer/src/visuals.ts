import { Chart, registerables, type ChartConfiguration } from 'chart.js'

Chart.register(...registerables)

/** Plotter's chart palette: the icon's orange and greens first, then friendly companions. */
export const PALETTE = ['#e8590c', '#40c057', '#1c7ed6', '#f59f00', '#ae3ec9', '#12b886', '#fa5252', '#7950f2', '#69db7c', '#868e96']
const alpha = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

Chart.defaults.font.family = "'Segoe UI Variable Text', 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif"
Chart.defaults.color = '#5c4a38'
Chart.defaults.borderColor = 'rgba(59, 42, 26, 0.10)'

function showError(el: HTMLElement, what: string, src: string, err: unknown): void {
  el.innerHTML = ''
  const note = document.createElement('div')
  note.className = 'viz-error'
  note.textContent = `Couldn’t draw this ${what}: ${err instanceof Error ? err.message : String(err)}`
  const pre = document.createElement('pre')
  pre.textContent = src
  el.append(note, pre)
}

/** ```chart blocks: a Chart.js config as JSON. Missing colours get Plotter's palette. */
export function renderChart(el: HTMLElement, src: string): () => void {
  let chart: Chart | null = null
  try {
    const cfg = JSON.parse(src) as ChartConfiguration & { title?: string }
    if (!cfg.type || !cfg.data) throw new Error('needs "type" and "data"')
    const perPoint = ['pie', 'doughnut', 'polarArea'].includes(cfg.type as string)
    cfg.data.datasets?.forEach((ds, i) => {
      const d = ds as unknown as Record<string, unknown>
      const color = PALETTE[i % PALETTE.length]!
      const n = (ds.data as unknown[])?.length ?? 0
      if (perPoint) {
        d['backgroundColor'] ??= Array.from({ length: n }, (_, j) => PALETTE[j % PALETTE.length])
        d['borderColor'] ??= '#fffaf3'
        d['borderWidth'] ??= 2
      } else {
        const line = cfg.type === 'line' || cfg.type === 'radar' || d['type'] === 'line'
        d['backgroundColor'] ??= line ? alpha(color, 0.18) : alpha(color, 0.85)
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
    if (cfg.title && !plugins['title']) plugins['title'] = { display: true, text: cfg.title, font: { size: 15, weight: '600' } }
    el.innerHTML = ''
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

let mermaidReady: Promise<typeof import('mermaid').default> | null = null
let seq = 0

/** ```mermaid blocks: flowcharts, sequence, timelines, mind maps, pie, gantt … in Plotter's colours. */
export async function renderMermaid(el: HTMLElement, src: string): Promise<void> {
  try {
    mermaidReady ??= import('mermaid').then((m) => {
      m.default.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        fontFamily: "'Segoe UI Variable Text', 'Segoe UI', 'Malgun Gothic', sans-serif",
        themeVariables: {
          primaryColor: '#fde3cf',
          primaryBorderColor: '#e8590c',
          primaryTextColor: '#3b2a1a',
          secondaryColor: '#e3f7e6',
          secondaryBorderColor: '#40c057',
          tertiaryColor: '#fff4e6',
          lineColor: '#8a7460',
          textColor: '#3b2a1a',
          noteBkgColor: '#fff4e6',
          noteBorderColor: '#ecd3b6',
          pie1: PALETTE[0],
          pie2: PALETTE[1],
          pie3: PALETTE[2],
          pie4: PALETTE[3],
          pie5: PALETTE[4],
          pie6: PALETTE[5],
          pie7: PALETTE[6],
          pie8: PALETTE[7]
        }
      })
      return m.default
    })
    const mermaid = await mermaidReady
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
