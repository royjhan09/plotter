import { memo, useEffect, useMemo, useRef } from 'react'
import { Marked, type Tokens } from 'marked'
import { markedHighlight } from 'marked-highlight'
import markedKatex from 'marked-katex-extension'
import hljs from 'highlight.js/lib/common'
import DOMPurify from 'dompurify'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/atom-one-dark.css'
import { renderChart, renderMermaid, renderUi } from './visuals'
import { useTheme } from './theme'

/**
 * Replies as rich Markdown: tables, highlighted code, math (KaTeX), coloured callouts (> [!TIP] …), and
 * visual blocks (```chart, ```mermaid, ```ui). A reply is split into text pieces and visual pieces; each
 * visual is drawn as soon as its block is complete, while the rest of the reply is still streaming.
 */

const VISUAL_LANGS = new Set(['chart', 'mermaid', 'ui'])
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
        return `<div class="viz" data-kind="${lang}" data-src="${toB64(token.text)}"><div class="viz-wait">${lang === 'chart' ? 'Drawing chart…' : lang === 'ui' ? 'Drawing preview…' : 'Drawing diagram…'}</div></div>`
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

/** Web citations like ([example.com](url)) → a small source chip, as in ChatGPT. */
function citeChips(html: string): string {
  return html.replace(/\(\s*<a href="([^"]+)"[^>]*>((?:www\.)?[\w-]+(?:\.[\w-]+)+)<\/a>\s*\)/g, (_m, href: string, site: string) => ` <a class="cite" href="${href}">${site.replace(/^www\./, '')}</a>`)
}

function toHtml(text: string): string {
  // Web-search answers sometimes carry empty citation links like ([]()): drop them.
  const tidy = text.replace(/\s*\(\[\]\([^)]*\)\)/g, '').replace(/\[\]\([^)]*\)/g, '')
  const raw = md.parse(normalizeMath(tidy), { async: false })
  const clean = DOMPurify.sanitize(callouts(raw), { USE_PROFILES: { html: true, svg: true, mathMl: true }, ADD_ATTR: ['target'] })
  return citeChips(clean).replace(/<a /g, '<a target="_blank" rel="noreferrer" ')
}

type Piece = { kind: 'text'; text: string } | { kind: 'visual'; lang: string; src: string } | { kind: 'pending'; lang: string }

/** Splits a reply at top-level ```chart / ```mermaid / ```ui blocks. An unclosed block at the end is "pending". */
function splitPieces(text: string): Piece[] {
  const lines = text.split('\n')
  const pieces: Piece[] = []
  let buf: string[] = []
  const flush = (): void => {
    if (buf.join('').trim()) pieces.push({ kind: 'text', text: buf.join('\n') })
    buf = []
  }
  for (let i = 0; i < lines.length; i++) {
    const open = /^```[ \t]*(chart|mermaid|ui)[ \t]*$/i.exec(lines[i]!.trimEnd())
    if (!open) {
      buf.push(lines[i]!)
      continue
    }
    const lang = open[1]!.toLowerCase()
    let close = -1
    for (let j = i + 1; j < lines.length; j++) {
      if (/^```[ \t]*$/.test(lines[j]!.trimEnd())) {
        close = j
        break
      }
    }
    flush()
    if (close < 0) {
      pieces.push({ kind: 'pending', lang })
      return pieces
    }
    pieces.push({ kind: 'visual', lang, src: lines.slice(i + 1, close).join('\n') })
    i = close
  }
  flush()
  return pieces
}

const WAIT: Record<string, string> = { chart: 'Drawing chart…', mermaid: 'Drawing diagram…', ui: 'Drawing preview…' }

/** One finished visual. Memoised on its source, so later text arriving does not redraw it. */
const Visual = memo(function Visual({ lang, src }: { lang: string; src: string }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const theme = useTheme()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (lang === 'chart') return renderChart(el, src)
    if (lang === 'ui') return renderUi(el, src)
    void renderMermaid(el, src)
    return undefined
  }, [lang, src, theme])
  return <div ref={ref} className="viz" />
})

/** A text piece. Copy buttons on code; any visual nested inside (e.g. in a list) is drawn once settled. */
const TextPiece = memo(function TextPiece({ text, live }: { text: string; live: boolean }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const theme = useTheme()
  const html = useMemo(() => toHtml(text), [text])
  useEffect(() => {
    const root = ref.current
    if (!root) return
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
    if (live) return
    const cleanups: (() => void)[] = []
    root.querySelectorAll<HTMLDivElement>('.viz[data-src]').forEach((el) => {
      const src = new TextDecoder().decode(Uint8Array.from(atob(el.dataset['src'] ?? ''), (c) => c.charCodeAt(0)))
      if (el.dataset['kind'] === 'chart') cleanups.push(renderChart(el, src))
      else if (el.dataset['kind'] === 'ui') cleanups.push(renderUi(el, src))
      else void renderMermaid(el, src)
    })
    return () => cleanups.forEach((c) => c())
  }, [html, live, theme])
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
})

export function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }): React.JSX.Element {
  const pieces = useMemo(() => splitPieces(text), [text])
  return (
    <div className="md">
      {pieces.map((p, i) => {
        const last = i === pieces.length - 1
        if (p.kind === 'visual') return <Visual key={i} lang={p.lang} src={p.src} />
        if (p.kind === 'pending')
          return streaming ? (
            <div key={i} className="viz">
              <div className="viz-wait">{WAIT[p.lang]}</div>
            </div>
          ) : (
            // the reply ended inside an unclosed block: show what there is as code
            <TextPiece key={i} text={text.slice(text.lastIndexOf('```'))} live={false} />
          )
        return <TextPiece key={i} text={p.text} live={streaming && last} />
      })}
    </div>
  )
}
