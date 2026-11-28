import { accessToken } from './auth'
import { ROLE_TOOL_INFO, type Chat, type HistoryItem, type Model, type ProjectBrief, type RoleDraft, type ToolRun } from '../shared/api'
import { wardrobeBrief } from '@private/shared/costumes'

/**
 * Calls to the Responses API with the ChatGPT-plan access token. Preview rules
 * (developers.openai.com/siwc/token-sharing-open-source/preview-limitations): store:false, stream:true,
 * no previous_response_id (history is resent), no system-role items (use `instructions`), and none of
 * temperature/top_p/max_output_tokens/metadata/user/etc.
 */

const API = 'https://api.openai.com/v1'

/** Tells the model what Plotter's window can draw, so it answers as visually as ChatGPT does. */
export const INSTRUCTIONS = `You are Plotter, a friendly, capable assistant in a personal desktop app. Reply in the user's language.

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

- UI mockups and custom visuals: a fenced block with the language \`ui\` containing self-contained HTML with inline CSS (a <style> element is fine; inline SVG is fine for simple illustrations, icons and mascots). It is drawn as a live preview card about 720px wide. Inline <script> works, so make previews interactive when that helps: a quiz where clicking an answer marks it right or wrong and shows the explanation, tabs, toggles, a working timer, a clickable OMR answer sheet, hover states. Everything must be self-contained: no external scripts, CSS, fonts, images or network requests (they are blocked); use system fonts, inline SVG and data: URLs. Use it for wireframes and page layouts, component mockups (cards, nav bars, dashboards, forms, quiz screens), colour palettes with swatches, typography scales, and side-by-side visual comparisons. Make each mockup focused and realistic, with real-looking labels in the user's language, rounded corners, light borders and generous spacing. Several \`ui\` blocks in one answer are fine when each illustrates a different section.

When the question is about visual design, a website, an app screen, UI/UX or a layout, show it rather than only describe it: start with a ui wireframe of the whole page, then give most sections their own ui mockup (e.g. header, hero, feature cards, dashboard, key inner pages such as a quiz or exam screen, made interactive where that is how it is used), plus a colour palette with swatches and a typography scale when the visual style matters, and tables for structured breakdowns. Put each mockup right before or after the text that explains it. Each visual appears as soon as its block is written, so a rich answer with many visuals does not feel slow. Analysis requests deserve a thorough, well-organised answer with numbered sections.

Use charts for numbers and comparisons, diagrams for processes, structures and timelines, ui mockups when the topic is visual design or layout, tables for options side by side, and callouts for key warnings or tips. Keep visuals purposeful. When you need several tools that don't depend on each other's results, call them together in one turn rather than one after another. Plotter cannot generate images (photos/paintings), but it can draw them as SVG inside a ui block.`

export const WEB_INSTRUCTIONS = `You can search the web and open web pages. Use it when the user gives a link, asks about current or recent information, or when facts need checking; otherwise answer directly. When you use the web, cite sources with Markdown links whose text is the site's domain, e.g. ([example.com](https://example.com/page)); they are shown as small source chips. If a page cannot be opened, say so plainly and say what you used instead.`

const TITLE_INSTRUCTIONS =
  "Write a short title for this conversation in the user's language: at most 20 characters for Korean/Japanese/Chinese, or at most 6 words otherwise. Name the topic, like a chat list title (e.g. 사이트 디자인 분석, Tomato watering plan). Reply with the title only: no quotes, no trailing period, no emoji."

const SUGGEST_INSTRUCTIONS =
  "Guess the user's most likely next message in this conversation, written as the user would type it, in the user's language. One short line (at most 12 words; at most 30 characters for Korean/Japanese/Chinese). Make it a natural next step: a follow-up question, a request to go further, or a concrete next task. Reply with that message only: no quotes, no preamble."

const SUGGEST_FOR_CODE =
  ' The assistant is Claude Code working in a software project; suggest a concrete next instruction for it (e.g. run the tests, fix what failed, explain a file, commit).'

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
export function toInput(m: HistoryItem): unknown {
  if (m.role === 'assistant')
    return { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: m.text.replace(/\n*\[\[tool:[\w-]+\]\]\n*/g, '\n\n') }] }
  const content: unknown[] = []
  for (const a of m.attachments ?? []) {
    if (a.kind === 'image') content.push({ type: 'input_image', image_url: a.data })
    else if (a.kind === 'pdf') content.push({ type: 'input_file', filename: a.name, file_data: a.data })
    else if (a.kind === 'sheet')
      content.push({
        type: 'input_text',
        text: `Attached spreadsheet "${a.name}". For run_python each sheet is a CSV: ${(a.sheets ?? []).map((sh) => `/data/${a.name.replace(/\.[^.]+$/, '')}__${sh.name}.csv`).join(', ')}\n\n${a.data}`
      })
    else content.push({ type: 'input_text', text: `Attached file "${a.name}" (run_python: /data/${a.name}${a.kind === 'doc' ? '.txt' : ''}):\n\n${a.data}` })
  }
  if (m.text || content.length === 0) content.push({ type: 'input_text', text: m.text })
  return { type: 'message', role: 'user', content }
}

export interface StreamHandlers {
  onDelta: (text: string) => void
  /** What the model is doing right now (searching, running a tool), or null when it is writing again. */
  onActivity: (label: string | null) => void
  onSource: (source: { url: string; title: string }) => void
}

export interface ConversationHandlers extends StreamHandlers {
  /** A Plotter tool finished: show it in the reply. */
  onToolRun: (run: ToolRun) => void
}

/** A tool Plotter runs itself when the model asks (memory, Python, connectors). */
export interface LocalTool {
  name: string
  description: string
  /** JSON schema of the arguments. */
  parameters: Record<string, unknown>
  /**
   * Needs no answer back (recording, saving): when a round's only tool calls are such tools and the reply has already
   * been written in that round, they run and the reply ends there, without another round.
   */
  final?: boolean
  /** Shown while it runs, e.g. "Running Python…". */
  label: (args: Record<string, unknown>) => string
  /**
   * output goes back to the model; run (optional) is shown to the user; addTools (optional) become available for the
   * rest of this reply (a capability loaded on demand: see open_capability in assistant.ts).
   */
  run: (args: Record<string, unknown>, signal: AbortSignal) => Promise<{ output: string; run?: Omit<ToolRun, 'id'>; addTools?: LocalTool[] }>
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
  if (action?.type === 'open_page' && action.url) return `Reading ${hostOf(action.url)}…`
  if (action?.type === 'find_in_page' && action.url) return `Looking through ${hostOf(action.url)}…`
  const q = action?.query ?? action?.queries?.[0]
  return q ? `Searching the web for “${q}”…` : 'Searching the web…'
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

interface RoundRequest {
  model: string
  effort: string
  instructions: string
  input: unknown[]
  tools: unknown[]
  verbosity: 'low' | 'medium' | 'high'
  /** What the call is for, in the usage log (dev measurements). */
  tag?: string
  /** Groups calls that share a long prefix (a team member's turns), so the server can reuse its cache. */
  cacheKey?: string
}

/** Token use per call (dev: the browser-mode server keeps the last calls, to measure what features cost). */
export interface UsageEntry {
  /** A running number (the log keeps only the latest calls, so positions shift). */
  seq: number
  at: number
  tag: string
  ms: number
  input: number
  cached: number
  output: number
  reasoning: number
  instructionsChars: number
  inputItems: number
  tools: number
  /** The tools this call asked for (filled in by runConversation). */
  calls?: string[]
}
export const usageLog: UsageEntry[] = []
let usageSeq = 0
/** The running number of the next call to be logged. */
export const nextUsageSeq = (): number => usageSeq + 1

/** One streamed request. Resolves with the response's output items on response.completed; anything else throws. */
export async function streamRound(req: RoundRequest, handlers: StreamHandlers, signal: AbortSignal): Promise<{ output: unknown[] }> {
  const started = Date.now()
  const res = await authedFetch('/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      model: req.model,
      instructions: req.instructions,
      input: req.input,
      tools: req.tools,
      reasoning: { effort: req.effort },
      text: { verbosity: req.verbosity },
      // Reasoning is handed back between tool rounds (store:false keeps nothing on OpenAI's side).
      include: ['reasoning.encrypted_content'],
      // several tool calls in one round when they don't depend on each other (fewer rounds, each re-sends the whole input)
      ...(req.tools.length ? { parallel_tool_calls: true } : {}),
      ...(req.cacheKey ? { prompt_cache_key: req.cacheKey } : {}),
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
  let output: unknown[] | null = null
  // Finished items as they stream (the plan endpoint's response.completed can carry an empty output list).
  const items: unknown[] = []
  const handle = (data: string): void => {
    if (!data || data === '[DONE]') return
    let ev: {
      type?: string
      delta?: string
      item?: { type?: string; action?: SearchAction }
      annotation?: { type?: string; url?: string; title?: string }
      response?: {
        output?: unknown[]
        error?: { code?: string; message?: string }
        incomplete_details?: { reason?: string }
        usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number }; output_tokens_details?: { reasoning_tokens?: number } }
      }
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
        if (ev.item) items.push(ev.item)
        if (ev.item?.type === 'web_search_call') handlers.onActivity(activityLabel(ev.item.action))
        break
      case 'response.output_text.annotation.added':
        if (ev.annotation?.type === 'url_citation' && ev.annotation.url)
          handlers.onSource({ url: ev.annotation.url.replace(/[?&]utm_source=openai$/, ''), title: ev.annotation.title || hostOf(ev.annotation.url) })
        break
      case 'response.completed': {
        output = ev.response?.output ?? []
        const u = ev.response?.usage
        if (u) {
          usageLog.push({
            seq: ++usageSeq,
            at: Date.now(),
            tag: req.tag ?? 'other',
            ms: Date.now() - started,
            input: u.input_tokens ?? 0,
            cached: u.input_tokens_details?.cached_tokens ?? 0,
            output: u.output_tokens ?? 0,
            reasoning: u.output_tokens_details?.reasoning_tokens ?? 0,
            instructionsChars: req.instructions.length,
            inputItems: req.input.length,
            tools: req.tools.length
          })
          if (usageLog.length > 500) usageLog.splice(0, usageLog.length - 500)
        }
        break
      }
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
  if (!output) throw new ReplyError('interrupted', 'The connection ended before the reply finished.')
  return { output: (output as unknown[]).length ? output : items }
}

const MAX_TOOL_ROUNDS = 12

/**
 * One reply, including any Plotter tools the model asks for: stream → if it called tools, run them, add their
 * results to the input and stream again → … until it answers without calling a tool (or MAX_TOOL_ROUNDS).
 */
export async function runConversation(
  opts: { model: string; effort: string; instructions: string; history: HistoryItem[]; webSearch: boolean; tools: LocalTool[]; verbosity?: 'low' | 'medium' | 'high'; tag?: string; cacheKey?: string },
  handlers: ConversationHandlers,
  signal: AbortSignal
): Promise<void> {
  const input: unknown[] = opts.history.map(toInput)
  const byName = new Map(opts.tools.map((t) => [t.name, t]))
  const tools: unknown[] = [
    ...(opts.webSearch ? [{ type: 'web_search' }] : []),
    ...opts.tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters, strict: false }))
  ]
  let runSeq = 0
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { output } = await streamRound(
      { model: opts.model, effort: opts.effort, instructions: opts.instructions, input, tools, verbosity: opts.verbosity ?? 'medium', ...(opts.tag ? { tag: opts.tag } : {}), ...(opts.cacheKey ? { cacheKey: opts.cacheKey } : {}) },
      handlers,
      signal
    )
    const calls = output.filter((o): o is { type: 'function_call'; name: string; arguments: string; call_id: string } => (o as { type?: string }).type === 'function_call')
    const logged = usageLog[usageLog.length - 1]
    if (logged && calls.length) logged.calls = calls.map((c) => c.name)
    if (calls.length === 0) return
    // the answer is written and the only calls left need no answer back: run them and finish here
    const wrote = output.some((o) => (o as { type?: string }).type === 'message')
    const lastRound = wrote && calls.every((c) => byName.get(c.name)?.final)
    input.push(...output)
    for (const c of calls) {
      const tool = byName.get(c.name)
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(c.arguments || '{}') as Record<string, unknown>
      } catch {
        // leave empty; the tool reports what is missing
      }
      let result: string
      if (!tool) result = JSON.stringify({ error: `Unknown tool ${c.name}` })
      else {
        handlers.onActivity(tool.label(args))
        try {
          const r = await tool.run(args, signal)
          result = r.output
          // a capability opened mid-reply: its tools can be called from the next round on
          for (const t of r.addTools ?? []) {
            if (byName.has(t.name)) continue
            byName.set(t.name, t)
            tools.push({ type: 'function', name: t.name, description: t.description, parameters: t.parameters, strict: false })
          }
          if (r.run) handlers.onToolRun({ id: `t${Date.now().toString(36)}${runSeq++}`, ...r.run })
        } catch (err) {
          if (signal.aborted) throw err
          result = JSON.stringify({ error: err instanceof Error ? err.message : String(err) })
        }
      }
      input.push({ type: 'function_call_output', call_id: c.call_id, output: result })
    }
    handlers.onActivity(null)
    if (lastRound) return
  }
  handlers.onDelta('\n\n_(Stopped after too many tool steps.)_')
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
  await streamRound(
    { model: model.slug, effort, instructions: TITLE_INSTRUCTIONS, input: [toInput({ role: 'user', text: prompt })], tools: [], verbosity: 'low' },
    { onDelta: (t) => (title += t), onActivity: () => undefined, onSource: () => undefined },
    AbortSignal.timeout(30_000)
  )
  return title
    .split('\n')[0]!
    .replace(/^["'“”‘’「『]+|["'“”‘’」』.。]+$/g, '')
    .replace(/^#+\s*/, '')
    .trim()
    .slice(0, 60)
}

/** A greyed-out suggestion for the user's next message (Tab fills it in): one short line from a quick, low-effort request. */
export async function generateSuggestion(kind: 'chatgpt' | 'claude', userText: string, replyText: string): Promise<string> {
  const model = await primaryModel()
  const effort = model.efforts.find((e) => e.effort === 'minimal' || e.effort === 'low')?.effort ?? model.defaultEffort
  const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}…` : s)
  const prompt = `The user's last message:\n${clip(userText, 1200)}\n\nThe reply (the end of it):\n${clip(replyText.slice(-1500), 1500)}`
  let out = ''
  await streamRound(
    {
      model: model.slug,
      effort,
      instructions: SUGGEST_INSTRUCTIONS + (kind === 'claude' ? SUGGEST_FOR_CODE : ''),
      input: [toInput({ role: 'user', text: prompt })],
      tools: [],
      verbosity: 'low'
    },
    { onDelta: (t) => (out += t), onActivity: () => undefined, onSource: () => undefined },
    AbortSignal.timeout(20_000)
  )
  return out
    .split('\n')[0]!
    .replace(/^["'“”‘’「『]+|["'“”‘’」』]+$/g, '')
    .trim()
    .slice(0, 120)
}

const BRIEF_INSTRUCTIONS = `You turn a chat between a user and ChatGPT into a project brief for Claude Code, a coding agent that will build the project in a new, empty folder. It sees only your brief, not the chat.

Pick out what matters for building and leave out the rest (greetings, detours, ideas the user dropped, citations). Where the chat changed its mind, keep only the final decision. Keep concrete details exactly: names, texts on the page, colours, sizes, data, URLs, the order of sections. If the chat has visuals (code blocks tagged ui, chart or mermaid) that show what to build, copy the relevant ones in full; they are the design. Write in the language the user wrote in, but keep code and file names in English.

Reply with JSON only, no code fence:
{"title": "<the project's name, short>", "folder": "<a short kebab-case folder name, ascii only>", "brief": "<the brief in Markdown>"}

The brief has these sections:
## Goal (what to build and for whom, two or three sentences)
## What it must do (the features, as a list)
## Design (layout, colours, type, components, with the visuals copied in)
## Content (exact texts, data, assets to use)
## Tech (a suggested stack that fits; say if the chat chose one)
## First steps (what to build first, so Claude Code can start right away)
## Open questions (anything the chat left undecided; Claude Code should choose sensibly and say what it chose)`

/** "Create project": the whole chat, summarised by ChatGPT into a brief Claude Code can start building from. */
export async function generateProjectBrief(chat: Chat): Promise<ProjectBrief> {
  const model = await primaryModel()
  const effort = model.efforts.find((e) => e.effort === 'medium')?.effort ?? model.defaultEffort
  const turns = chat.messages
    .filter((m) => m.text.trim() && !m.cc)
    .map((m) => `### ${m.role === 'user' ? 'User' : 'ChatGPT'}\n${m.text.replace(/\[\[tool:[^\]]+\]\]/g, '').trim()}`)
  // keep the start (what the user asked for) and as much of the end as fits
  let transcript = turns.join('\n\n')
  const LIMIT = 120_000
  if (transcript.length > LIMIT) transcript = `${transcript.slice(0, 20_000)}\n\n[…the middle of the chat is left out…]\n\n${transcript.slice(-(LIMIT - 20_000))}`
  if (!transcript) throw new Error('This chat has nothing to make a project from yet.')
  let out = ''
  await streamRound(
    {
      model: model.slug,
      effort,
      instructions: BRIEF_INSTRUCTIONS,
      input: [toInput({ role: 'user', text: `The chat, titled "${chat.title}":\n\n${transcript}` })],
      tools: [],
      verbosity: 'medium'
    },
    { onDelta: (t) => (out += t), onActivity: () => undefined, onSource: () => undefined },
    AbortSignal.timeout(180_000)
  )
  const json = out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)
  let parsed: Partial<ProjectBrief> = {}
  try {
    parsed = JSON.parse(json) as Partial<ProjectBrief>
  } catch {
    // not JSON after all: use the text as the brief
    parsed = { brief: out.trim() }
  }
  const brief = String(parsed.brief ?? '').trim()
  if (!brief) throw new Error('ChatGPT did not write a brief. Try again.')
  const folder =
    String(parsed.folder ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'new-project'
  return { title: String(parsed.title ?? chat.title).trim() || chat.title, folder, brief }
}

const ROLE_INSTRUCTIONS = (): string => `You set up a "role": a ChatGPT assistant with one job, which the user will chat with. From its name and purpose, write what it needs as JSON only, no other text:
{"tagline": "one short line saying what it is for (under 70 characters)", "purpose": "its main instructions, second person, 2-5 sentences: who it helps, with what, and how it works", "responsibilities": ["4-7 concrete things it is responsible for, each a short line starting with a verb"], "boundaries": "what it does not do, or hands back to the user (1-2 sentences)", "style": "how it talks (1 sentence)", "engine": "chatgpt" or "claude", "tools": [ids], "toolOptions": [ids], "identity": {"color": hex, "hat": id, "eyes": id, "neck": id, "hand": id}}
engine: "claude" (Claude Code, which works in a project folder: reads and writes files, runs commands) for roles whose job is building software (programming, engineering, scripting, DevOps); "chatgpt" for everything else.
tools: the ones it needs by default. toolOptions: every tool people in this job commonly use (a superset of tools), so each project can pick its own. For a claude role, tools and toolOptions can be empty.
Keep the user's own words where they gave them. Tools, pick only those the job needs: ${Object.entries(ROLE_TOOL_INFO)
  .map(([id, t]) => `${id} (${t.hint})`)
  .join('; ')}.
Its look is Plotter's sprout-bot (an orange square robot with a sprout on its head) dressed for the job. Pick a colour and one costume piece per slot that make the role recognisable at a glance; use "none" for a slot when nothing fits, and avoid dressing it in everything. Options:
${wardrobeBrief()}`

/** ChatGPT fills in a role from its name and purpose. */
export async function draftRole(input: { name: string; purpose: string }): Promise<Partial<RoleDraft>> {
  const name = input.name.trim()
  const purpose = input.purpose.trim()
  if (!name && !purpose) throw new Error('Give the role a name or say what it is for first.')
  const model = await primaryModel()
  const effort = model.efforts.find((e) => e.effort === 'low')?.effort ?? model.defaultEffort
  let out = ''
  await streamRound(
    {
      model: model.slug,
      effort,
      instructions: ROLE_INSTRUCTIONS(),
      input: [toInput({ role: 'user', text: `Name: ${name || '(pick one)'}\nWhat it is for: ${purpose || '(work it out from the name)'}` })],
      tools: [],
      verbosity: 'medium'
    },
    { onDelta: (t) => (out += t), onActivity: () => undefined, onSource: () => undefined },
    AbortSignal.timeout(120_000)
  )
  try {
    const parsed = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)) as Partial<RoleDraft>
    return { ...parsed, name: name || String(parsed.name ?? ''), purpose: String(parsed.purpose ?? '') || purpose }
  } catch {
    throw new Error('ChatGPT did not fill in the role. Try again.')
  }
}

/** One ChatGPT call that answers with JSON (low effort, no tools). */
async function oneJson(instructions: string, text: string, tag: string): Promise<Record<string, unknown>> {
  const model = await primaryModel()
  const effort = model.efforts.find((e) => e.effort === 'low')?.effort ?? model.defaultEffort
  let out = ''
  await streamRound(
    { model: model.slug, effort, instructions, input: [toInput({ role: 'user', text })], tools: [], verbosity: 'low', tag },
    { onDelta: (t) => (out += t), onActivity: () => undefined, onSource: () => undefined },
    AbortSignal.timeout(120_000)
  )
  try {
    return JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)) as Record<string, unknown>
  } catch {
    throw new Error('ChatGPT did not answer in the expected form. Try again.')
  }
}

const roleText = (r: Pick<RoleDraft, 'name' | 'tagline' | 'purpose' | 'responsibilities' | 'boundaries' | 'style' | 'tools'>): string =>
  `Name: ${r.name}\nTagline: ${r.tagline}\nPurpose: ${r.purpose}\nResponsibilities:\n${r.responsibilities.map((x) => `- ${x}`).join('\n')}${r.boundaries ? `\nDoes not: ${r.boundaries}` : ''}${r.style ? `\nTone: ${r.style}` : ''}\nTools: ${r.tools.join(', ') || 'none'}`

/** ChatGPT judges which tools a role's job needs that it does not have (Plotter's, or ideas Plotter lacks). */
export async function suggestRoleTools(role: RoleDraft, wishedAtWork: string[]): Promise<{ tool: string; why: string }[]> {
  const j = await oneJson(
    `You review which tools a ChatGPT "role" (an assistant with one job) needs to do its job well. Plotter's tools: ${Object.entries(ROLE_TOOL_INFO)
      .map(([id, t]) => `${id} (${t.hint})`)
      .join('; ')}.
Suggest only tools it does not have and its job clearly needs, at most 4, each with one line on what it would let the role do. You may also name a tool Plotter does not have yet (short name) if the job really needs it. Fewer is better: every tool adds to what each of its messages costs. Answer with JSON only: {"tools": [{"tool": "<id or short name>", "why": "<one line>"}]}`,
    `${roleText(role)}${wishedAtWork.length ? `\nWhile working it said it lacked: ${wishedAtWork.join('; ')}` : ''}`,
    'suggest-tools'
  )
  return Array.isArray(j['tools']) ? (j['tools'] as Record<string, unknown>[]).map((x) => ({ tool: String(x['tool'] ?? ''), why: String(x['why'] ?? '') })).filter((x) => x.tool) : []
}

/**
 * Skills and tools that would be good for a role's job (one call, on request). A skill is a skilled professional's
 * know-how written down (their steps, standards, checks), so it names know-how the job needs that the role lacks;
 * a tool reaches a service or does work the role cannot. What it already has is listed so it is not suggested again.
 */
export async function suggestRoleKit(role: RoleDraft, have: { skills: string[]; tools: string[] }): Promise<{ kind: 'skill' | 'tool'; name: string; why: string; covers?: string }[]> {
  const j = await oneJson(
    `You suggest what a ChatGPT "role" (an assistant with one job) should have to do its job like a skilled professional.
Skills are a professional's know-how written down: the steps they follow, what a good result looks like, the checks they make. Suggest skills for the parts of this job where such know-how matters, each with what it should cover. Name each like "release-notes" (lowercase words with hyphens).
Tools reach a service or do what the role cannot on its own (e.g. GitHub, Stripe, a calendar). Suggest a tool only when the job clearly works with one; name the service.
At most 3 skills and 2 tools, the most useful first. Do not suggest what it already has. Answer with JSON only: {"skills": [{"name": "...", "why": "<one line>", "covers": "<what the skill should cover, one line>"}], "tools": [{"name": "...", "why": "<one line>"}]}`,
    `${roleText(role)}
It already has: skills ${have.skills.join(', ') || 'none'}; tools ${have.tools.join(', ') || 'none'}.`,
    'suggest-kit'
  )
  const list = (k: string): Record<string, unknown>[] => (Array.isArray(j[k]) ? (j[k] as Record<string, unknown>[]) : [])
  return [
    ...list('skills').slice(0, 3).map((x) => ({ kind: 'skill' as const, name: String(x['name'] ?? '').slice(0, 60), why: String(x['why'] ?? '').slice(0, 240), covers: String(x['covers'] ?? '').slice(0, 300) })),
    ...list('tools').slice(0, 2).map((x) => ({ kind: 'tool' as const, name: String(x['name'] ?? '').slice(0, 60), why: String(x['why'] ?? '').slice(0, 240) }))
  ].filter((x) => x.name)
}

/** ChatGPT drafts one role that does what two roles did: a new name, both jobs, both tool sets, and a look grown from both. */
export async function draftCombinedRole(a: RoleDraft, b: RoleDraft): Promise<Partial<RoleDraft>> {
  const j = await oneJson(
    `You combine two ChatGPT "roles" (assistants with one job each) into one role that does both jobs, the way a frontend engineer and a backend engineer become a full stack engineer. Keep what matters from both; merge overlapping responsibilities instead of listing both; keep the list short (at most 8). Tools: the ones both jobs need (usually the union, drop any the combined job does not need).
Its look is the sprout-bot evolved from both: a colour and costume pieces that carry something recognisable from each (e.g. one's hat and the other's held item).
Answer with JSON only:
{"name": "...", "tagline": "...", "purpose": "...", "responsibilities": ["..."], "boundaries": "...", "style": "...", "tools": [ids], "identity": {"color": hex, "hat": id, "eyes": id, "neck": id, "hand": id}}
Tool ids: ${Object.keys(ROLE_TOOL_INFO).join(', ')}. Look options:
${wardrobeBrief()}`,
    `Role A:\n${roleText(a)}\nA's look: ${JSON.stringify(a.identity)}\n\nRole B:\n${roleText(b)}\nB's look: ${JSON.stringify(b.identity)}`,
    'combine-roles'
  )
  return j as Partial<RoleDraft>
}

/**
 * Making a role by chatting: ChatGPT asks what it needs (at most a couple of short questions), then proposes the role,
 * and updates it when the user asks for changes. Each turn answers with what to say and, once it can, the role.
 */
export async function roleInterview(messages: { role: 'user' | 'assistant'; text: string }[]): Promise<{ reply: string; role?: Partial<RoleDraft> }> {
  const model = await primaryModel()
  const effort = model.efforts.find((e) => e.effort === 'low')?.effort ?? model.defaultEffort
  let out = ''
  await streamRound(
    {
      model: model.slug,
      effort,
      instructions: `You help the user make a "role" in Plotter (an AI assistant with one job and its own look) by chatting, so they never fill in a form.
Keep each reply to 1-3 short sentences in the user's language. If you do not yet know the job, ask one short question. Ask at most two questions in the whole chat: propose a sensible role as soon as you can and let the user adjust it. When they ask for a change, update the role and say in a line what changed.
Answer with JSON only: {"reply": "what you say to the user", "role": null, or the role as below (name included)}
${ROLE_INSTRUCTIONS().split('\n').slice(1).join('\n').replace('{"tagline"', '{"name": "short job title", "tagline"')}`,
      input: messages.slice(-12).map((m) => toInput({ role: m.role, text: m.text })),
      tools: [],
      verbosity: 'low',
      tag: 'role-interview'
    },
    { onDelta: (t) => (out += t), onActivity: () => undefined, onSource: () => undefined },
    AbortSignal.timeout(120_000)
  )
  try {
    const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)) as { reply?: unknown; role?: Partial<RoleDraft> | null }
    return { reply: String(j.reply ?? '').trim() || 'Here it is.', ...(j.role && typeof j.role === 'object' ? { role: j.role } : {}) }
  } catch {
    return { reply: out.trim() || 'Sorry, say that again?' }
  }
}

/** What the Recruiter is told about a project and about the roles there already are. */
export interface RecruitInput {
  project: string
  notes: string[]
  chats: string[]
  roles: { name: string; engine: string; tagline: string; tools: string[]; toolOptions: string[] }[]
}

/** The Recruiter's answer: a small team, each role reused or new, with this project's tools and skills. */
export async function recruitTeam(input: RecruitInput): Promise<{ summary: string; roles: Record<string, unknown>[] }> {
  const j = await oneJson(
    `You are the Recruiter (HR) of the user's company in Plotter. From a project's name, notes and chats, suggest the team of "roles" (AI assistants with one job each) it needs. Keep it small: 1 to 4 roles, only the ones the work clearly needs; every role costs time and tokens.
Reuse the user's existing roles where one fits (set "existing" to its exact name); suggest a new role only where none fits.
For each role give the tools it should use in THIS project, picked from what its job usually uses, and 2-4 specific skills or know-how it needs for this project (short phrases). A role that builds software works in Claude Code (engine "claude": it works in a project folder; tools can be empty).
Tool ids: ${Object.entries(ROLE_TOOL_INFO)
      .map(([id, t]) => `${id} (${t.hint})`)
      .join('; ')}.
Answer with JSON only:
{"summary": "one line on what the project needs", "roles": [{"existing": "<exact name of an existing role, or null>", "name": "...", "why": "one line: what it does in this project", "engine": "chatgpt" or "claude", "tools": [ids], "skills": ["..."], "new": null, or for a new role {"tagline": "...", "purpose": "2-4 sentences, second person", "responsibilities": ["..."], "toolOptions": [ids], "identity": {"color": hex, "hat": id, "eyes": id, "neck": id, "hand": id}}}]}
Look options for a new role:
${wardrobeBrief()}`,
    `Project: ${input.project}
${input.notes.length ? `Its notes:\n${input.notes.map((n) => `- ${n}`).join('\n')}` : 'No notes yet.'}
${input.chats.length ? `Its chats so far: ${input.chats.join('; ')}` : 'No chats yet.'}
The user's roles:
${input.roles.length ? input.roles.map((r) => `- ${r.name} (${r.engine === 'claude' ? 'Claude Code' : 'ChatGPT'}): ${r.tagline}. Tools: ${r.tools.join(', ') || 'none'}; usual for the job: ${r.toolOptions.join(', ') || 'none'}`).join('\n') : '(none yet)'}`,
    'recruiter'
  )
  return { summary: String(j['summary'] ?? '').trim(), roles: Array.isArray(j['roles']) ? (j['roles'] as Record<string, unknown>[]).slice(0, 5) : [] }
}
