import { INSTRUCTIONS, WEB_INSTRUCTIONS, runConversation, type ConversationHandlers, type LocalTool } from './openai'
import { addMemory, listMemories, readFeatures, removeMemory } from './store'
import { pythonTool } from './python'
import { connectorTools } from './connectors'
import { marketTools } from './market'
import type { Attachment, SendRequest } from '../shared/api'

/**
 * Builds one reply from the user's settings: which tools the model may use (web search, memory, Python,
 * connected services) and what it is told (memories, deep research, the open canvas).
 */

const MEMORY_INSTRUCTIONS = (list: { id: string; text: string }[]): string => `Memory: you can remember lasting facts about the user across chats.
${list.length ? `What you remember now (id: fact):\n${list.map((m) => `- ${m.id}: ${m.text}`).join('\n')}` : 'You do not remember anything about the user yet.'}
Use save_memory when the user asks you to remember something, or shares a lasting preference, goal or fact about themselves that would help in future chats (not one-off details, not passwords, financial or health details unless they ask). Use forget_memory when they ask you to forget. Use what you remember naturally; do not list it unless asked.`

const PYTHON_INSTRUCTIONS = `Python: run_python runs Python 3 code on the user's computer in a sandbox (Pyodide). numpy, pandas, matplotlib, scipy and the standard library are available (openpyxl is NOT); no internet. Use it for exact calculations, statistics, data analysis and charts from data. Attached files are under /data: Excel workbooks are given as one CSV per sheet at /data/<file name without .xlsx>__<sheet name>.csv (use pd.read_csv, never pd.read_excel); other text files at /data/<file name>. print() what you want to see; matplotlib figures are shown to the user automatically (do not call plt.show()). Korean text in charts works (Malgun Gothic is already the default font), so label charts in the user's language and do not change fonts. After it runs, explain the result. Prefer \`chart\` blocks for simple charts of numbers you already know; use Python when data must be computed.`

const CANVAS_INSTRUCTIONS = `Canvas: for a long document the user will keep working on (essay, report, letter, plan, story) or a program longer than ~40 lines, put the whole document in a fenced block with the language \`canvas\` (or \`canvas:python\`, \`canvas:javascript\` … for code). Its first line is the title, e.g. "# 자기소개서 초안". Plotter opens it in a side panel the user can edit. Outside the block, say briefly what you wrote. To revise an open canvas, reply with the complete updated document in a new canvas block (same title) and a short note of what changed.`

const RESEARCH_INSTRUCTIONS = `Deep research mode is on. Research thoroughly before answering: search the web many times (typically 10–25 searches and page reads) across independent, reliable sources; read primary sources where possible; cross-check facts and note disagreements. Then write a long, well-structured report in the user's language: a short summary first, then numbered sections with headings, tables and charts where they help, and a "Sources" section at the end. Cite every important claim inline with domain-labelled links.`

function canvasContext(req: SendRequest): string {
  if (!req.canvas) return ''
  const c = req.canvas
  return `The canvas is open (the user may have edited it). Current content of "${c.title}"${c.lang ? ` (${c.lang})` : ''}:\n<<<CANVAS\n${c.text.slice(0, 60000)}\nCANVAS>>>\nIf the user asks for changes to it, reply with the complete updated document in a canvas block with the same title.`
}

function memoryTools(): LocalTool[] {
  return [
    {
      name: 'save_memory',
      description: 'Remember a lasting fact or preference about the user for future chats.',
      parameters: { type: 'object', properties: { fact: { type: 'string', description: 'One short sentence, in the user\'s language.' } }, required: ['fact'] },
      label: () => 'Saving to memory…',
      run: async (args) => {
        const fact = String(args['fact'] ?? '').trim()
        if (!fact) return { output: JSON.stringify({ error: 'fact is empty' }) }
        const m = addMemory(fact)
        return { output: JSON.stringify({ saved: m.id }), run: { kind: 'memory', title: 'Saved to memory', output: fact } }
      }
    },
    {
      name: 'forget_memory',
      description: 'Forget a remembered fact by its id.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      label: () => 'Updating memory…',
      run: async (args) => {
        const id = String(args['id'] ?? '')
        const before = listMemories().find((m) => m.id === id)
        removeMemory(id)
        return {
          output: JSON.stringify({ forgotten: !!before }),
          run: before ? { kind: 'memory', title: 'Forgot from memory', output: before.text } : undefined
        }
      }
    }
  ]
}

/** All files attached anywhere in the chat that Python can open. */
function chatFiles(req: SendRequest): Attachment[] {
  const seen = new Map<string, Attachment>()
  for (const h of req.history) for (const a of h.attachments ?? []) if (a.raw || a.kind === 'text') seen.set(a.name, a)
  return [...seen.values()]
}

export async function reply(req: SendRequest, handlers: ConversationHandlers, signal: AbortSignal): Promise<void> {
  const f = readFeatures()
  const webSearch = f.webSearch || !!req.research
  const tools: LocalTool[] = []
  const parts = [INSTRUCTIONS]
  if (webSearch) parts.push(WEB_INSTRUCTIONS)
  if (f.memory) {
    parts.push(MEMORY_INSTRUCTIONS(listMemories()))
    tools.push(...memoryTools())
  }
  if (f.python) {
    parts.push(PYTHON_INSTRUCTIONS)
    tools.push(pythonTool(() => chatFiles(req)))
  }
  const connected = await connectorTools()
  if (connected.tools.length) {
    parts.push(connected.instructions)
    tools.push(...connected.tools)
  }
  const market = await marketTools()
  if (market.tools.length || market.instructions) {
    if (market.instructions) parts.push(market.instructions)
    tools.push(...market.tools)
  }
  if (f.canvas || req.canvas) parts.push(CANVAS_INSTRUCTIONS)
  if (req.canvas) parts.push(canvasContext(req))
  if (req.research) parts.push(RESEARCH_INSTRUCTIONS)
  await runConversation(
    {
      model: req.model,
      effort: req.research ? 'high' : req.effort,
      instructions: parts.join('\n\n'),
      history: req.history,
      webSearch,
      tools,
      verbosity: req.research ? 'high' : 'medium'
    },
    handlers,
    signal
  )
}
