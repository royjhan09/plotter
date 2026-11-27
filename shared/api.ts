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
}

/** Settings › Images: which image model, and how good by default. */
export interface ImageOptions {
  model: string
  quality: 'low' | 'medium' | 'high'
}

export interface ImageKeyStatus {
  /** An OpenAI API key is saved (pictures from the image model are possible). */
  set: boolean
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
  createdAt: number
  updatedAt: number
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
}

export type KitLevel = 'element' | 'pattern' | 'feature'

/** Named values for a component's variables (a red close button, a small one…). */
export interface KitVariant {
  name: string
  vars: Record<string, string>
}

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
    /** A project changed (a chat saved a note, a chat moved in or out). */
    onChanged: (listener: () => void) => () => void
  }
  images: {
    status: () => Promise<ImageKeyStatus>
    /** Checks the key with OpenAI, then saves it encrypted. */
    setKey: (key: string) => Promise<ImageKeyStatus>
    clearKey: () => Promise<ImageKeyStatus>
    setOptions: (patch: Partial<ImageOptions>) => Promise<ImageKeyStatus>
  }
  library: {
    /** Files and pictures from every chat, newest first. */
    list: () => Promise<LibraryItem[]>
    /** One of them, ready to attach. */
    get: (ref: LibraryRef) => Promise<Attachment>
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
  ui: {
    put: (html: string, dark: boolean) => Promise<string>
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
