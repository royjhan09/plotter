import { accessToken } from './auth'
import type { HistoryItem, Model } from '../shared/api'

/**
 * Calls to the Responses API with the ChatGPT-plan access token. Preview rules
 * (developers.openai.com/siwc/token-sharing-open-source/preview-limitations): store:false, stream:true,
 * no previous_response_id (history is resent), no system-role items (use `instructions`), and none of
 * temperature/top_p/max_output_tokens/metadata/user/etc.
 */

const API = 'https://api.openai.com/v1'

/** Tells the model what Plotter's window can draw, so it answers as visually as ChatGPT does. */
const INSTRUCTIONS = `You are Plotter, a friendly, capable assistant in a personal desktop app. Reply in the user's language.

Make answers clear and visual when it helps understanding. Plotter renders all of the following:
- Markdown: headings, **bold**, lists, checklists (- [ ] / - [x]), tables, links, emoji (🟩🟨🟥 work well as colour markers).
- Code blocks with a language tag (syntax-highlighted, with a copy button).
- Math with LaTeX: $inline$ and $$display$$.
- Coloured callout boxes: a blockquote whose first line is [!NOTE], [!TIP], [!IMPORTANT], [!WARNING] or [!CAUTION], e.g.
  > [!TIP]
  > Water in the morning.
- Charts: a fenced block with the language \`chart\` containing a Chart.js configuration as strict JSON (no functions, no comments):
  \`\`\`chart
  {"type":"bar","title":"Hours per week","data":{"labels":["Reading","Exercise"],"datasets":[{"label":"Hours","data":[5,3]}]}}
  \`\`\`
  Types: bar, line, pie, doughnut, radar, polarArea, scatter, bubble (and mixed bar+line). Optional top-level "title".
  Colours are filled in automatically with Plotter's palette; set backgroundColor/borderColor only when colour carries meaning (e.g. red = over budget).
  Options such as {"indexAxis":"y"} or {"scales":{"x":{"stacked":true},"y":{"stacked":true}}} are fine.
- Diagrams: a fenced block with the language \`mermaid\` (flowchart, sequenceDiagram, timeline, mindmap, gantt, pie, quadrantChart, classDiagram, stateDiagram, erDiagram, journey). Quote labels that contain spaces or punctuation, e.g. A["Plant seeds"] --> B["Water daily"]. Use classDef to colour nodes when colour helps. For flows with more than 4 steps use "flowchart TD" (top to bottom) so labels stay readable; keep node labels short.

- UI mockups and custom visuals: a fenced block with the language \`ui\` containing self-contained HTML with inline CSS (a <style> element is fine; inline SVG is fine for simple illustrations, icons and mascots). It is drawn as a live preview card about 720px wide. No JavaScript (it will not run), no external CSS or fonts; use system fonts. Use it for wireframes and page layouts, component mockups (cards, nav bars, dashboards, forms, quiz screens), colour palettes with swatches, typography scales, and side-by-side visual comparisons. Make each mockup focused and realistic, with real-looking labels in the user's language, rounded corners, light borders and generous spacing. Several \`ui\` blocks in one answer are fine when each illustrates a different section.

When the question is about visual design, a website, an app screen, UI/UX or a layout, show it rather than only describe it: start with a ui wireframe of the whole page, then ui mockups of its key sections or components, a colour palette with swatches when colours matter, and tables for structured breakdowns. Analysis requests deserve a thorough, well-organised answer with numbered sections.

Use charts for numbers and comparisons, diagrams for processes, structures and timelines, ui mockups when the topic is visual design or layout, tables for options side by side, and callouts for key warnings or tips. Keep visuals purposeful. Plotter cannot generate images (photos/paintings), but it can draw them as SVG inside a ui block.

You can search the web and open web pages. Use it when the user gives a link, asks about current or recent information, or when facts need checking; otherwise answer directly. When you use the web, cite sources with Markdown links whose text is the site's domain, e.g. ([example.com](https://example.com/page)); they are shown as small source chips. If a page cannot be opened, say so plainly and say what you used instead.`

const TITLE_INSTRUCTIONS =
  "Write a short title for this conversation in the user's language: at most 20 characters for Korean/Japanese/Chinese, or at most 6 words otherwise. Name the topic, like a chat list title (e.g. 사이트 디자인 분석, Tomato watering plan). Reply with the title only: no quotes, no trailing period, no emoji."

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const go = async (force: boolean): Promise<Response> =>
    fetch(`${API}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await accessToken(force)}` }
    })
  let res = await go(false)
  if (res.status === 401) res = await go(true)
  return res
}

let cachedModel: Model | null = null
export const forgetModel = (): void => {
  cachedModel = null
}

/** The plan's top listed model (lowest `priority`), with its reasoning levels. Like ChatGPT, one model. */
export async function primaryModel(): Promise<Model> {
  if (cachedModel) return cachedModel
  const res = await authedFetch('/models')
  if (!res.ok) throw new Error(`Could not load the model list (HTTP ${res.status}).`)
  type Raw = {
    id?: string
    slug?: string
    display_name?: string
    visibility?: string
    priority?: number
    default_reasoning_level?: string
    supported_reasoning_levels?: { effort: string; description?: string }[]
    input_modalities?: string[]
  }
  // The plan-usage endpoint answers { models: [...] }; the standard API shape is { data: [...] }.
  const body = (await res.json()) as { models?: Raw[]; data?: Raw[] }
  const listed = (body.models ?? body.data ?? [])
    .filter((m) => (m.slug ?? m.id) && (m.visibility === undefined || m.visibility === 'list'))
    .sort((a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9))
  const top = listed[0]
  if (!top) throw new Error('Your ChatGPT plan offered no models to Plotter.')
  const slug = (top.slug ?? top.id)!
  const efforts = (top.supported_reasoning_levels ?? []).map((l) => ({ effort: l.effort, description: l.description ?? '' }))
  cachedModel = {
    slug,
    displayName: top.display_name ?? slug,
    defaultEffort: top.default_reasoning_level ?? efforts[0]?.effort ?? 'medium',
    efforts,
    images: (top.input_modalities ?? ['text', 'image']).includes('image')
  }
  return cachedModel
}

/** One history item as Responses input. Attachments become input_image / input_file / input_text parts. */
function toInput(m: HistoryItem): unknown {
  if (m.role === 'assistant') return { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: m.text }] }
  const content: unknown[] = []
  for (const a of m.attachments ?? []) {
    if (a.kind === 'image') content.push({ type: 'input_image', image_url: a.data })
    else if (a.kind === 'pdf') content.push({ type: 'input_file', filename: a.name, file_data: a.data })
    else content.push({ type: 'input_text', text: `Attached file "${a.name}":\n\n${a.data}` })
  }
  if (m.text || content.length === 0) content.push({ type: 'input_text', text: m.text })
  return { type: 'message', role: 'user', content }
}

export interface StreamHandlers {
  onDelta: (text: string) => void
  /** Web search progress: what the model is doing right now, or null when it has finished looking. */
  onActivity: (label: string | null) => void
  onSource: (source: { url: string; title: string }) => void
}

type SearchAction = { type?: string; query?: string; url?: string; queries?: string[] }

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function activityLabel(action: SearchAction | undefined): string {
  if (action?.type === "open_page" && action.url) return `Reading ${hostOf(action.url)}…`
  if (action?.type === "find_in_page" && action.url) return `Looking through ${hostOf(action.url)}…`
  const q = action?.query ?? action?.queries?.[0]
  return q ? `Searching the web for “${q}”…` : "Searching the web…"
}

export class ReplyError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
  }
  get usageLimit(): boolean {
    return this.code === 'subscription_sharing_usage_limit_exceeded' || this.code === 'subscription_sharing_usage_unavailable'
  }
}

/** Streams one reply. Resolves only on response.completed; anything else throws a ReplyError. */
export async function streamReply(
  model: string,
  effort: string,
  history: HistoryItem[],
  handlers: StreamHandlers,
  signal: AbortSignal,
  opts: { instructions?: string; webSearch?: boolean } = {}
): Promise<void> {
  const input = history.map(toInput)
  const tools = opts.webSearch === false ? [] : [{ type: 'web_search' }]
  const res = await authedFetch('/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      model,
      instructions: opts.instructions ?? INSTRUCTIONS,
      input,
      tools,
      reasoning: { effort },
      // The plan's models default to "low" verbosity; ChatGPT answers at medium.
      text: { verbosity: opts.instructions ? 'low' : 'medium' },
      store: false,
      stream: true
    }),
    signal
  })
  if (!res.ok || !res.body) {
    let code = `http_${res.status}`
    let message = `The request failed (HTTP ${res.status}).`
    try {
      const j = (await res.json()) as { error?: { code?: string; message?: string } }
      if (j.error?.code) code = j.error.code
      if (j.error?.message) message = j.error.message
    } catch {
      // not JSON
    }
    throw new ReplyError(code, message)
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  let completed = false
  const handle = (data: string): void => {
    if (!data || data === '[DONE]') return
    let ev: {
      type?: string
      delta?: string
      item?: { type?: string; action?: SearchAction }
      annotation?: { type?: string; url?: string; title?: string }
      response?: { error?: { code?: string; message?: string }; incomplete_details?: { reason?: string } }
      code?: string
      message?: string
    }
    try {
      ev = JSON.parse(data)
    } catch {
      return
    }
    switch (ev.type) {
      case 'response.output_text.delta':
        if (ev.delta) handlers.onDelta(ev.delta)
        break
      case 'response.output_item.added':
        if (ev.item?.type === 'web_search_call') handlers.onActivity(activityLabel(ev.item.action))
        else if (ev.item?.type === 'message') handlers.onActivity(null)
        break
      case 'response.output_item.done':
        if (ev.item?.type === 'web_search_call') handlers.onActivity(activityLabel(ev.item.action))
        break
      case 'response.output_text.annotation.added':
        if (ev.annotation?.type === 'url_citation' && ev.annotation.url)
          handlers.onSource({ url: ev.annotation.url.replace(/[?&]utm_source=openai$/, ''), title: ev.annotation.title || hostOf(ev.annotation.url) })
        break
      case 'response.completed':
        completed = true
        break
      case 'response.failed': {
        const e = ev.response?.error
        throw new ReplyError(e?.code ?? 'failed', e?.message ?? 'The reply failed.')
      }
      case 'response.incomplete':
        throw new ReplyError('incomplete', `The reply stopped early (${ev.response?.incomplete_details?.reason ?? 'incomplete'}).`)
      case 'error':
        throw new ReplyError(ev.code ?? 'error', ev.message ?? 'The reply failed.')
    }
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value.replace(/\r\n/g, '\n')
    let i: number
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i)
      buf = buf.slice(i + 2)
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n')
      handle(data)
    }
  }
  if (!completed) throw new ReplyError('interrupted', 'The connection ended before the reply finished.')
}

/**
 * A short chat-list title for a new conversation, like ChatGPT does after the first reply.
 * Uses the plan's model at its lightest reasoning level, no web search, and only the start of the exchange.
 */
export async function generateTitle(userText: string, replyText: string): Promise<string> {
  const model = await primaryModel()
  const effort = model.efforts.find((e) => e.effort === 'minimal' || e.effort === 'low')?.effort ?? model.defaultEffort
  const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}…` : s)
  const prompt = `User's first message:\n${clip(userText, 1200)}\n\nStart of the assistant's reply:\n${clip(replyText, 800)}`
  let title = ''
  await streamReply(
    model.slug,
    effort,
    [{ role: 'user', text: prompt }],
    { onDelta: (t) => (title += t), onActivity: () => undefined, onSource: () => undefined },
    AbortSignal.timeout(30_000),
    { instructions: TITLE_INSTRUCTIONS, webSearch: false }
  )
  return title
    .split('\n')[0]!
    .replace(/^["'“”‘’「『]+|["'“”‘’」』.。]+$/g, '')
    .replace(/^#+\s*/, '')
    .trim()
    .slice(0, 60)
}
