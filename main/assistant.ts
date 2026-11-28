import { INSTRUCTIONS, WEB_INSTRUCTIONS, nextUsageSeq, runConversation, usageLog, type ConversationHandlers, type LocalTool } from './openai'
import { addMemory, getChat, listMemories, readFeatures, removeMemory } from './store'
import { addNote, chatDigest, projectContext, removeNote, roleInProject } from './projects'
import { deliverToSide, projectsChanged } from './appEvents'
import { generateWithKey, imageKeyStatus, IMAGES } from '@private/main/images'
import { kitBrief, kitFor } from '@private/main/kits'
import { KIT_GUIDE, KIT_TAGS_GUIDE, kitToolSpecs, runKitTool } from '@private/main/kitOps'
import { BROWSER_GUIDE, browserToolSpecs } from '@private/main/browserControl'
import { approveCall, browserRisk, builtinApprovals } from '@private/main/approvals'
import { skillSetup } from './skillsChat'
import { addWishes, bumpRole, getRole } from '@private/main/roles'
import { getCompany, roleTeam } from '@private/main/company'
import { labCapture, noteIdea } from '@private/main/lab'
import { memberLine } from './team'
import { ROLE_TOOL_INFO, type Kit, type RoleEntity, type RoleTool } from '../shared/api'
import { pythonTool } from './python'
import { connectorTools } from './connectors'
import { marketTools } from './marketChat'
import type { Attachment, BesideChat, Chat, SendRequest } from '../shared/api'

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

/** The memories sent with each message: the newest ones, up to a size cap (the list grows; the cap keeps every message cheap). */
const MEMORY_CAP = 2500
function recentMemories(): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = []
  let used = 0
  for (const m of [...listMemories()].reverse()) {
    if (used + m.text.length > MEMORY_CAP) break
    out.unshift(m)
    used += m.text.length + 12
  }
  return out
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
${KIT_TAGS_GUIDE}
For where, name the place (e.g. "ui block: pricing page", "reply"). Do not mention the kit in replies that have nothing to do with design.
In this chat there is no kit_record_use call: instead, when you used kit components, end your reply with a block Plotter reads and hides (it records the uses), as the very last thing, after everything else:
\`\`\`kit-uses
[{"name": "<component>", "how": "as-is | variant | adapted | other-use", "where": "<place>", "variant": "<if one>", "note": "<adapted: what changed; other-use: the situation>"}]
\`\`\``

/** The uses a reply lists in its kit-uses block (the JSON array), or none. */
export function kitUsesIn(text: string): Record<string, unknown>[] {
  const m = /```[ \t]*kit-uses[ \t]*\n([\s\S]*?)(```|$)/i.exec(text)
  if (!m) return []
  try {
    const list = JSON.parse(m[1]!.trim()) as unknown
    return Array.isArray(list) ? (list.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]) : []
  } catch {
    return []
  }
}

/** The design-kit tools (private kitOps), the same ones Claude Code gets. */
function kitTools(kit: Kit, chatId: string, chatTitle: string, afterReply: ((text: string) => { title: string; output: string } | void)[]): LocalTool[] {
  // recording and saving need no answer back: called together with the written reply, they end it (no extra round)
  const FINAL = ['kit_record_use', 'kit_save_component', 'kit_add_rule']
  // uses are recorded from the reply's kit-uses block (no call, so no round), not with kit_record_use
  return kitToolSpecs()
    .filter((t) => t.name !== 'kit_record_use')
    .map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    ...(FINAL.includes(t.name) ? { final: true } : {}),
    label: () => t.label,
    run: async (args) => {
      // ChatGPT's previews get kit CSS from kit tags, so it is given the markup only
      const out = runKitTool(kit.id, t.name, t.name === 'kit_component' && KIT_TAGS_GUIDE ? { ...args, markup_only: true } : args, { by: 'ChatGPT', chatId, chatTitle, afterReply: (job) => void afterReply.push(job) })
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

/** Where a role sits in the user's company: who it reports to and who reports to it. */
function teamLine(r: RoleEntity): string {
  const t = roleTeam(r)
  if (!t) return ''
  return [
    `You work at ${getCompany().name}.`,
    t.manager ? `You report to ${t.manager}.` : '',
    t.reports.length ? `Reporting to you: ${t.reports.join(', ')}. Keep their work in mind, and say when something is theirs to do.` : '',
    t.relations.length ? `How you work with the others: ${t.relations.join(' ')} Act on these: say when to hand something on, or what the other role would check.` : ''
  ]
    .filter(Boolean)
    .join(' ')
}

/** A member's part in a team chat: the purpose, the others, who to speak to, and what to do now. */
function TEAM_PROMPT(r: RoleEntity, chat: Chat, _req: SendRequest): string {
  const others = (chat.team?.members ?? []).filter((id) => id !== r.id).map((id) => getRole(id)).filter((x): x is RoleEntity => !!x)
  return [
    `This is a team chat at ${getCompany().name}. Its purpose: ${chat.team?.purpose ?? chat.title}`,
    others.length ? `The other members:\n${others.map(memberLine).join('\n')}` : '',
    chat.team?.mode === 'tag'
      ? 'Members answer only when a message is for them (they are tagged, or it is about their job). Tag another member with @Name only when you need something from them or what you did changes their work, and say exactly what; otherwise tag nobody. A Claude Code member works in the project folder: it changes the code and runs it, and posts what it did.'
      : '',
    `You speak only as ${r.name}, in your own message: never write another member's lines or pretend to be them.`,
    'Write it like a message in a group chat: no greeting, and do not start with your own name or "X here" (the chat already shows who is talking, and who you are speaking to).',
    chat.team?.mode === 'tag'
      ? 'Do your part for real (the actual text, design, numbers or review, not a plan to do it), and keep the talk around it short.'
      : 'Do your part of the work for real (the actual text, design, code, numbers or review, not a plan to do it). Keep the talk around it short. End by saying plainly what you hand to whom, or what you need and from whom.',
    'Post a whole code block or document only when it is new, or when you are asked for the complete final version. For a fix or a review, show just what changes (the changed lines, or a short list), not everything again.',
    "Ask others only for what their tools let them do (each member's tools are listed). A check nobody here can run (in a real browser, on a phone, with a screen reader) is for the user: say so once and do not pass it around."
  ]
    .filter(Boolean)
    .join('\n')
  // what changes every turn (who to speak to, what is needed now) goes last in the input, not here, so the
  // instructions and the earlier conversation stay the same from turn to turn and can be cached
}

/**
 * A team chat's history as one member sees it: its own replies as its own, everyone else's as messages to it,
 * older code left out (only the latest version is kept), and this turn's ask from the facilitator last.
 */
function teamHistory(history: SendRequest['history'], me: string, req: SendRequest, tagMode = false): SendRequest['history'] {
  const FENCE = /```[\s\S]*?(```|$)/g
  let latestCode = -1
  history.forEach((h, i) => {
    if (h.text.includes('```')) latestCode = i
  })
  const items = history.map((h, i) => {
    const text = i < latestCode ? h.text.replace(FENCE, '[code left out: an earlier version; the latest is further down]') : h.text
    if (h.role === 'assistant' && h.speaker === me) return { ...h, text }
    const who = h.role === 'user' ? 'The user' : (getRole(h.speaker)?.name ?? 'A member')
    return { ...h, role: 'user' as const, text: `[${who}]\n${text.replace(/\[\[tool:[^\]]+\]\]/g, '').trim()}` }
  })
  const to = req.speakTo && req.speakTo !== 'you' ? `Speak to ${req.speakTo}, by name.` : 'Speak to the user.'
  if (tagMode) {
    const by = req.speakTo && req.speakTo !== 'you' ? req.speakTo : 'the user'
    return [...items, { role: 'user', text: `[Plotter] ${by === 'the user' ? 'The message above is for you' : `${by} tagged you`}: answer ${by}.${req.teamNote ? ` What to look at: ${req.teamNote}` : ''}` }]
  }
  return [...items, { role: 'user', text: `[Facilitator] Your turn. ${to}${req.teamNote ? ` What is needed from you now: ${req.teamNote}` : ''}` }]
}

/** A role's job, said to ChatGPT before everything else. */
const ROLE_PROMPT = (r: RoleEntity): string =>
  [
    `In this chat you are "${r.name}"${r.tagline ? `: ${r.tagline}` : ''}. This is your name and identity here: introduce yourself by it, not as Plotter or ChatGPT.`,
    r.purpose,
    r.responsibilities.length ? `You are responsible for:\n${r.responsibilities.map((x) => `- ${x}`).join('\n')}` : '',
    r.boundaries ? `You do not: ${r.boundaries}` : '',
    r.style ? `How you talk: ${r.style}` : '',
    teamLine(r),
    `Your tools: ${r.tools.length ? r.tools.map((t) => ROLE_TOOL_INFO[t].label).join(', ') : 'none (answer from what you know)'}. Stay in this role in every reply. When asked for something outside it, say so in a line and help as far as the role allows, or say who or what would be better placed.`,
    wishLine(r)
  ]
    .filter(Boolean)
    .join('\n')

/** How a role says it lacked a tool: a note at the end of its reply that Plotter records (on the Roles page) and hides. */
function wishLine(r: RoleEntity): string {
  const missing = (Object.keys(ROLE_TOOL_INFO) as RoleTool[]).filter((t) => !r.tools.includes(t))
  return `If a tool you do not have would clearly have made this reply better${missing.length ? ` (you do not have: ${missing.map((t) => `${t} = ${ROLE_TOOL_INFO[t].label}`).join(', ')})` : ''}, or one Plotter does not offer at all (e.g. testing in a real browser), end your reply with a block Plotter reads and hides, as the very last thing:
\`\`\`role-wish
[{"tool": "<the id above, or a short name for a tool Plotter does not have>", "why": "<one line: what it would have let you do here>"}]
\`\`\`
Only when it truly would have helped this reply, not by habit.`
}

/** The tools a reply says it wished for, from its role-wish block. */
export function roleWishesIn(text: string): { tool: string; why: string }[] {
  const m = /```[ \t]*role-wish[ \t]*\n([\s\S]*?)(```|$)/i.exec(text)
  if (!m) return []
  try {
    const list = JSON.parse(m[1]!.trim()) as unknown
    return Array.isArray(list) ? list.filter((x) => x && typeof x === 'object').map((x) => ({ tool: String((x as Record<string, unknown>)['tool'] ?? ''), why: String((x as Record<string, unknown>)['why'] ?? '') })) : []
  } catch {
    return []
  }
}

/** How a chat notes an untested idea for the Lab: a block at the end of its reply that Plotter records and hides. */
const LAB_NOTE = `When your reply proposes, or the user suggests, a way of doing something whose real effect is uncertain until tried (that it is faster, cheaper, better for people, more reliable…), and a test would settle it, end your reply with a block Plotter reads and hides, as the very last thing:
\`\`\`lab-idea
{"title": "<a short name>", "claim": "<what is expected to happen, so a test can settle it>", "consider": ["<what might also matter>"]}
\`\`\`
Not for facts, opinions or routine answers; at most one.`

/** The untested idea a reply noted, from its lab-idea block. */
export function labIdeaIn(text: string): { title: string; claim: string; consider?: string[] } | null {
  const m = /```[ \t]*lab-idea[ \t]*\n([\s\S]*?)(```|$)/i.exec(text)
  if (!m) return null
  try {
    const j = JSON.parse(m[1]!.trim()) as Record<string, unknown>
    const consider = Array.isArray(j['consider']) ? (j['consider'] as unknown[]).map(String) : []
    return { title: String(j['title'] ?? ''), claim: String(j['claim'] ?? ''), ...(consider.length ? { consider } : {}) }
  } catch {
    return null
  }
}

/** Tools that change the user's things: in a Lab test they answer as if done and change nothing. */
const WRITES = new Set(['browser_open', 'browser_click', 'browser_type', 'browser_scroll', 'browser_back', 'save_memory', 'forget_memory', 'save_project_note', 'forget_project_note', 'kit_add_rule', 'kit_save_component', 'kit_record_use', 'send_to_side_chat', 'generate_image', 'draw_picture'])
function dryRun(t: LocalTool): LocalTool {
  if (WRITES.has(t.name)) return { ...t, run: async () => ({ output: JSON.stringify({ ok: true, note: 'Lab test: nothing was saved or sent.' }) }) }
  if (t.name === 'open_capability')
    return {
      ...t,
      run: async (args, signal) => {
        const r = await t.run(args, signal)
        return r.addTools ? { ...r, addTools: r.addTools.map(dryRun) } : r
      }
    }
  return t
}

/** A reply run by the Lab: no chat of the user's is touched, nothing is saved, its calls carry the Lab's tag. */
export interface LabReply {
  tag: string
  /** A team test's own (unsaved) team chat. */
  chat?: Chat
}

/** A capability loaded on demand: one line always, its guide and tools only once a reply opens it. */
interface Capability {
  name: string
  brief: string
  guide: string
  tools: LocalTool[]
  /** Items to hand over with the guide when opening (the design kit: the components to reuse), saving a round. */
  prefetch?: (names: string[]) => string
}

const CAPABILITIES_PROMPT = (caps: Capability[]): string =>
  `More of Plotter is available when needed. Open one with open_capability (once per reply, before you need it):
${caps.map((c) => `- ${c.name}: ${c.brief}.`).join('\n')}`

/** Opens a capability: returns its guide, and its tools become callable for the rest of the reply. */
function openCapability(caps: Capability[]): LocalTool {
  return {
    name: 'open_capability',
    description: `Load one of these for the rest of this reply: its instructions and its tools. ${caps.map((c) => c.name).join(', ')}.`,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', enum: caps.map((c) => c.name) },
        components: { type: 'array', items: { type: 'string' }, description: 'design_kit: the components you will reuse, so their code comes with it.' }
      },
      required: ['name']
    },
    label: (args) => (args['name'] === 'design_kit' ? 'Opening your design kit…' : args['name'] === 'connected_apps' ? 'Opening your connected apps…' : args['name'] === 'browser' ? 'Opening the browser…' : 'Opening your tools…'),
    run: async (args) => {
      const c = caps.find((x) => x.name === args['name'])
      if (!c) return { output: JSON.stringify({ error: `Open one of: ${caps.map((x) => x.name).join(', ')}` }) }
      const names = Array.isArray(args['components']) ? (args['components'] as unknown[]).map(String).filter(Boolean) : []
      const items = c.prefetch && names.length ? `\n\nThe components you asked for:\n${c.prefetch(names)}` : ''
      return { output: `${c.guide}${items}\n\nIts tools are now available: ${c.tools.map((t) => t.name).join(', ')}.`, addTools: c.tools }
    }
  }
}

/** One labelled piece of a reply's set-up: an instruction text or a tool (so its cost can be measured). */
export interface SetupPart {
  name: string
  text: string
}

/**
 * Everything a ChatGPT reply is set up with: the instruction parts and the tools, each labelled. reply() sends
 * them; the dev server reports their sizes (debug:setup), so what every message carries can be measured.
 */
export async function buildSetup(req: SendRequest, lab?: LabReply): Promise<{ parts: SetupPart[]; tools: (LocalTool & { pack: string })[]; webSearch: boolean; afterReply: ((text: string) => { title: string; output: string } | void)[]; role?: RoleEntity; team: string; chat?: Chat }> {
  const f = readFeatures()
  const chat = lab ? lab.chat : getChat(req.chatId)
  // a role decides which tools its chats get (the user's own picks for one message still count)
  // a generic role, as this project uses it: the tools the project picked, and what is different here
  const base = getRole(req.asRole ?? chat?.roleId)
  const dep = base ? roleInProject(chat?.projectId, base.id) : undefined
  const role = base && dep ? { ...base, tools: dep.tools, purpose: dep.notes ? `${base.purpose}\nIn this project: ${dep.notes}` : base.purpose } : base
  const can = (t: RoleTool, otherwise: boolean): boolean => (role ? role.tools.includes(t) : otherwise)
  const webSearch = can('web', f.webSearch) || !!req.research || !!req.modes?.search
  const tools: (LocalTool & { pack: string })[] = []
  const parts: SetupPart[] = []
  // things to do once the reply is finished, with its text (e.g. a kit component saved from the reply's ui block)
  const afterReply: ((text: string) => { title: string; output: string } | void)[] = []
  const add = (name: string, text: string): void => void (text && parts.push({ name, text }))
  const use = (pack: string, list: LocalTool[]): void => void tools.push(...list.map((t) => ({ ...t, pack })))
  add('base', INSTRUCTIONS)
  if (role) add('role', ROLE_PROMPT(role))
  const team = req.asRole && role && chat?.team ? TEAM_PROMPT(role, chat, req) : ''
  add('team', team)
  if (webSearch) add('web', WEB_INSTRUCTIONS)
  if (can('memory', f.memory)) {
    add('memory', MEMORY_INSTRUCTIONS(recentMemories()))
    use('memory', memoryTools())
  }
  if (can('python', f.python)) {
    add('python', PYTHON_INSTRUCTIONS)
    use('python', [pythonTool(() => chatFiles(req))])
  }
  // large or only-sometimes-needed capabilities are not sent with every message: the model sees one line about
  // each and opens it (open_capability) the first time a reply needs it
  const lazy: Capability[] = []
  const connected = can('connectors', true) ? await connectorTools() : { tools: [], instructions: '' }
  if (connected.tools.length)
    lazy.push({
      name: 'connected_apps',
      brief: `the user's connected apps (${connected.tools.map((t) => t.name).join(', ')}): open it when they ask about their own email, schedule, files or notes`,
      guide: connected.instructions,
      tools: connected.tools
    })
  const market = can('market', true) || req.modes?.tools?.length ? await marketTools() : { tools: [], instructions: '' }
  if (market.tools.length && req.modes?.tools?.length) {
    // tools the user picked for this message: there from the start
    add('market', market.instructions)
    use('market', market.tools)
  } else if (market.tools.length)
    lazy.push({
      name: 'market_tools',
      brief: `tools the user added from Plotter's market (${market.tools.map((t) => t.name).join(', ')}): open it when a request matches what one does`,
      guide: market.instructions,
      tools: market.tools
    })
  // the browser pane beside the chat: opened when a reply needs it (its tools act on the user's own browser)
  const browser = can('browser', true) ? browserToolSpecs().filter((t) => t.name !== 'browser_screenshot') : []
  if (browser.length)
    lazy.push({
      name: 'browser',
      brief: "the browser pane beside the chat (the user's own browser): open it to look at, check or do something on a web page there, or about the page the user has open in it; for plain look-ups, web search is enough",
      guide: BROWSER_GUIDE,
      tools: browser.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        label: t.label,
        run: async (args: Record<string, unknown>, signal: AbortSignal) => {
          // clicking and typing ask first when the browser's approval level says so (Market › Plugins › Browser)
          const ok = await approveCall(builtinApprovals()['browser'], browserRisk(t.name), { who: role?.name ?? 'ChatGPT', tool: 'Browser', what: t.label(args), args: JSON.stringify(args, null, 2).slice(0, 2000) }, signal)
          return { output: ok ? (await t.run(args, 'ChatGPT')).text : 'The user did not allow this.' }
        }
      }))
    })
  // skills: their names and descriptions always (as in ChatGPT); a skill's instructions only when opened
  const skills = can('skills', true) ? skillSetup() : null
  if (skills) {
    add('skills', skills.instructions)
    use('skills', skills.tools)
  }
  const title = chat?.title || 'ChatGPT chat'
  const project = chat ? projectContext(chat) : null
  if (project && can('project', true)) {
    add('project', PROJECT_INSTRUCTIONS(project.text))
    use('project', projectTools(project.project.id, title))
  }
  const kit = can('kit', true) ? kitFor(project?.project.kitId) : null
  if (kit)
    lazy.push({
      name: 'design_kit',
      brief: `the user's design kit "${kit.name}" (${kit.rules.length} design rules, and components: ${kit.components.map((c) => c.name).slice(0, 60).join(', ')}): open it before you design or build anything visual (ui blocks, HTML or CSS, app screens, mockups, icons, logos), naming in components the ones you will reuse so their code comes with it; then follow its rules and reuse its components without being reminded`,
      guide: KIT_INSTRUCTIONS(kitBrief(kit)),
      tools: kitTools(kit, req.chatId, title, afterReply),
      prefetch: (names) => runKitTool(kit.id, 'kit_component', { names, ...(KIT_TAGS_GUIDE ? { markup_only: true } : {}) }, { by: 'ChatGPT', chatId: req.chatId, chatTitle: title }).output
    })
  // the kit pieces a reply used, from its kit-uses block, recorded once the reply is finished
  if (kit)
    afterReply.push((text) => {
      const uses = kitUsesIn(text)
      if (!uses.length) return
      return runKitTool(kit.id, 'kit_record_use', { uses }, { by: 'ChatGPT', chatId: req.chatId, chatTitle: title }).card
    })
  if (lazy.length) {
    add('capabilities', CAPABILITIES_PROMPT(lazy))
    use('capabilities', [openCapability(lazy)])
  }
  if (req.beside) {
    add('side', SIDE_INSTRUCTIONS(req.beside))
    if (req.toSide)
      add(
        'side',
        `The user switched on "send to the ${sideName(req.beside)}" for their latest message: it is meant for that chat, not for you. Call side_chat_context, then send_to_side_chat once with a message that carries out what the user wrote: their words plus only the context from this chat that the other chat needs and does not have. Then reply to the user in one short line saying what you sent. Do not answer the message yourself.`
      )
    use('side', sideTools(req.beside, title))
  }
  const imageModel = IMAGES && imageKeyStatus().on
  if (can('pictures', true) || req.modes?.image) {
    add('pictures', IMAGE_INSTRUCTIONS(imageModel))
    use('pictures', imageTools(imageModel))
  }
  const picked = modeInstructions(req, imageModel)
  add('picked', picked)
  if (f.canvas || req.canvas) add('canvas', CANVAS_INSTRUCTIONS)
  if (!lab && labCapture()) add('lab', LAB_NOTE)
  if (req.canvas) add('canvas-now', canvasContext(req))
  if (req.research) add('research', RESEARCH_INSTRUCTIONS)
  // shared, unchanging parts first (they are cached across messages and chats); this chat's and this turn's last
  const ORDER = ['base', 'web', 'python', 'pictures', 'canvas', 'lab', 'capabilities', 'skills', 'research', 'role', 'memory', 'project', 'side', 'team', 'picked', 'canvas-now']
  parts.sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name))
  return { parts, tools, webSearch, afterReply, ...(role ? { role } : {}), team, ...(chat ? { chat } : {}) }
}

export async function reply(req: SendRequest, handlers: ConversationHandlers, signal: AbortSignal, lab?: LabReply): Promise<void> {
  const { parts, tools, webSearch, afterReply, role, team, chat } = await buildSetup(req, lab)
  let text = ''
  // what this reply costs, from the calls it makes (kept with the role, for the trade-off of combining roles)
  const firstCall = nextUsageSeq()
  await runConversation(
    {
      model: req.model,
      effort: req.research ? 'high' : req.effort,
      instructions: parts.map((x) => x.text).join('\n\n'),
      // in a team chat, the other members' messages are theirs, not this member's own
      history: team ? teamHistory(req.history, role!.id, req, chat?.team?.mode === 'tag') : req.history,
      ...(team ? { cacheKey: `team:${chat!.id}:${role!.id}` } : {}),
      webSearch,
      tools: lab ? tools.map(dryRun) : tools,
      verbosity: req.research ? 'high' : 'medium',
      tag: lab ? lab.tag : team ? `member:${role!.name}` : role ? `role:${role.name}` : 'chat'
    },
    { ...handlers, onDelta: (t) => ((text += t), handlers.onDelta(t)) },
    signal
  )
  if (lab) return
  const idea = labCapture() ? labIdeaIn(text) : null
  if (idea) noteIdea(idea, { by: role?.name ?? 'ChatGPT', ...(chat ? { chatId: chat.id, chatTitle: chat.title } : {}) })
  for (const job of afterReply) {
    try {
      const card = job(text)
      if (card) handlers.onToolRun({ id: `t${Date.now().toString(36)}k`, kind: 'kit', title: card.title, output: card.output })
    } catch {
      // a save after the reply must not turn a finished reply into an error
    }
  }
  if (role) {
    const wishes = roleWishesIn(text)
    if (wishes.length) addWishes(role.id, wishes, 'work')
    const calls = usageLog.filter((u) => u.seq >= firstCall)
    bumpRole(role.id, { input: calls.reduce((n, u) => n + u.input, 0), output: calls.reduce((n, u) => n + u.output, 0) })
  }
}
