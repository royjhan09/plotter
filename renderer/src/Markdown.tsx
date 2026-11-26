import { useEffect, useMemo, useRef } from 'react'
import { Marked, type Tokens } from 'marked'
import { markedHighlight } from 'marked-highlight'
import markedKatex from 'marked-katex-extension'
import hljs from 'highlight.js/lib/common'
import DOMPurify from 'dompurify'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/atom-one-dark.css'
import { renderChart, renderMermaid } from './visuals'
import { useTheme } from './theme'

/**
 * Replies as rich Markdown: tables, highlighted code, math (KaTeX), coloured callouts
 * (> [!TIP] …), and two visual blocks drawn after the reply finishes:
 *   ```chart   Chart.js JSON config   → a real chart
 *   ```mermaid Mermaid source         → a diagram
 */

const VISUAL_LANGS = new Set(['chart', 'mermaid'])
const toB64 = (s: string): string => btoa(String.fromCharCode(...new TextEncoder().encode(s)))

const md = new Marked(
  { gfm: true, breaks: true },
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      if (VISUAL_LANGS.has(lang)) return code
      const language = hljs.getLanguage(lang) ? lang : 'plaintext'
      return hljs.highlight(code, { language }).value
    }
  }),
  markedKatex({ throwOnError: false, nonStandard: true, output: 'html' }),
  {
    renderer: {
      code(token: Tokens.Code) {
        const lang = (token.lang ?? '').trim().toLowerCase()
        if (!VISUAL_LANGS.has(lang)) return false
        return `<div class="viz" data-kind="${lang}" data-src="${toB64(token.text)}"><div class="viz-wait">${lang === 'chart' ? 'Drawing chart…' : 'Drawing diagram…'}</div></div>`
      },
      table(token: Tokens.Table) {
        // default table, wrapped so wide tables scroll instead of squeezing
        const head = token.header.map((c, i) => `<th${align(token.align[i])}>${this.parser.parseInline(c.tokens)}</th>`).join('')
        const rows = token.rows
          .map((r) => `<tr>${r.map((c, i) => `<td${align(token.align[i])}>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`)
          .join('')
        return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
      }
    }
  }
)

function align(a: 'center' | 'left' | 'right' | null | undefined): string {
  return a ? ` style="text-align:${a}"` : ''
}

/** \( … \) and \[ … \] → $ … $ and $$ … $$ (models use both), outside code. */
function normalizeMath(text: string): string {
  return text
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/\\\[([\s\S]+?)\\\]/g, (_m, m: string) => `\n$$\n${m.trim()}\n$$\n`).replace(/\\\(([\s\S]+?)\\\)/g, (_m, m: string) => `$${m.trim()}$`)
    )
    .join('')
}

const CALLOUT_TITLES: Record<string, string> = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' }

/** GitHub-style alerts: > [!TIP] … → a coloured box. */
function callouts(html: string): string {
  return html.replace(/<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(?:<br>)?\s*/gi, (_m, kind: string) => {
    const k = kind.toLowerCase()
    return `<blockquote class="callout ${k}"><p class="callout-title">${CALLOUT_TITLES[k]}</p><p>`
  })
}

export function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const theme = useTheme()
  const html = useMemo(() => {
    // Web-search answers sometimes carry empty citation links like ([]()): drop them.
    const tidy = text.replace(/\s*\(\[\]\([^)]*\)\)/g, '').replace(/\[\]\([^)]*\)/g, '')
    const raw = md.parse(normalizeMath(tidy), { async: false })
    const clean = DOMPurify.sanitize(callouts(raw), { USE_PROFILES: { html: true, svg: true, mathMl: true }, ADD_ATTR: ['target'] })
    return clean.replace(/<a /g, '<a target="_blank" rel="noreferrer" ')
  }, [text])

  // Draw charts/diagrams (again when the theme changes) and add copy buttons once the reply is complete.
  useEffect(() => {
    const root = ref.current
    if (!root || streaming) return
    const cleanups: (() => void)[] = []
    root.querySelectorAll<HTMLDivElement>('.viz[data-src]').forEach((el) => {
      const src = new TextDecoder().decode(Uint8Array.from(atob(el.dataset['src'] ?? ''), (c) => c.charCodeAt(0)))
      if (el.dataset['kind'] === 'chart') cleanups.push(renderChart(el, src))
      else void renderMermaid(el, src)
    })
    root.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.copy')) return
      const b = document.createElement('button')
      b.className = 'copy'
      b.textContent = 'Copy'
      b.onclick = () => {
        void navigator.clipboard.writeText(pre.querySelector('code')?.innerText ?? pre.innerText)
        b.textContent = 'Copied'
        setTimeout(() => (b.textContent = 'Copy'), 1500)
      }
      pre.appendChild(b)
    })
    return () => cleanups.forEach((c) => c())
  }, [html, streaming, theme])

  return <div ref={ref} className="md" dangerouslySetInnerHTML={{ __html: html }} />
}
