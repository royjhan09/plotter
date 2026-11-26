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

Use charts for numbers and comparisons, diagrams for processes, structures and timelines, tables for options side by side, and callouts for key warnings or tips. Keep visuals purposeful: one good visual beats several. Plotter cannot generate images.`

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
  signal: AbortSignal
): Promise<void> {
  const input = history.map(toInput)
  const res = await authedFetch('/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ model, instructions: INSTRUCTIONS, input, reasoning: { effort }, store: false, stream: true }),
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
    let ev: { type?: string; delta?: string; response?: { error?: { code?: string; message?: string }; incomplete_details?: { reason?: string } }; code?: string; message?: string }
    try {
      ev = JSON.parse(data)
    } catch {
      return
    }
    switch (ev.type) {
      case 'response.output_text.delta':
        if (ev.delta) handlers.onDelta(ev.delta)
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
