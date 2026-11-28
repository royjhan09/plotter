/** What the window and the main process say to each other. */

export type Role = 'user' | 'assistant'

/** A photo or file attached to a user message, kept inline. */
export interface Attachment {
  id: string
  /** image/pdf go to the model as files; text, sheet and doc go as text (sheet/doc converted on this PC). */
  kind: 'image' | 'pdf' | 'text' | 'sheet' | 'doc'
  name: string
  mime: string
  size: number
  /** data:<mime>;base64,... for image and pdf; readable text for text, sheet and doc. */
  data: string
  /** The original file as a data URL (sheet, doc, csv…), so Python can open it. */
  raw?: string
  /** Spreadsheets: every sheet as CSV (Python reads them as /data/<file>__<sheet>.csv). */
  sheets?: { name: string; csv: string }[]
}

/** Something Plotter did with one of its own tools while answering (shown in the reply as a card). */
export interface ToolRun {
  id: string
  kind: 'python' | 'memory' | 'connector' | 'market' | 'side' | 'image' | 'kit'
  /** One line, e.g. "Ran Python", "Saved to memory", "Searched Gmail". */
  title: string
  /** Python: the code; connector: the request. */
  code?: string
  /** Text the tool produced (stdout, result, list…). */
  output?: string
  error?: string
  /** Python: PNG figures as data URLs. */
  figures?: string[]
}

export interface ChatMessage {
  id: string
  role: Role
  text: string
  attachments?: Attachment[]
  /** How long the model worked before the first words appeared. */
  thoughtMs?: number
  /** Web pages a reply cited (web search). */
  sources?: { url: string; title: string }[]
  /** Tool runs shown in the reply at [[tool:<id>]] markers. */
  toolRuns?: ToolRun[]
  /** The message was sent in deep research mode. */
  research?: boolean
  /** Set when a reply stopped early: the user stopped it, or it failed. */
  error?: string
  /** A Claude Code reply: its live steps and state (text holds its final answer). */
  cc?: ClaudeCodeTurn
  /** A ChatGPT reply handed to Claude Code with this message (shown as a card; sent along as context). */
  from?: HandOff
  /** The user meant this message for the chat beside (the "→" toggle): this chat writes it up and sends it there. */
  toSide?: boolean
  /** What the user picked in the + menu for this message (shown as chips on it). */
  modes?: MessageModes
  /** In a team chat: the role that wrote this reply, and who it was speaking to (a member's name, or "you"). */
  speaker?: string
  speakerTo?: string
  at: number
}

/** A reply (or a project brief) handed from a ChatGPT chat to Claude Code. */
export interface HandOff {
  /** The title of the chat it came from. */
  chat: string
  /** The reply's full text, or the brief (Markdown, visuals included). */
  text: string
  /** brief: a project brief made from the whole chat ("Create project"). side: sent by the chat beside it. */
  kind?: 'reply' | 'brief' | 'side'
  /** For side: which kind of chat sent it. */
  sender?: ChatKind
  /** A brief's suggested name for the project's new folder (kebab-case). */
  folder?: string
}

/** A chat summarised into a brief Claude Code can start building from. */
export interface ProjectBrief {
  title: string
  /** Suggested folder name (kebab-case). */
  folder: string
  /** The brief, in Markdown. */
  brief: string
}

export interface Chat {
  id: string
  title: string
  /** True once the model has named the chat. */
  titled?: boolean
  model: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  /** Kept at the top of the chat list. */
  pinned?: boolean
  /** Hidden from Recent; listed under Archived. */
  archived?: boolean
  /** chatgpt (default): Plotter's own chat. claude: a Claude Code session in a project folder. */
  kind?: ChatKind
  /** For a Claude Code chat: where it works, what it may do, and the session it continues. */
  cc?: ClaudeChatConfig
  /** The project it belongs to (its chats share the project's memory). */
  projectId?: string
  /** The role it talks as (a ChatGPT chat with a job, its own tools and its own look). */
  roleId?: string
  /** A team chat: several roles working on one purpose, talking to each other to get it done. */
  team?: TeamSetup
}

/** What a team chat is for, and which roles are in it. */
export interface TeamSetup {
  purpose: string
  members: string[]
  /**
   * tag: only the members a message tags answer (an untagged message goes to whoever it is for); auto: the
   * members take turns, a facilitator picking who speaks next (team chats made before tag mode work this way).
   */
  mode?: 'tag' | 'auto'
  /** Where Claude Code members work (a group with one needs a folder). */
  folder?: string
  /** What Claude Code members may do there: edit files, or only read and answer. */
  ccMode?: ClaudeCodeMode
}

/** Who answers a group message that tags nobody. */
export interface TeamRoute {
  answer: string[]
  why?: string
}

/** A member who did not take part in a round but may be needed: their part is affected, or they could add something. */
export interface TeamAlso {
  roleId: string
  why: string
  /** needed: their work is affected or a check they own is due; maybe: they could add something (shown folded). */
  level: 'needed' | 'maybe'
}

/** Who speaks next in a team chat (from the facilitator), or that the team is done for now. */
export interface TeamTurn {
  /** The member's role id, or null when the work is done or needs the user. */
  speaker: string | null
  /** Who they speak to: a member's name, or "you". */
  to?: string
  /** What they should do now, in a line. */
  note?: string
  /** When done: why it stopped (finished, or a question for the user). */
  done?: string
}

/** Settings › Images: which image model, and how good by default. */
/** A piece a reply made that the kit does not have (a <kit-new> in a ui block), offered to the user to add. */
export interface KitPieceOffer {
  name: string
  /** Self-contained HTML with its <style> (kit tags inside already filled in). */
  code: string
  useWhen?: string
  /** An alternative to this kit component (otherwise new). */
  of?: string
  /** Kit components it is built from. */
  uses?: string[]
}

export interface ImageOptions {
  model: string
  quality: 'low' | 'medium' | 'high'
}

export interface ImageKeyStatus {
  /** An OpenAI API key is saved (pictures from the image model are possible). */
  set: boolean
  /** Set up and switched on in the Market: chats can make pictures with the image model. */
  on: boolean
  /** The key's last characters, to recognise it. */
  hint?: string
  options: ImageOptions
  /** The image models to choose from (empty when this build has no image model). */
  models: string[]
}

/** A connector or Market tool picked in the + menu ("$gmail"): the reply should use it. */
export interface ToolPick {
  id: string
  name: string
  kind: 'connector' | 'market'
  icon?: string
}

/** The + menu's choices for one message. */
export interface MessageModes {
  /** Image generation: the reply makes a picture. */
  image?: boolean
  /** Web search: the reply searches the web first. */
  search?: boolean
  tools?: ToolPick[]
}

/** Where a library item lives: a chat's message, and which file or picture in it. */
export interface LibraryRef {
  chatId: string
  messageId: string
  /** attachment: a file the user sent. figure: a picture in a reply (drawn, made, or from a tool). cc: a picture in a Claude Code reply. */
  source: 'attachment' | 'figure' | 'cc'
  index: number
}

/** A file or picture from any chat, to attach again ("Import from library"). */
export interface LibraryItem {
  ref: LibraryRef
  name: string
  kind: Attachment['kind']
  /** A small preview (pictures only). */
  thumb?: string
  size?: number
  chatTitle: string
  at: number
}

/** A group of chats (ChatGPT and Claude Code) that share a small memory of what matters in the project. */
export interface Project {
  id: string
  name: string
  /** Shared memory: short notes every chat in the project sees. Kept small on purpose (see PROJECT_MEMORY_LIMIT). */
  notes: ProjectNote[]
  /** The design kit its chats build with (otherwise the default kit). */
  kitId?: string
  /** Roles working in this project, each a generic role with this project's own tool picks and notes. */
  roles?: RoleDeployment[]
  /** The Recruiter's suggested team for this project (made when the project is made, or asked again). */
  recruit?: RecruitSuggestion
  createdAt: number
  updatedAt: number
}

/** The team the Recruiter suggests for a project. */
export interface RecruitSuggestion {
  at: number
  /** Still working on it. */
  pending?: boolean
  /** One line on what the project needs. */
  summary?: string
  picks: RecruitPick[]
  error?: string
}

/** One role the Recruiter suggests: one of yours to reuse, or a new one; with this project's tools and skills. */
export interface RecruitPick {
  /** One of your roles to reuse (its id), or none: a new role to create (draft). */
  roleId?: string
  name: string
  why: string
  engine: 'chatgpt' | 'claude'
  /** The tools it should use in this project (from what its job usually uses). */
  tools: RoleTool[]
  /** Specific skills or know-how it needs for this project (become its notes in the project). */
  skills: string[]
  /** For a new role: what to create. */
  draft?: RoleDraft
  /** Added to the project. */
  added?: boolean
}

/** A generic role put to work in one project: the tools this project picked (from the role's usual ones) and how it works here. */
export interface RoleDeployment {
  roleId: string
  tools: RoleTool[]
  /** What is different in this project (tone, audience, conventions…), added to the role's instructions here. */
  notes?: string
}

/**
 * A design kit: your design theme, kept once and reused in every app you build. Rules are your design
 * principles; components are reusable pieces (a close button…), each with the situation it is for.
 */
export interface Kit {
  id: string
  name: string
  description?: string
  /** Design tokens, as CSS custom properties without the leading -- (accent: #e8590c). */
  tokens: Record<string, string>
  rules: KitRule[]
  components: KitComponent[]
  /** Sets of components added once from Plotter itself (so they are not added again after you delete them). */
  imported?: string[]
  createdAt: number
  updatedAt: number
}

export interface KitRule {
  id: string
  /** Copy, Layout, Icons, Buttons, Colour… */
  category: string
  text: string
}

export interface KitComponent {
  id: string
  name: string
  category: string
  /** The situation it is for: how one is chosen over another, and whether a new one is needed. */
  useWhen: string
  /** element: one piece (a button). pattern: made of elements (a sidebar). feature: a piece that behaves (drag to split). */
  level?: KitLevel
  /** The kit components it is built from, by name (so they are reused, not redrawn). */
  uses?: string[]
  /** Self-contained HTML (with a <style>); adjustable values are CSS variables: var(--name, default). */
  code: string
  /** What was changed and why (so the same edit is never asked for twice). */
  notes?: string
  variants?: KitVariant[]
  /** Who saved it last (you, a chat's title, Claude Code). */
  by?: string
  updatedAt: number
  /** The current version (1 when first saved); each code change makes a new one, kept in history. */
  version?: number
  /** Every saved version, oldest first (its code is read with kits.versionCode). */
  history?: KitVersion[]
  /** Same situation, different design: the name of the component this is an alternative to. */
  alternativeOf?: string
}

/** One saved version of a component's code. */
export interface KitVersion {
  version: number
  at: number
  by: string
  /** What changed and why. */
  note?: string
}

/**
 * How a component was used:
 * as-is: the code as it is; variant: one of its variants (or new CSS values); adapted: changed a little for this place;
 * other-use: used for a situation its "use when" does not describe.
 */
export type KitUseHow = 'as-is' | 'variant' | 'adapted' | 'other-use'

/** One use of a kit component, by a chat, somewhere. */
export interface KitUse {
  id: string
  componentId: string
  /** Its name when used. */
  component: string
  version: number
  at: number
  /** ChatGPT or Claude Code. */
  by: string
  chatId?: string
  chatTitle?: string
  /** Where it went: a file in the project, a page, "a reply". */
  where?: string
  /** The project folder (Claude Code). */
  folder?: string
  how: KitUseHow
  variant?: string
  /** What was changed, or (other-use) the situation it was used for. */
  note?: string
}

export type KitLevel = 'element' | 'pattern' | 'feature'

/** Named values for a component's variables (a red close button, a small one…). */
export interface KitVariant {
  name: string
  vars: Record<string, string>
  /** A variant whose code differs a little (not only its CSS values). */
  code?: string
  /** What is different and when to pick it. */
  note?: string
  by?: string
  at?: number
}

/** The tools a role may use (each one switched on for its chats, the rest off). */
export type RoleTool = 'web' | 'python' | 'memory' | 'pictures' | 'kit' | 'connectors' | 'market' | 'project' | 'browser'

/** What each role tool gives its chats. */
export const ROLE_TOOL_INFO: Record<RoleTool, { label: string; hint: string }> = {
  web: { label: 'Web search', hint: 'Looks things up on the web and cites them.' },
  python: { label: 'Python', hint: 'Runs code: maths, data, charts and the files you attach.' },
  memory: { label: 'Memory', hint: 'Remembers lasting facts about you across chats.' },
  pictures: { label: 'Pictures', hint: 'Draws pictures, and makes images with your key if you set one.' },
  kit: { label: 'Design kit', hint: 'Uses and updates your design kit for anything visual.' },
  connectors: { label: 'Connected apps', hint: 'Uses the apps you connected (mail, calendar, files…).' },
  market: { label: 'Market tools', hint: 'Uses the tools you added from the Market.' },
  project: { label: 'Project memory', hint: "Reads and adds to its project's shared memory." },
  browser: { label: 'Browser', hint: 'Opens, reads and uses web pages in the browser pane beside the chat.' }
}

/** A role's look: the sprout-bot in a colour and a costume. */
export interface RoleIdentity {
  /** Body colour (hex). */
  color: string
  hat: string
  eyes: string
  neck: string
  hand: string
}

/** A ChatGPT chat with a job: who it is, what it is responsible for, and which tools it gets. */
export interface RoleEntity {
  id: string
  name: string
  /** One line: what it is for, shown under its name. */
  tagline: string
  /** What it does and for whom (its main instructions). */
  purpose: string
  responsibilities: string[]
  /** What it should not do, or hand back to you. */
  boundaries?: string
  /** How it talks. */
  style?: string
  tools: RoleTool[]
  /** The tools commonly used for this job: a project using the role picks from these (tools are the defaults). */
  toolOptions?: RoleTool[]
  /** Which AI it works in: ChatGPT (default), or Claude Code for roles that build in a project folder (programming…). */
  engine?: 'chatgpt' | 'claude'
  identity: RoleIdentity
  /** Replies it has written (it grows with them). */
  replies: number
  /** Tools it said would have helped while working (or a suggestion asked for), newest first. */
  wishes?: RoleWish[]
  /** What its replies cost, measured: tokens in and out over all replies (for the trade-off of combining). */
  stats?: { replies: number; input: number; output: number }
  /** The roles it was combined from (by name). */
  mergedFrom?: string[]
  /** Retired (combined into another role): hidden from the lists, its old chats keep its look. */
  retired?: boolean
  /** One of Plotter's own roles (the Recruiter), made for you. */
  builtin?: 'recruiter'
  createdAt: number
  updatedAt: number
}

/** A tool a role wished it had: one of Plotter's (it can be given) or an idea Plotter does not have yet. */
export interface RoleWish {
  tool: RoleTool | string
  why: string
  /** How often it came up. */
  count: number
  at: number
  /** From its work in a chat, or from a "suggest tools" review. */
  from: 'work' | 'review'
}

/** What combining two roles would change: measured or estimated per-message and per-task cost, and what is lost. */
export interface RoleMergeTradeoff {
  /** Set-up sent with each of its messages, in tokens: the two now, and the combined role. */
  setupTokens: { a: number; b: number; merged: number }
  /** Cost of one reply in tokens (input + output): measured from their replies where there are any. */
  replyTokens: { a: number; b: number; measured: boolean }
  /** What a hand-off between them costs in a team chat (the facilitator's call and the turn handing it back), saved by combining. */
  handoffTokens: number
  /** Extra tokens per task for the combined role: one role's heavy tools (extra rounds) now carry the other's work too. */
  heavyPenalty: number
  /** One typical task, in tokens, with the hand-offs they usually make: as two roles, and as one. */
  perTask: { handoffs: number; separate: number; combined: number }
  /** Hand-offs per task from which one role costs less than two (null: always, or it never does). */
  breakEven: number | null
  /** Why to combine them, or keep them apart (by the rules on the Roles page). */
  advice: CombineAdvice
  responsibilities: number
  tools: number
  /** Plain warnings: an independent review lost, too broad, many tools… */
  warnings: string[]
}
/** Your company: its name and who reports to whom (the roles' org chart, with you at the top). */
export interface Company {
  name: string
  /** A role's id → the id of the role it reports to, or "you". Roles not in here are not on the chart yet. */
  reportsTo: Record<string, string>
  /** What the line from a role's manager to it means ("manages" when not set): role id → label. */
  lineLabels?: Record<string, string>
  /** Working relations between roles, beside who reports to whom. */
  links?: RoleLink[]
  /** Hand-offs counted in team chats, per pair of roles ("a|b", ids sorted): how often and in how many tasks. */
  pairs?: Record<string, { handoffs: number; rounds: number; lastRound?: string }>
  /** What matters more when roles could be combined: tokens (cost) or turns (speed). */
  prefer?: 'cost' | 'speed'
  /** Combine suggestions you said "not now" to ("a|b"). */
  dismissedCombos?: string[]
  updatedAt: number
}

/** Why two roles should, or should not, become one. */
export interface CombineAdvice {
  combine: string[]
  separate: string[]
}

/** A pair of roles Plotter suggests combining, and why. */
export interface CombineSuggestion {
  a: string
  b: string
  reasons: string[]
}

/** A kind of working relation between two roles (or custom, with its own label). */
export type RoleLinkKind = 'hands-off' | 'reviews' | 'advises' | 'works-with' | 'depends' | 'custom'

/** How each kind of relation is said and drawn. works-with goes both ways; the rest point from → to. */
export const ROLE_LINK_KINDS: Record<RoleLinkKind, { label: string; color: string; both?: boolean }> = {
  'hands-off': { label: 'hands work to', color: '#e8590c' },
  reviews: { label: 'reviews the work of', color: '#0c8599' },
  advises: { label: 'advises', color: '#7048e8' },
  'works-with': { label: 'works with', color: '#2f9e44', both: true },
  depends: { label: 'depends on', color: '#495057' },
  custom: { label: '', color: '#d6336c' }
}

/** A working relation: from one role to another, of a kind, with its own words if wanted. */
export interface RoleLink {
  id: string
  from: string
  to: string
  kind: RoleLinkKind
  /** Shown on the diagram instead of the kind's words (e.g. "hands designs to"). */
  label?: string
}

export type RoleDraft = Omit<RoleEntity, 'id' | 'replies' | 'createdAt' | 'updatedAt'>

export interface KitSummary {
  id: string
  name: string
  description?: string
  rules: number
  components: number
  isDefault: boolean
}

export type KitPatch = { name?: string; description?: string; tokens?: Record<string, string> }

export interface ProjectNote {
  id: string
  text: string
  /** Which chat (or "you") added it. */
  by: string
  at: number
}

/** The shared memory's size cap: notes and characters, so it stays cheap to send with every message. */
export const PROJECT_MEMORY_LIMIT = { notes: 40, chars: 5000, noteChars: 400 }

/** The chat open on the other side, so a chat can send something to it. */
export interface BesideChat {
  pane: 'left' | 'right'
  chatId: string | null
  kind: ChatKind
  title: string
}

/** Something one chat sent to the chat beside it. */
export interface SideDelivery {
  pane: 'left' | 'right'
  from: HandOff
}

export type ChatKind = 'chatgpt' | 'claude'

export interface ClaudeChatConfig {
  folder: string
  mode: ClaudeCodeMode
  /** Claude Code's effort level (--effort): low, medium, high, xhigh or max. */
  effort?: string
  /** Claude Code's session id, so each new message continues the same session (--resume). */
  sessionId?: string
  /** When the shared project memory was last sent to this session (it is sent again only after it changes). */
  projectSeenAt?: number
  /** When the design kit was last sent to this session (sent again only after it changes). */
  kitSeenAt?: number
}

/** "Send to Claude Code": edit = may change files; plan = reads and answers only. */
export type ClaudeCodeMode = 'edit' | 'plan'

export interface ClaudeCodeStep {
  at: number
  /** text = what Claude Code said; tool = what it did ("Edit src/App.tsx"); image = a picture a tool returned (text is a data URL). */
  kind: 'text' | 'tool' | 'image'
  text: string
}

/** A Claude Code reply while it works and after. */
export interface ClaudeCodeTurn {
  state: 'running' | 'done' | 'failed' | 'stopped'
  steps: ClaudeCodeStep[]
  startedAt: number
  endedAt?: number
  turns?: number
}

/** A Claude Code reply changed (sent while it works, and once at the end). */
export interface ClaudeCodeUpdate {
  chatId: string
  message: ChatMessage
  sessionId?: string
}

/** ---------------------------------------------------------------- Market: tools you register and connect */

/** One input a Web API tool takes (sent as a query parameter for GET, a JSON field for POST). */
export interface ApiParam {
  name: string
  type: 'string' | 'number' | 'boolean'
  description: string
  required: boolean
}

/**
 * A tool in the market. Web API: Plotter calls your URL with the inputs the model fills in.
 * MCP server: any Model Context Protocol server (remote URL, or a command run on this PC); its own
 * tools are offered to the chat. Connected tools are used by ChatGPT chats and Claude Code chats.
 */
export interface MarketTool {
  id: string
  name: string
  /** What it does, for you and for the model (it decides when to use the tool from this). */
  description: string
  /** One emoji or character shown on its card. */
  icon?: string
  kind: 'api' | 'mcp'
  connected: boolean
  api?: { url: string; method: 'GET' | 'POST'; params: ApiParam[]; authHeader?: string }
  mcp?: { transport: 'http' | 'stdio'; url?: string; command?: string; args?: string[] }
  /** A secret (API key or token) is stored, encrypted on this PC; it is never sent back to the window. */
  hasSecret: boolean
  createdAt: number
}

/** Registering or editing a tool. secret: undefined keeps the stored one, '' removes it. */
export interface MarketToolInput {
  id?: string
  name: string
  description: string
  icon?: string
  kind: 'api' | 'mcp'
  api?: MarketTool['api']
  mcp?: MarketTool['mcp']
  secret?: string
}

/** What checking a tool found: the MCP server's tool names, or why it failed. */
export interface MarketCheck {
  ok: boolean
  tools?: { name: string; description?: string }[]
  error?: string
}

/** What the chat list's ⋯ menu can change. */
export interface ChatMetaPatch {
  title?: string
  pinned?: boolean
  archived?: boolean
  /** Move into a project; null takes it out. */
  projectId?: string | null
}

export interface ChatSummary {
  id: string
  title: string
  updatedAt: number
  pinned?: boolean
  archived?: boolean
  kind?: ChatKind
  projectId?: string
  roleId?: string
  /** A team chat's members (role ids). */
  teamMembers?: string[]
}

export interface Account {
  email?: string
  name?: string
  picture?: string
}

export type AuthState =
  | { signedIn: false }
  | { signedIn: true; account: Account; planUsage: boolean; welcomeSeen: boolean }

export interface EffortLevel {
  effort: string
  description: string
}

/** The one model Plotter uses: the plan's first listed model. */
export interface Model {
  slug: string
  displayName: string
  defaultEffort: string
  efforts: EffortLevel[]
  images: boolean
}

/** Streamed reply events, keyed by the request id the window chose. */
export type ReplyEvent =
  | { requestId: string; type: 'delta'; text: string }
  | { requestId: string; type: 'activity'; label: string | null }
  | { requestId: string; type: 'source'; url: string; title: string }
  | { requestId: string; type: 'tool'; run: ToolRun }
  | { requestId: string; type: 'done' }
  | { requestId: string; type: 'error'; code: string; message: string; usageLimit: boolean }

export interface HistoryItem {
  role: Role
  text: string
  attachments?: Attachment[]
  /** In a team chat: which role wrote this reply (its id). */
  speaker?: string
}

export interface CanvasDoc {
  title: string
  text: string
  /** Empty for a document; a language name (python, js …) for code. */
  lang: string
}

export interface SendRequest {
  requestId: string
  chatId: string
  model: string
  effort: string
  /** The whole conversation so far, the new user message last (no previous_response_id in the preview). */
  history: HistoryItem[]
  /** Deep research: many searches, a long cited report. */
  research?: boolean
  /** The canvas as it is now (the user may have edited it), when it is open. */
  canvas?: CanvasDoc | null
  /** The chat open beside this one, when the user typed this message (so the reply may send something to it). */
  beside?: BesideChat
  /** The user meant this message for the chat beside: the reply must send it there. */
  toSide?: boolean
  /** Picked in the + menu for this message: make a picture, search the web, use these tools. */
  modes?: MessageModes
  /** In a team chat: the member who writes this reply, who it speaks to, and what the facilitator asked of it. */
  asRole?: string
  speakTo?: string
  teamNote?: string
}

/** Settings → Features. */
export interface Features {
  webSearch: boolean
  memory: boolean
  python: boolean
  canvas: boolean
}

export const DEFAULT_FEATURES: Features = { webSearch: true, memory: true, python: true, canvas: true }

export interface Memory {
  id: string
  text: string
  at: number
}

export type ConnectorId = 'google' | 'notion'

export interface ConnectorStatus {
  id: ConnectorId
  name: string
  /** What it lets Plotter read. */
  covers: string
  /** Credentials entered (Google: OAuth client; Notion: integration secret). */
  configured: boolean
  connected: boolean
  /** The user lets Plotter use it in chats. */
  enabled: boolean
  account?: string
}

/** Local Python (Pyodide) progress. */
export type PythonStatus = { state: 'idle' } | { state: 'loading'; detail: string } | { state: 'ready' } | { state: 'error'; message: string }

/** Local speech-to-text progress: the model downloads once, then loads. */
export type SpeechStatus =
  | { state: 'idle' }
  | { state: 'downloading'; percent: number }
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; message: string }

/**
 * The Lab: ideas (the user's, or a chat's) whose real effect is not known until tried. Testing everything at once
 * costs time and tokens, so they are listed with what a test would cost, and the user picks which to run.
 */
export type LabArmSetup = { type: 'plain' } | { type: 'role'; roleId: string } | { type: 'team'; roleIds: string[] }

/** One way of doing the task in a comparison. */
export interface LabArm {
  label: string
  setup: LabArmSetup
}

/** check: ChatGPT tests the claim (Python, the web) and says what it missed. compare: the same task done each way, measured, then judged. */
export type LabTest = { kind: 'check' } | { kind: 'compare'; task: string; arms: LabArm[] }

export interface LabArmResult {
  label: string
  type: LabArmSetup['type']
  input: number
  cached: number
  output: number
  calls: number
  ms: number
  /** What it produced (clipped). */
  answer: string
  /** The judge's mark for how well it did the task (1 to 5), and why. */
  score?: number
  note?: string
}

export type LabVerdict = 'holds' | 'partly' | 'fails' | 'unclear'

export interface LabResult {
  at: number
  verdict: LabVerdict
  summary: string
  /** What the idea did not take into account. */
  considerations: string[]
  arms?: LabArmResult[]
  winner?: string
  /** What the test itself cost. */
  cost: { input: number; cached: number; output: number; calls: number; ms: number }
  /** What it was expected to cost (tokens). */
  estimate: number
  /** The tester's own write-up (a check). */
  report?: string
}

export interface LabIdea {
  id: string
  at: number
  title: string
  /** What is expected to happen, in a way a test can settle. */
  claim: string
  /** What might also matter (from whoever proposed it). */
  consider?: string[]
  from: { by: string; chatId?: string; chatTitle?: string }
  /** How many times it came up. */
  seen: number
  status: 'new' | 'running' | 'done' | 'failed' | 'dismissed'
  test?: LabTest
  /** While running: what it is doing. */
  progress?: string
  result?: LabResult
  error?: string
}

export interface LabState {
  ideas: LabIdea[]
  capture: boolean
}

export interface LabEstimate {
  tokens: number
  seconds: number
  /** Measured: from past Lab runs; typical: before there are any. */
  basis: 'measured' | 'typical'
}

/** Ideas waiting in the Lab, at most (the oldest untested ones go first). */
export const LAB_CAP = 60

export interface PlotterApi {
  auth: {
    state: () => Promise<AuthState>
    signIn: () => Promise<AuthState>
    cancelSignIn: () => Promise<void>
    signOut: () => Promise<AuthState>
    markWelcomeSeen: () => Promise<void>
  }
  model: () => Promise<Model>
  projects: {
    list: () => Promise<Project[]>
    create: (name: string) => Promise<Project>
    rename: (id: string, name: string) => Promise<Project[]>
    /** Deletes the project; its chats stay, outside any project. */
    remove: (id: string) => Promise<Project[]>
    addNote: (id: string, text: string) => Promise<Project>
    /** The design kit the project's chats build with (null: the default kit). */
    setKit: (id: string, kitId: string | null) => Promise<Project>
    editNote: (id: string, noteId: string, text: string) => Promise<Project>
    removeNote: (id: string, noteId: string) => Promise<Project>
    /** The Recruiter suggests the team this project needs (again). */
    recruit: (id: string) => Promise<Project>
    /** Adds one of the Recruiter's picks to the project (creating the role first if it is new). */
    hire: (id: string, pick: number) => Promise<Project>
    /** Puts a role to work in the project with its own tool picks and notes (or updates them). */
    setRole: (id: string, deployment: RoleDeployment) => Promise<Project>
    removeRole: (id: string, roleId: string) => Promise<Project>
    /** A project changed (a chat saved a note, a chat moved in or out). */
    onChanged: (listener: () => void) => () => void
  }
  images: {
    status: () => Promise<ImageKeyStatus>
    /** Checks the key with OpenAI, then saves it encrypted. */
    setKey: (key: string) => Promise<ImageKeyStatus>
    clearKey: () => Promise<ImageKeyStatus>
    setOptions: (patch: Partial<ImageOptions>) => Promise<ImageKeyStatus>
    /** Switches the image model on or off for chats (the key stays saved). */
    setOn: (on: boolean) => Promise<ImageKeyStatus>
  }
  library: {
    /** Files and pictures from every chat, newest first. */
    list: () => Promise<LibraryItem[]>
    /** One of them, ready to attach. */
    get: (ref: LibraryRef) => Promise<Attachment>
  }
  team: {
    /** Who speaks next in a team chat (ChatGPT as facilitator), given the conversation so far. */
    next: (chatId: string, history: HistoryItem[], turnsLeft: number) => Promise<TeamTurn>
    /** ChatGPT picks the roles a purpose needs (role ids). */
    suggest: (purpose: string) => Promise<string[]>
    /** Tag mode: who should answer a message that tags nobody. */
    route: (chatId: string, history: HistoryItem[]) => Promise<TeamRoute>
    /** Tag mode, after a round: members who did not take part but may be needed. */
    also: (chatId: string, history: HistoryItem[], spoke: string[]) => Promise<TeamAlso[]>
  }
  lab: {
    get: () => Promise<LabState>
    /** An idea of yours, to test later. */
    add: (idea: { title: string; claim: string }) => Promise<LabState>
    update: (id: string, change: Partial<Pick<LabIdea, 'title' | 'claim' | 'test' | 'status'>>) => Promise<LabState>
    remove: (id: string) => Promise<LabState>
    /** Whether chats note untested ideas for the Lab (a short line in their set-up). */
    setCapture: (on: boolean) => Promise<LabState>
    /** What a test would cost, from past Lab runs (or typical figures before there are any). */
    estimate: (test: LabTest) => Promise<LabEstimate>
    /** Starts the test; progress and the result arrive through onChanged. */
    run: (id: string, test: LabTest) => Promise<void>
    stop: (id: string) => Promise<void>
    onChanged: (listener: () => void) => () => void
  }
  company: {
    get: () => Promise<Company>
    rename: (name: string) => Promise<Company>
    /** Puts a role on the chart under someone ("you" or a role's id), or takes it off (null). */
    place: (roleId: string, reportsTo: string | null) => Promise<Company>
    /** What the line from a role's manager to it says (empty: "manages"). */
    labelLine: (roleId: string, label: string) => Promise<Company>
    /** Whether combining roles should favour fewer tokens or fewer turns. */
    setPrefer: (prefer: 'cost' | 'speed') => Promise<Company>
    link: (link: Omit<RoleLink, 'id'>) => Promise<Company>
    unlink: (linkId: string) => Promise<Company>
    onChanged: (listener: () => void) => () => void
  }
  roles: {
    list: () => Promise<RoleEntity[]>
    /** Adds a role, or updates the one with this id. */
    save: (role: RoleDraft & { id?: string }) => Promise<RoleEntity>
    remove: (id: string) => Promise<RoleEntity[]>
    /** ChatGPT fills in a role from its name and purpose: responsibilities, tools, tone and its costume. */
    draft: (input: { name: string; purpose: string }) => Promise<RoleDraft>
    /** Making a role by chatting: the conversation so far in, the next reply and (once it knows enough) the role out. */
    interview: (messages: { role: 'user' | 'assistant'; text: string }[]) => Promise<{ reply: string; draft?: RoleDraft }>
    /** ChatGPT reviews which tools a role's job needs; the result lands in its wishes. */
    suggestTools: (id: string) => Promise<RoleEntity>
    /** Gives a role a tool it wished for (or dismisses the wish). */
    grantWish: (id: string, tool: string, give: boolean) => Promise<RoleEntity>
    /** ChatGPT drafts one role combining two, and what that would change. */
    combineDraft: (a: string, b: string) => Promise<{ draft: RoleDraft; tradeoff: RoleMergeTradeoff }>
    /** Saves the combined role; the two are retired (kept, hidden) and it takes their place on the chart. */
    combine: (a: string, b: string, draft: RoleDraft) => Promise<RoleEntity>
    /** Brings a retired role back. */
    restore: (id: string) => Promise<RoleEntity>
    /** Pairs of roles worth combining now (hand work back and forth, same tools, speed preferred), with the reasons. */
    combineSuggestions: () => Promise<CombineSuggestion[]>
    /** "Not now" to a combine suggestion. */
    dismissCombo: (a: string, b: string) => Promise<void>
    onChanged: (listener: () => void) => () => void
  }
  kits: {
    list: () => Promise<KitSummary[]>
    get: (id: string) => Promise<Kit>
    /** A new kit, empty or copied from another. */
    create: (name: string, copyFrom?: string) => Promise<Kit>
    update: (id: string, patch: KitPatch) => Promise<Kit>
    remove: (id: string) => Promise<KitSummary[]>
    setDefault: (id: string) => Promise<KitSummary[]>
    saveRule: (id: string, rule: Partial<KitRule> & { text: string }) => Promise<Kit>
    removeRule: (id: string, ruleId: string) => Promise<Kit>
    saveComponent: (id: string, component: Partial<KitComponent> & { name: string; code: string }) => Promise<Kit>
    removeComponent: (id: string, componentId: string) => Promise<Kit>
    /** Opens the kit's folder (its files, which Claude Code reads and saves to). */
    openFolder: (id: string) => Promise<void>
    /** Every recorded use of the kit's components (newest first). */
    usage: (id: string) => Promise<KitUse[]>
    /** The code of one saved version of a component. */
    versionCode: (id: string, componentId: string, version: number) => Promise<string>
    /** Makes an old version the current one (as a new version). */
    restoreVersion: (id: string, componentId: string, version: number) => Promise<Kit>
    /** Adds a situation to a component's "use when" (from an other-use). */
    addUseWhen: (id: string, componentId: string, situation: string) => Promise<Kit>
    /** Something saved to a kit (a chat or Claude Code): the kit's id. */
    onChanged: (listener: (kitId: string) => void) => () => void
    /** Adds a piece a reply made to the kit of the chat's project (or the default kit). Returns the kit's name. */
    addFromReply: (projectId: string | null, piece: KitPieceOffer, chatTitle?: string) => Promise<string>
  }
  /** A chat sent something to the chat beside it. */
  onSideDelivery: (listener: (d: SideDelivery) => void) => () => void
  chats: {
    list: () => Promise<ChatSummary[]>
    get: (id: string) => Promise<Chat | null>
    save: (chat: Chat) => Promise<void>
    remove: (id: string) => Promise<void>
    /** Rename, pin or archive a chat (its place in Recent is kept). */
    update: (id: string, patch: ChatMetaPatch) => Promise<ChatSummary[]>
    /** A short title for a new chat, written by the model from the first exchange. */
    title: (userText: string, replyText: string) => Promise<string>
    /** A one-line guess at the user's next message, shown greyed out in an empty message box (Tab fills it in). */
    suggest: (kind: ChatKind, userText: string, replyText: string) => Promise<string>
    /** "Create project": the whole chat summarised by ChatGPT into a brief for Claude Code. */
    brief: (chatId: string) => Promise<ProjectBrief>
  }
  reply: {
    send: (request: SendRequest) => Promise<void>
    stop: (requestId: string) => Promise<void>
    onEvent: (listener: (event: ReplyEvent) => void) => () => void
  }
  features: {
    get: () => Promise<Features>
    set: (patch: Partial<Features>) => Promise<Features>
  }
  memory: {
    list: () => Promise<Memory[]>
    remove: (id: string) => Promise<Memory[]>
    clear: () => Promise<Memory[]>
  }
  connectors: {
    list: () => Promise<ConnectorStatus[]>
    /** Google: save the OAuth client the user created in Google Cloud. */
    setGoogleClient: (clientId: string, clientSecret: string) => Promise<ConnectorStatus[]>
    /** Notion: save the internal integration secret. */
    setNotionToken: (token: string) => Promise<ConnectorStatus[]>
    /** Google: open the browser to sign in and allow read-only access. */
    connect: (id: ConnectorId) => Promise<ConnectorStatus[]>
    disconnect: (id: ConnectorId) => Promise<ConnectorStatus[]>
    setEnabled: (id: ConnectorId, enabled: boolean) => Promise<ConnectorStatus[]>
  }
  market: {
    list: () => Promise<MarketTool[]>
    save: (tool: MarketToolInput) => Promise<MarketTool[]>
    remove: (id: string) => Promise<MarketTool[]>
    setConnected: (id: string, connected: boolean) => Promise<MarketTool[]>
    /** Connects to an MCP server and lists its tools (a Web API tool is not called: it may have effects). */
    check: (id: string) => Promise<MarketCheck>
  }
  /** Claude Code chats: each message is sent to the user's own installed Claude Code (`claude -p`) in the chat's folder. */
  claudeCode: {
    available: () => Promise<{ ok: boolean; version?: string; error?: string }>
    folders: () => Promise<string[]>
    /** Folder chooser (desktop app only; null if cancelled or unavailable). */
    pickFolder: () => Promise<string | null>
    /** Runs the chat's last user message; the reply is the message with this id (already saved, cc.state running). */
    /** beside: the chat open on the other side, when the user typed the message (so Claude Code may send to it). */
    send: (chatId: string, messageId: string, beside?: BesideChat) => Promise<void>
    /** A Claude Code member's turn in a group chat: the reply is the message with this id. by: who tagged it. */
    sendMember: (chatId: string, messageId: string, roleId: string, by: string) => Promise<void>
    /** Stops a chat's run (for a group member: memberKey(chatId, roleId)). */
    stop: (chatId: string) => Promise<void>
    openFolder: (folder: string) => Promise<void>
    /** Where a new project folder with this name would go (next to recent projects; not created yet). */
    suggestFolder: (name: string) => Promise<string>
    /** Creates a new, empty project folder and returns its path. */
    makeFolder: (path: string) => Promise<string>
    onUpdate: (listener: (update: ClaudeCodeUpdate) => void) => () => void
  }
  python: {
    status: () => Promise<PythonStatus>
    onStatus: (listener: (status: PythonStatus) => void) => () => void
  }
  speech: {
    /** 16 kHz mono samples → text (language detected). */
    transcribe: (samples: Float32Array) => Promise<string>
    status: () => Promise<SpeechStatus>
    /** Begin loading the model (on mic press), so it is ready when the user stops talking. */
    warm: () => Promise<void>
    onStatus: (listener: (status: SpeechStatus) => void) => () => void
  }
  /** Interactive previews: store the HTML in the main process, then load it from frameUrl(id). */
  /** The browser pane: screenshots of its pages, for the user's marks. */
  browser: {
    capture: (webContentsId: number) => Promise<string>
    /** Dev browser mode: a screenshot of an address, at a size (pages there are iframes). */
    captureUrl: (url: string, width: number, height: number) => Promise<string>
    /** Saves a marked-up page (PNG data URL) as a file; returns its path. */
    saveMarkup: (dataUrl: string) => Promise<string>
    /** A page in the pane opened a link in a new window, or a chat opens an address: open it as a tab. */
    onOpen: (listener: (url: string) => void) => () => void
    /** The pane's tabs, for chats that use the browser (webContentsId: the tab's page). */
    report: (state: { open: boolean; active: number | null; tabs: { webContentsId: number | null; url: string; title: string }[] }) => Promise<void>
    /** Ctrl+Shift+S was pressed inside a page in the pane: toggle marking it up. */
    onMarkShortcut: (listener: () => void) => () => void
    /** A chat is using the browser (who, and what it is doing). */
    onAgent: (listener: (a: { who: string; what: string }) => void) => () => void
  }
  ui: {
    /** live: a page that shows a preview while it is being written (post { plotterUiLive: html } to it). */
    put: (html: string, dark: boolean, live?: boolean) => Promise<string>
    frameUrl: (id: string) => string
    /** The iframe sandbox for previews (the dev browser mode needs allow-same-origin; see devBridgeClient). */
    sandbox: string
  }
  /** Window frame and Windows title bar follow the chosen theme. */
  setTheme: (theme: 'light' | 'dark') => Promise<void>
  openUsage: () => Promise<void>
  /** PDF export: make() draws the chat (or one reply and its question) in a hidden window and prints it,
   *  for a preview; save() asks where to put it. */
  pdf: {
    make: (chatId: string, messageId?: string) => Promise<Uint8Array>
    /** Called by the hidden print page once everything is drawn. */
    ready: () => void
    /** Saves into Downloads (like a browser download) and returns the file's path. */
    save: (name: string) => Promise<string | null>
    /** Opens File Explorer with the saved PDF selected. */
    show: (path: string) => Promise<void>
    discard: () => Promise<void>
  }
}

export const USAGE_URL = 'https://chatgpt.com/settings/usage'
