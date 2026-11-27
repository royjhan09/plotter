import { INSTRUCTIONS, WEB_INSTRUCTIONS, runConversation, type ConversationHandlers, type LocalTool } from './openai'
import { addMemory, getChat, listMemories, readFeatures, removeMemory } from './store'
import { addNote, chatDigest, projectContext, removeNote } from './projects'
import { deliverToSide, projectsChanged } from './appEvents'
import { generateWithKey, imageKeyStatus, IMAGES } from '@private/main/images'
import { kitBrief, kitFor } from '@private/main/kits'
import { KIT_GUIDE, kitToolSpecs, runKitTool } from '@private/main/kitOps'
import { bumpRole, getRole } from '@private/main/roles'
import { ROLE_TOOL_INFO, type Kit, type RoleEntity, type RoleTool } from '../shared/api'
import { pythonTool } from './python'
import { connectorTools } from './connectors'
import { marketTools } from './marketChat'
import type { Attachment, BesideChat, SendRequest } from '../shared/api'

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

const PROJECT_INSTRUCTIONS = (context: string): string => `${context}
Use the shared memory as background, quietly. Save a note with save_project_note only for something the other chats in the project will need: a decision, a requirement, an agreed name or number, where the work stands, a problem found. One short sentence each, in the user's language. Do not save chit-chat, things already in the memory, or details only this chat needs. When a note is outdated, replace it (forget_project_note, then save the new one). The memory is small on purpose.`

function projectTools(projectId: string, chatTitle: string): LocalTool[] {
  return [
    {
      name: 'save_project_note',
      description: "Add a short note to the project's shared memory, which every chat in the project sees.",
      parameters: { type: 'object', properties: { note: { type: 'string', description: 'One short sentence.' } }, required: ['note'] },
      label: () => 'Saving to the project memory…',
      run: async (args) => {
        const note = String(args['note'] ?? '').trim()
        try {
          addNote(projectId, note, chatTitle)
          projectsChanged()
          return { output: JSON.stringify({ saved: true }), run: { kind: 'memory', title: 'Saved to the project memory', output: note } }
        } catch (e) {
          return { output: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }) }
        }
      }
    },
    {
      name: 'forget_project_note',
      description: "Remove an outdated note from the project's shared memory by its id.",
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      label: () => 'Updating the project memory…',
      run: async (args) => {
        const id = String(args['id'] ?? '')
        try {
          removeNote(projectId, id)
          projectsChanged()
          return { output: JSON.stringify({ forgotten: true }) }
        } catch (e) {
          return { output: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }) }
        }
      }
    }
  ]
}

const sideName = (b: BesideChat): string => (b.kind === 'claude' ? 'Claude Code chat' : 'ChatGPT chat')

const SIDE_INSTRUCTIONS = (b: BesideChat): string =>
  `Beside this chat, the user has a ${sideName(b)} open${b.title ? ` ("${b.title}")` : ''}.${b.kind === 'claude' ? ' Claude Code is a coding agent working in a project folder on the user’s PC: it can read and change files and run commands.' : ''} Only when the user asks you to send, hand over, pass on or ask something of that chat: first call side_chat_context to see what it already knows, then call send_to_side_chat once with a message written for it. Send only what it needs and does not have yet (no recap of what it already knows), but make the message complete on its own: the goal, the decisions and details it must follow, and what you want it to do or answer. Afterwards tell the user briefly what you sent. Never send anything the user did not ask for.`

function sideTools(b: BesideChat, chatTitle: string): LocalTool[] {
  return [
    {
      name: 'side_chat_context',
      description: `See what the ${sideName(b)} beside this one already knows: its title and its last turns.`,
      parameters: { type: 'object', properties: {} },
      label: () => `Looking at the ${sideName(b)}…`,
      run: async () => ({ output: chatDigest(b.chatId) })
    },
    {
      name: 'send_to_side_chat',
      description: `Send a message to the ${sideName(b)} beside this one. It arrives there as a message and that chat answers it right away.`,
      parameters: {
        type: 'object',
        properties: { message: { type: 'string', description: 'The message, written for that chat: only what it needs, complete on its own.' } },
        required: ['message']
      },
      label: () => `Sending to the ${sideName(b)}…`,
      run: async (args) => {
        const message = String(args['message'] ?? '').trim()
        if (!message) return { output: JSON.stringify({ error: 'message is empty' }) }
        deliverToSide({ pane: b.pane, from: { chat: chatTitle, text: message, kind: 'side', sender: 'chatgpt' } })
        return { output: JSON.stringify({ sent: true }), run: { kind: 'side', title: `Sent to the ${sideName(b)}`, output: message } }
      }
    }
  ]
}

/** An SVG the model wrote, made safe to show as a picture (an <img> never runs scripts, but keep the file clean). */
export function cleanSvg(raw: string): string {
  let svg = raw.trim().replace(/^```(?:svg|xml)?\s*/i, '').replace(/```$/, '').trim()
  const start = svg.search(/<svg[\s>]/i)
  const end = svg.toLowerCase().lastIndexOf('</svg>')
  if (start < 0 || end < 0) throw new Error('That is not an SVG (it must start with <svg and end with </svg>).')
  svg = svg.slice(start, end + 6)
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
  if (!/\sxmlns=/.test(svg.slice(0, 200))) svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  if (svg.length > 400_000) throw new Error('The SVG is too large (over 400 KB).')
  return svg
}

const IMAGE_INSTRUCTIONS = (model: boolean): string =>
  model
    ? `Pictures: when the user asks you to make an image, picture, photo, illustration, logo, icon, poster or artwork, call generate_image with a detailed prompt (subject, style, composition, colours, any exact text in quotes). It uses OpenAI's image model and each picture is billed to the user's own API key, so make one picture per request unless they ask for more, and pick quality "low" for quick drafts. Use draw_picture instead when they ask for a vector/SVG or a simple flat graphic. Keep using chart, mermaid and ui blocks for charts, diagrams and UI mockups. The picture is shown to the user automatically: do not describe it at length or paste links.`
    : `Pictures: when the user asks you to make an image, picture, illustration, logo, icon, poster or artwork, call draw_picture with a complete, polished SVG (viewBox set, no external images or fonts, text in the user's language). Aim for good design: clear shapes, a pleasing palette, balanced layout. You cannot make photos or photorealistic art; if they want that, say so briefly and mention that adding an OpenAI API key in Settings › Images lets Plotter use OpenAI's image model. Keep using chart, mermaid and ui blocks for charts, diagrams and UI mockups. The picture is shown to the user automatically.`

function imageTools(model: boolean): LocalTool[] {
  const tools: LocalTool[] = [
    {
      name: 'draw_picture',
      description: 'Show the user a picture you draw yourself as SVG (icons, logos, illustrations, banners, simple art).',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'A short name for the picture.' },
          svg: { type: 'string', description: 'The complete SVG document, from <svg to </svg>.' }
        },
        required: ['title', 'svg']
      },
      label: () => 'Drawing the picture…',
      run: async (args) => {
        const title = String(args['title'] ?? 'Picture').slice(0, 80)
        try {
          const svg = cleanSvg(String(args['svg'] ?? ''))
          return {
            output: JSON.stringify({ shown: true }),
            run: { kind: 'image', title: `Drew ${title}`, figures: [`data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`] }
          }
        } catch (e) {
          return { output: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }) }
        }
      }
    }
  ]
  if (model)
    tools.push({
      name: 'generate_image',
      description: "Make a picture with OpenAI's image model (billed to the user's API key).",
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'A detailed description of the picture.' },
          size: { type: 'string', enum: ['auto', '1024x1024', '1536x1024', '1024x1536'], description: 'Square, landscape or portrait.' },
          quality: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Leave out to use the user’s default.' },
          transparent: { type: 'boolean', description: 'A transparent background (for logos and stickers).' }
        },
        required: ['prompt']
      },
      label: () => 'Making the picture… (this takes up to a minute)',
      run: async (args, signal) => {
        const prompt = String(args['prompt'] ?? '')
        try {
          const png = await generateWithKey(
            { prompt, size: args['size'] as string | undefined, quality: args['quality'] as string | undefined, transparent: !!args['transparent'] },
            signal
          )
          return { output: JSON.stringify({ shown: true }), run: { kind: 'image', title: 'Made a picture', code: prompt, figures: [png] } }
        } catch (e) {
          const why = e instanceof Error ? e.message : String(e)
          return { output: JSON.stringify({ error: why }), run: { kind: 'image', title: 'The picture could not be made', error: why } }
        }
      }
    })
  return tools
}

/** All files attached anywhere in the chat that Python can open. */
function chatFiles(req: SendRequest): Attachment[] {
  const seen = new Map<string, Attachment>()
  for (const h of req.history) for (const a of h.attachments ?? []) if (a.raw || a.kind === 'text') seen.set(a.name, a)
  return [...seen.values()]
}

const KIT_INSTRUCTIONS = (brief: string): string => `${brief}
Whenever you design or build anything visual (ui blocks, HTML, CSS, app code, mockups, icons), follow the kit's rules without being reminded and reuse its components, changing only their CSS variables for a variation. Components come at three levels: elements (one piece), patterns (made of elements) and features (pieces that behave).
${KIT_GUIDE}
For where, name the place (e.g. "ui block: pricing page", "reply"). Do not mention the kit in replies that have nothing to do with design.`

/** The design-kit tools (private kitOps), the same ones Claude Code gets. */
function kitTools(kit: Kit, chatId: string, chatTitle: string): LocalTool[] {
  return kitToolSpecs().map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    label: () => t.label,
    run: async (args) => {
      const out = runKitTool(kit.id, t.name, args, { by: 'ChatGPT', chatId, chatTitle })
      return { output: out.output, ...(out.card ? { run: { kind: 'kit' as const, title: out.card.title, output: out.card.output } } : {}) }
    }
  }))
}

/** What the user picked in the + menu for their latest message, as instructions for this reply. */
function modeInstructions(req: SendRequest, imageModel: boolean): string {
  const m = req.modes
  if (!m) return ''
  const out: string[] = []
  if (m.image)
    out.push(
      `The user chose "Image generation" for their latest message: answer it by making a picture now with ${imageModel ? 'generate_image (or draw_picture if they ask for a vector or flat graphic)' : 'draw_picture'}, following what they describe. If they attached a picture, use it as the reference.`
    )
  if (m.search) out.push('The user chose "Web search" for their latest message: search the web before answering, and cite what you found.')
  if (m.tools?.length)
    out.push(`The user picked these tools for their latest message: ${m.tools.map((t) => t.name).join(', ')}. Use them to answer it.`)
  return out.join('\n')
}

/** A role's job, said to ChatGPT before everything else. */
const ROLE_PROMPT = (r: RoleEntity): string =>
  [
    `In this chat you are "${r.name}"${r.tagline ? `: ${r.tagline}` : ''}. This is your name and identity here: introduce yourself by it, not as Plotter or ChatGPT.`,
    r.purpose,
    r.responsibilities.length ? `You are responsible for:\n${r.responsibilities.map((x) => `- ${x}`).join('\n')}` : '',
    r.boundaries ? `You do not: ${r.boundaries}` : '',
    r.style ? `How you talk: ${r.style}` : '',
    `Your tools: ${r.tools.length ? r.tools.map((t) => ROLE_TOOL_INFO[t].label).join(', ') : 'none (answer from what you know)'}. Stay in this role in every reply. When asked for something outside it, say so in a line and help as far as the role allows, or say who or what would be better placed.`
  ]
    .filter(Boolean)
    .join('\n')

export async function reply(req: SendRequest, handlers: ConversationHandlers, signal: AbortSignal): Promise<void> {
  const f = readFeatures()
  const chat = getChat(req.chatId)
  // a role decides which tools its chats get (the user's own picks for one message still count)
  const role = getRole(chat?.roleId)
  const can = (t: RoleTool, otherwise: boolean): boolean => (role ? role.tools.includes(t) : otherwise)
  const webSearch = can('web', f.webSearch) || !!req.research || !!req.modes?.search
  const tools: LocalTool[] = []
  const parts = [INSTRUCTIONS]
  if (role) parts.push(ROLE_PROMPT(role))
  if (webSearch) parts.push(WEB_INSTRUCTIONS)
  if (can('memory', f.memory)) {
    parts.push(MEMORY_INSTRUCTIONS(listMemories()))
    tools.push(...memoryTools())
  }
  if (can('python', f.python)) {
    parts.push(PYTHON_INSTRUCTIONS)
    tools.push(pythonTool(() => chatFiles(req)))
  }
  const connected = can('connectors', true) ? await connectorTools() : { tools: [], instructions: '' }
  if (connected.tools.length) {
    parts.push(connected.instructions)
    tools.push(...connected.tools)
  }
  const market = can('market', true) || req.modes?.tools?.length ? await marketTools() : { tools: [], instructions: '' }
  if (market.tools.length || market.instructions) {
    if (market.instructions) parts.push(market.instructions)
    tools.push(...market.tools)
  }
  const title = chat?.title || 'ChatGPT chat'
  const project = chat ? projectContext(chat) : null
  if (project && can('project', true)) {
    parts.push(PROJECT_INSTRUCTIONS(project.text))
    tools.push(...projectTools(project.project.id, title))
  }
  const kit = can('kit', true) ? kitFor(project?.project.kitId) : null
  if (kit) {
    parts.push(KIT_INSTRUCTIONS(kitBrief(kit)))
    tools.push(...kitTools(kit, req.chatId, title))
  }
  if (req.beside) {
    parts.push(SIDE_INSTRUCTIONS(req.beside))
    if (req.toSide)
      parts.push(
        `The user switched on "send to the ${sideName(req.beside)}" for their latest message: it is meant for that chat, not for you. Call side_chat_context, then send_to_side_chat once with a message that carries out what the user wrote: their words plus only the context from this chat that the other chat needs and does not have. Then reply to the user in one short line saying what you sent. Do not answer the message yourself.`
      )
    tools.push(...sideTools(req.beside, title))
  }
  const imageModel = IMAGES && imageKeyStatus().set
  if (can('pictures', true) || req.modes?.image) {
    parts.push(IMAGE_INSTRUCTIONS(imageModel))
    tools.push(...imageTools(imageModel))
  }
  const picked = modeInstructions(req, imageModel)
  if (picked) parts.push(picked)
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
  if (role) bumpRole(role.id)
}
