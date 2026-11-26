import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { Attachment, Chat, ChatKind, ChatMessage, BesideChat, ClaudeChatConfig, HandOff, Model, Project, ReplyEvent } from '../../shared/api'
import { Composer, EffortMenu } from './Composer'
import { VoiceMode } from './VoiceMode'
import { toAttachment } from './attachments'
import { CanvasContext } from './Canvas'
import { PDF_EXPORT, PdfBadge } from '@private/renderer/PdfPreview'
import { HandOffCard, Message } from './Message'
import { ProjectIcon } from './Projects'
import { RailIcon, ThemeButton } from './RailIcon'
import { useClaudeTheme, type Theme } from './theme'
import { ClaudeBuddy, folderName } from './ClaudeBuddy'
import { CLAUDE_CODE, FolderPicker, sendClaudeTurn, startClaudeChat } from '@private/renderer/ClaudeCode'
import icon from '../../assets/icon.png'

const api = window.plotter
const newId = (): string => crypto.randomUUID().replace(/-/g, '')

/** A message as ChatGPT reads it: what the user wrote, then anything another chat handed over with it. */
function withHandOff(m: ChatMessage): string {
  if (!m.from) return m.text
  const who = m.from.kind === 'side' ? `the ${m.from.sender === 'claude' ? 'Claude Code' : 'ChatGPT'} chat open beside this one (sent at the user's request)` : `the chat "${m.from.chat}"`
  const ask = m.text.trim() || (m.from.kind === 'side' ? 'Answer this message from the chat beside, for the user.' : 'Look at this.')
  return `${ask}\n\n<handed_over from="${who.replace(/"/g, "'")}">\n${m.from.text.trim()}\n</handed_over>`
}

function titleFrom(text: string, attachments: Attachment[]): string {
  const line = text.trim().split('\n')[0] ?? ''
  if (!line) return attachments[0]?.name ?? 'New chat'
  return line.length > 48 ? `${line.slice(0, 47)}…` : line
}

export function cleanError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** Claude Code's own effort levels (claude --effort), shown in the same menu as ChatGPT's reasoning levels. */
const CLAUDE_EFFORTS = [
  { effort: 'low', description: 'Quick, light changes' },
  { effort: 'medium', description: 'Everyday tasks' },
  { effort: 'high', description: 'Harder problems' },
  { effort: 'xhigh', description: 'Claude Code’s default for coding' },
  { effort: 'max', description: 'The deepest work; slowest' }
]
const CC_EFFORT_KEY = 'plotter.ccEffort'

type Waiter = { resolve: (text: string) => void; reject: (e: Error) => void }

/** Tells every pane that a chat was renamed (from the chat list's ⋯ menu). */
export const announceRename = (id: string, title: string): void => void window.dispatchEvent(new CustomEvent('plotter-chat-renamed', { detail: { id, title } }))

export interface ChatPaneProps {
  /** The chat this pane shows; null = a new chat. */
  chatId: string | null
  /** The pane now shows another chat (it started one, or "new chat" was clicked). */
  onChatId: (id: string | null) => void
  side: 'left' | 'right'
  split: boolean
  focused: boolean
  onFocus: () => void
  /** Closes the right-hand pane. */
  onClose?: () => void
  model: Model | null
  modelError: string | null
  loadModel: () => void
  effort: string
  setEffort: (e: string) => void
  planUsage: boolean
  refreshList: () => void
  toast: (message: string) => void
  savePdf: (messageId: string | undefined, target: { id: string; title: string }) => void
  pdfBusy: boolean
  /** "Send to Claude Code" from a reply or the + menu: starts a Claude Code chat (opened beside this one). */
  onSendToClaude: (task: string, from?: HandOff, projectId?: string) => void
  /** What this side's new chat is, text to start it with and a reply handed to it; a new n means "start a new chat now". */
  newChat: { kind: ChatKind; seed?: string; from?: HandOff; projectId?: string; n: number }
  /** The chat open on the other side (side by side), so this chat can send something to it. */
  beside?: BesideChat
  /** Something the chat beside sent here; a new n means "it just arrived": this chat answers it right away. */
  incoming?: { from: HandOff; n: number }
  /** All projects (for the project name in the top bar). */
  projects: Project[]
  onOpenProject: (id: string) => void
  /** Which kind of chat this side shows now (so the other side knows what is beside it). */
  onKind: (kind: ChatKind) => void
  /** The app's light/dark (a ChatGPT chat follows and switches it; a Claude Code chat has its own, dark by default). */
  theme: Theme
  setTheme: (t: Theme) => void
}

/**
 * One open chat: its own messages, message box, sending and streaming. Two can sit side by side, each
 * showing any chat: a ChatGPT chat (Plotter's sprout) or a Claude Code chat (the buddy, dark neon).
 */
export function ChatPane(p: ChatPaneProps): React.JSX.Element {
  const [chat, setChat] = useState<Chat | null>(null)
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [pending, setPending] = useState<{ requestId: string; chatId: string } | null>(null)
  const [activity, setActivity] = useState<string | null>(null)
  const [limitHit, setLimitHit] = useState(false)
  const [research, setResearch] = useState(false)
  const [voice, setVoice] = useState(false)
  const canvas = useContext(CanvasContext)
  const chatRef = useRef<Chat | null>(null)
  chatRef.current = chat
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const waiters = useRef(new Map<string, Waiter>())
  const scroller = useRef<HTMLDivElement>(null)
  const { refreshList, onChatId, toast } = p

  // A new chat (nothing sent yet) is a ChatGPT chat or a Claude Code chat; a Claude one already has its folder and mode.
  const [newKind, setNewKind] = useState<ChatKind>(p.newChat.kind)
  const [ccNew, setCcNew] = useState<ClaudeChatConfig | null>(null)
  const [ccMissing, setCcMissing] = useState<string | null>(null)
  // a ChatGPT reply handed to this (new) Claude Code chat, shown as a card in the message box
  const [handOff, setHandOff] = useState<HandOff | null>(null)
  const handOffRef = useRef<HandOff | null>(null)
  // the project a new chat starts in (its first message saves it there)
  const [newProject, setNewProject] = useState<string | undefined>(p.newChat.projectId)
  handOffRef.current = handOff
  // a project brief's suggested new folder (Create project), and whether it was made
  const [suggested, setSuggested] = useState<{ path: string; made: boolean } | null>(null)
  useEffect(() => {
    setSuggested(null)
    if (!handOff?.folder || chat) return
    void api.claudeCode.suggestFolder(handOff.folder).then((path) => setSuggested({ path, made: false })).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handOff])
  const makeSuggested = async (): Promise<void> => {
    if (!suggested) return
    try {
      const path = await api.claudeCode.makeFolder(suggested.path)
      setSuggested({ path, made: true })
      setCcNew((c) => (c ? { ...c, folder: path } : { folder: path, mode: 'edit', effort: localStorage.getItem(CC_EFFORT_KEY) ?? 'xhigh' }))
    } catch (e) {
      toast(cleanError(e))
    }
  }
  // "Create project": ChatGPT sums up this chat into a brief, then a Claude Code chat opens beside it with the brief attached
  const [briefBusy, setBriefBusy] = useState(false)
  const isClaude = chat ? chat.kind === 'claude' : newKind === 'claude'
  const { onKind } = p
  useEffect(() => onKind(isClaude ? 'claude' : 'chatgpt'), [isClaude, onKind])
  const cc = chat ? chat.cc : ccNew
  const ccBusy = !!chat && chat.kind === 'claude' && chat.messages.some((m) => m.cc?.state === 'running')
  const [ccTheme, setCcTheme] = useClaudeTheme()

  // A greyed-out guess at the next message (Tab fills it in), asked for when a reply finishes here.
  const [suggestion, setSuggestion] = useState('')
  const wasBusy = useRef(false)
  const busyNow = !!pending || ccBusy
  useEffect(() => {
    const msgs = chat?.messages ?? []
    const last = msgs[msgs.length - 1]
    if (busyNow) {
      wasBusy.current = true
      setSuggestion('')
      return
    }
    if (!chat || !last) {
      wasBusy.current = false
      setSuggestion(isClaude ? 'Explain how this project is organized' : '')
      return
    }
    if (!wasBusy.current) return
    wasBusy.current = false
    if (last.role !== 'assistant' || !last.text || last.error) return
    const user = [...msgs].reverse().find((m) => m.role === 'user')
    void api.chats
      .suggest(isClaude ? 'claude' : 'chatgpt', user?.text ?? '', last.text)
      .then((t) => {
        const now = chatRef.current?.messages
        if (t && now?.[now.length - 1]?.id === last.id) setSuggestion(t)
      })
      .catch(() => undefined)
  }, [chat, busyNow, isClaude])
  const [newMenu, setNewMenu] = useState(false)
  useEffect(() => {
    if (!newMenu) return
    const close = (): void => setNewMenu(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [newMenu])

  // Show the chat the app asks for (a click in the list, a drop, a new chat).
  useEffect(() => {
    if (p.chatId === (chatRef.current?.id ?? null)) return
    if (pendingRef.current) {
      toast('Wait for the reply to finish (or stop it) before switching this side to another chat.')
      onChatId(chatRef.current?.id ?? null)
      return
    }
    if (!p.chatId) {
      chatRef.current = null
      setChat(null)
      setDraft('')
      setAttachments([])
      return
    }
    let live = true
    void api.chats.get(p.chatId).then((c) => {
      if (!live) return
      if (!c) return onChatId(null)
      chatRef.current = c
      setChat(c)
      setLimitHit(false)
    })
    return () => {
      live = false
    }
  }, [p.chatId, onChatId, toast])

  // "New chat" / "New Claude Code chat" from the app: this side starts a new chat of that kind.
  useEffect(() => {
    if (p.newChat.n === 0) return
    setNewKind(p.newChat.kind)
    if (p.newChat.kind === 'claude') setCcNew(null)
    setDraft(p.newChat.seed ?? '')
    setHandOff(p.newChat.from ?? null)
    setNewProject(p.newChat.projectId)
    if (p.newChat.from) setAttachments([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.newChat.n])

  // A new Claude Code chat starts in the folder used last (and checks Claude Code is installed).
  useEffect(() => {
    if (chat || newKind !== 'claude' || ccNew) return
    void api.claudeCode.folders().then((list) => setCcNew((c) => c ?? { folder: handOffRef.current?.folder ? '' : (list[0] ?? ''), mode: 'edit', effort: localStorage.getItem(CC_EFFORT_KEY) ?? 'xhigh' }))
    void api.claudeCode.available().then((a) => setCcMissing(a.ok ? null : (a.error ?? 'Claude Code is not available.')))
  }, [chat, newKind, ccNew])

  // A move into or out of a project, from the chat list.
  useEffect(() => {
    const on = (e: Event): void => {
      const { id, projectId } = (e as CustomEvent<{ id: string; projectId: string | null }>).detail
      if (chatRef.current?.id !== id) return
      const { projectId: _old, ...rest } = chatRef.current
      chatRef.current = projectId ? { ...rest, projectId } : rest
      setChat(chatRef.current)
    }
    window.addEventListener('plotter-chat-project', on)
    return () => window.removeEventListener('plotter-chat-project', on)
  }, [])

  // A rename from the chat list.
  useEffect(() => {
    const on = (e: Event): void => {
      const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail
      if (chatRef.current?.id !== id) return
      chatRef.current = { ...chatRef.current, title, titled: true }
      setChat(chatRef.current)
    }
    window.addEventListener('plotter-chat-renamed', on)
    return () => window.removeEventListener('plotter-chat-renamed', on)
  }, [])

  // Claude Code's progress in this pane's chat.
  useEffect(
    () =>
      api.claudeCode.onUpdate((u) => {
        const current = chatRef.current
        if (!current || u.chatId !== current.id) return
        const has = current.messages.some((m) => m.id === u.message.id)
        const messages = has ? current.messages.map((m) => (m.id === u.message.id ? u.message : m)) : [...current.messages, u.message]
        chatRef.current = { ...current, messages, cc: current.cc && u.sessionId ? { ...current.cc, sessionId: u.sessionId } : current.cc }
        setChat(chatRef.current)
        if (u.message.cc?.state !== 'running') refreshList()
      }),
    [refreshList]
  )

  // While Python starts or downloads a library, say so in the reply's activity line.
  useEffect(
    () =>
      api.python.onStatus((s) => {
        if (s.state === 'loading' && pendingRef.current) setActivity(s.detail)
      }),
    []
  )

  /** Ask the model for a short title and store it, whether or not the chat is still open. */
  const nameChat = useCallback(
    async (chatId: string, userText: string, replyText: string): Promise<void> => {
      try {
        const title = await api.chats.title(userText, replyText)
        if (!title) return
        const open = chatRef.current?.id === chatId ? chatRef.current : null
        const stored = open ?? (await api.chats.get(chatId))
        if (!stored) return
        const named = { ...stored, title, titled: true }
        if (open) {
          chatRef.current = named
          setChat(named)
        }
        await api.chats.save(named)
        refreshList()
      } catch {
        // keep the first-message title if naming fails (e.g. usage limit)
      }
    },
    [refreshList]
  )

  // ChatGPT reply events. Refs, not state updaters, so each event is applied exactly once.
  useEffect(
    () =>
      api.reply.onEvent((ev: ReplyEvent) => {
        const pend = pendingRef.current
        const current = chatRef.current
        if (!pend || pend.requestId !== ev.requestId || !current || current.id !== pend.chatId) return
        const msgs = [...current.messages]
        const last = msgs[msgs.length - 1]
        if (!last || last.role !== 'assistant') return
        if (ev.type === 'activity') {
          setActivity(ev.label)
          return
        }
        if (ev.type === 'tool') {
          msgs[msgs.length - 1] = { ...last, text: `${last.text}\n\n[[tool:${ev.run.id}]]\n\n`, toolRuns: [...(last.toolRuns ?? []), ev.run] }
          chatRef.current = { ...current, messages: msgs }
          setChat(chatRef.current)
          return
        }
        if (ev.type === 'source') {
          if (last.sources?.some((s) => s.url === ev.url)) return
          msgs[msgs.length - 1] = { ...last, sources: [...(last.sources ?? []), { url: ev.url, title: ev.title }] }
          chatRef.current = { ...current, messages: msgs }
          setChat(chatRef.current)
          return
        }
        if (ev.type === 'delta') {
          const first = !last.text && last.thoughtMs === undefined
          msgs[msgs.length - 1] = { ...last, text: last.text + ev.text, ...(first ? { thoughtMs: Date.now() - last.at } : {}) }
          chatRef.current = { ...current, messages: msgs }
          setChat(chatRef.current)
          return
        }
        setActivity(null)
        if (ev.type === 'error') {
          msgs[msgs.length - 1] = { ...last, error: ev.message }
          if (ev.usageLimit) setLimitHit(true)
        }
        const done = { ...current, messages: msgs, updatedAt: Date.now() }
        chatRef.current = done
        pendingRef.current = null
        setChat(done)
        setPending(null)
        void api.chats.save(done).then(refreshList)
        const users = done.messages.filter((m) => m.role === 'user')
        if (users.length === 1 && last.text && !done.titled) void nameChat(done.id, users[0]!.text, last.text)
        const w = waiters.current.get(ev.requestId)
        waiters.current.delete(ev.requestId)
        if (w) {
          if (ev.type === 'error' && !last.text) w.reject(new Error(ev.message))
          else w.resolve(last.text)
        }
      }),
    [refreshList, nameChat]
  )

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat?.messages])

  /** The pencil's menu: a new ChatGPT chat, or a new Claude Code chat (in this chat's folder if it has one). */
  const newChat = (kind: ChatKind): void => {
    setNewMenu(false)
    if (pendingRef.current) return
    const current = chatRef.current
    setNewKind(kind)
    if (kind === 'claude') setCcNew(current?.cc ? { folder: current.cc.folder, mode: 'edit', effort: current.cc.effort } : null)
    setNewProject(current?.projectId) // a new chat from a project chat stays in the project
    setDraft('')
    onChatId(null)
  }

  /** A Claude Code chat: the message goes to Claude Code, which keeps working in its own session. */
  const createProject = async (): Promise<void> => {
    const current = chatRef.current
    if (!current || briefBusy) return
    setBriefBusy(true)
    try {
      const b = await api.chats.brief(current.id)
      // the ChatGPT chat and the new Claude Code chat share a Plotter project (this chat's, or a new one)
      let projectId = current.projectId
      if (!projectId) {
        const project = await api.projects.create(b.title || current.title)
        projectId = project.id
        await api.chats.update(current.id, { projectId })
        chatRef.current = { ...current, projectId }
        setChat(chatRef.current)
        const goal = /##\s*Goal\s*\n+([^\n]+)/i.exec(b.brief)?.[1]?.trim()
        if (goal) await api.projects.addNote(projectId, goal.length > 380 ? `${goal.slice(0, 379)}…` : goal).catch(() => undefined)
        refreshList()
      }
      p.onSendToClaude('', { chat: b.title || current.title, text: b.brief, kind: 'brief', folder: b.folder }, projectId)
    } catch (e) {
      toast(`Could not make the project brief: ${cleanError(e)}`)
    } finally {
      setBriefBusy(false)
    }
  }

  /** Sends the message box (or, with incoming, what the chat beside just sent) to Claude Code. */
  const sendClaude = async (incoming?: HandOff): Promise<void> => {
    const current = chatRef.current
    const text = incoming ? '' : draft.trim()
    const files = incoming ? [] : attachments.filter((a) => a.kind === 'text' || a.kind === 'sheet' || a.kind === 'doc')
    if ((!text && !handOff && !files.length && !incoming) || ccBusy) return
    if (attachments.length > files.length && !incoming) toast('Claude Code chats take text files only; pictures and PDFs were left out.')
    const from = incoming ?? handOff ?? undefined
    // the user's own message may ask Claude Code to send something to the chat beside; a delivered one may not (no ping-pong)
    const beside = incoming ? undefined : p.beside
    const clearBox = (): void => {
      if (incoming) return
      setDraft('')
      setAttachments([])
      setHandOff(null)
    }
    if (!current) {
      // the first message creates the chat, in the folder chosen in the top bar
      if (!ccNew?.folder) {
        if (incoming) setHandOff(incoming) // keep it in the box until a folder is chosen
        return toast(incoming ? 'The other chat sent a message here. Select a folder below, then press send.' : 'Select the folder Claude Code should work in (below the message box).')
      }
      clearBox()
      const created = await startClaudeChat(text, ccNew.folder, 'edit', ccNew.effort, { from, files, beside, projectId: newProject })
      chatRef.current = created
      setChat(created)
      onChatId(created.id)
      refreshList()
      return
    }
    clearBox()
    const next = await sendClaudeTurn(current, text, { from, files, beside })
    if (chatRef.current?.id === next.id) {
      // keep any update that arrived while sending
      const seen = new Map(chatRef.current.messages.map((m) => [m.id, m]))
      chatRef.current = { ...next, messages: next.messages.map((m) => seen.get(m.id) ?? m) }
      setChat(chatRef.current)
    }
    refreshList()
  }

  /** Sends a message (the composer's, or voice mode's text) and resolves with the full reply. */
  const sendMessage = async (spoken?: string, incoming?: HandOff): Promise<string> => {
    const typed = spoken === undefined && !incoming
    const text = incoming ? '' : (spoken ?? draft).trim()
    const files = typed ? attachments : []
    // a hand-off left in the message box (it arrived while this chat was busy) goes with the next message
    if (typed && handOff && !incoming) incoming = handOff
    if ((!text && files.length === 0 && !incoming) || pendingRef.current || !p.model) return ''
    if (typed) setHandOff(null)
    const now = Date.now()
    const asResearch = research && typed
    const user: ChatMessage = { id: newId(), role: 'user', text, at: now, ...(files.length ? { attachments: files } : {}), ...(asResearch ? { research: true } : {}), ...(incoming ? { from: incoming } : {}) }
    const reply: ChatMessage = { id: newId(), role: 'assistant', text: '', at: now }
    const current = chatRef.current
    const base: Chat = current ?? { id: newId(), title: incoming ? `From ${incoming.chat}`.slice(0, 60) : titleFrom(text, files), model: p.model.slug, messages: [], createdAt: now, updatedAt: now, ...(newProject ? { projectId: newProject } : {}) }
    const history = [...base.messages.filter((m) => !(m.role === 'assistant' && !m.text)), user]
    const next: Chat = { ...base, model: p.model.slug, messages: [...history, reply], updatedAt: now }
    chatRef.current = next
    setChat(next)
    if (typed) {
      setDraft('')
      setAttachments([])
      setResearch(false)
    }
    setLimitHit(false)
    const requestId = newId()
    pendingRef.current = { requestId, chatId: next.id }
    setPending(pendingRef.current)
    const finished = new Promise<string>((resolve, reject) => waiters.current.set(requestId, { resolve, reject }))
    await api.chats.save(next)
    if (!current) onChatId(next.id)
    refreshList()
    try {
      await api.reply.send({
        requestId,
        chatId: next.id,
        model: p.model.slug,
        effort: p.effort,
        history: history.map((m) => ({ role: m.role, text: withHandOff(m), ...(m.attachments ? { attachments: m.attachments } : {}) })),
        research: asResearch,
        canvas: canvas.current,
        // only a message the user typed or spoke may send something to the chat beside (no ping-pong)
        ...(p.beside && typed ? { beside: p.beside } : {})
      })
    } catch (e) {
      const failed = { ...next, messages: [...history, { ...reply, error: cleanError(e) }] }
      chatRef.current = failed
      pendingRef.current = null
      setChat(failed)
      setPending(null)
      void api.chats.save(failed)
      waiters.current.delete(requestId)
      throw e
    }
    return finished
  }

  // Something the chat beside sent here: answer it right away (or keep it in the box if this chat is busy).
  const deliverRef = useRef<(from: HandOff) => void>(() => undefined)
  deliverRef.current = (from: HandOff): void => {
    if (pendingRef.current || ccBusy) {
      setHandOff(from)
      toast('The chat beside sent a message. It is in the message box; it goes with your next message.')
      return
    }
    if (isClaude) void sendClaude(from)
    else void sendMessage(undefined, from).catch(() => undefined)
  }
  useEffect(() => {
    if (p.incoming) deliverRef.current(p.incoming.from)
  }, [p.incoming])

  const sendRef = useRef(sendMessage)
  sendRef.current = sendMessage
  const ask = useCallback((text: string) => sendRef.current(text), [])

  const stop = (): void => {
    if (isClaude && chat) return void api.claudeCode.stop(chat.id)
    if (pending) void api.reply.stop(pending.requestId)
  }

  const onDropFiles = async (files: FileList): Promise<void> => {
    if (isClaude) return
    for (const f of Array.from(files)) {
      try {
        const a = await toAttachment(f)
        setAttachments((prev) => [...prev, a])
      } catch (e) {
        toast(cleanError(e))
      }
    }
  }

  /** Changes a Claude Code chat's folder or effort (a new folder starts a new Claude Code session there). */
  const setCc = (patch: Partial<ClaudeChatConfig>): void => {
    if (patch.effort) localStorage.setItem(CC_EFFORT_KEY, patch.effort)
    const current = chatRef.current
    if (!current) return setCcNew((c) => ({ folder: c?.folder ?? '', mode: 'edit', effort: c?.effort, ...patch }))
    if (!current.cc || ccBusy) return
    if (patch.folder === '') return toast('A Claude Code chat that has started keeps a folder. Choose another folder, or start a new chat.')
    const moved = patch.folder !== undefined && patch.folder !== current.cc.folder
    chatRef.current = { ...current, cc: { ...current.cc, ...patch, ...(moved ? { sessionId: undefined } : {}) } }
    setChat(chatRef.current)
    void api.chats.save(chatRef.current)
    if (moved) toast(`Claude Code will work in ${folderName(patch.folder!)} from the next message (a fresh session there).`)
  }

  const messages = chat?.messages ?? []
  const projectOf = p.projects.find((x) => x.id === (chat ? chat.projectId : newProject))
  const lastReply = messages.reduce((at, m, i) => (m.role === 'assistant' && m.text && !m.cc ? i : at), -1)
  return (
    <main
      className={`main pane ${isClaude ? `claude theme-${ccTheme}` : ''} ${p.split ? 'split' : ''} ${p.focused ? 'focused' : ''}`}
      onMouseDown={p.onFocus}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault()
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        void onDropFiles(e.dataTransfer.files)
      }}
    >
      <header className="topbar">
        <div className="pop-anchor">
          <button
            className="topbar-new"
            title="New chat"
            disabled={!!pending}
            onClick={(e) => {
              e.stopPropagation()
              if (!CLAUDE_CODE) return newChat('chatgpt') // only one kind of chat in this build
              setNewMenu(!newMenu)
            }}
          >
            <RailIcon name="new" />
          </button>
          {newMenu && (
            <div className="pop new-menu" onClick={(e) => e.stopPropagation()}>
              <button className="pop-item" onClick={() => newChat('chatgpt')}>
                <img src={icon} alt="" className="new-menu-icon" />
                <span className="new-menu-text">
                  <b>New chat</b>
                  <span>ChatGPT, on your ChatGPT plan</span>
                </span>
              </button>
              <button className="pop-item" onClick={() => newChat('claude')}>
                <ClaudeBuddy size={26} />
                <span className="new-menu-text">
                  <b>New chat</b>
                  <span>Claude Code, in a project folder</span>
                </span>
              </button>
            </div>
          )}
        </div>
        <span className="chat-heading">{chat?.title ?? ''}</span>
        {projectOf && (
          <button className="project-chip" title={`Open the project “${projectOf.name}”`} onClick={() => p.onOpenProject(projectOf.id)}>
            <ProjectIcon />
            <span>{projectOf.name}</span>
          </button>
        )}
        {PDF_EXPORT && messages.length > 0 && (
          <button className="topbar-pdf" title="Convert this chat to a PDF" onClick={() => chat && p.savePdf(undefined, chat)} disabled={!!pending || ccBusy || p.pdfBusy}>
            <PdfBadge />
            {!p.split && 'Convert chat to PDF'}
          </button>
        )}
        <ThemeButton theme={isClaude ? ccTheme : p.theme} onChange={isClaude ? setCcTheme : p.setTheme} />
        {p.onClose && (
          <button className="pane-close" title="Close this side" onClick={p.onClose}>
            ×
          </button>
        )}
      </header>

      <div className="scroller" ref={scroller}>
        {messages.length === 0 ? (
          <div className="hello">
            {isClaude ? <ClaudeBuddy size={84} /> : <img src={icon} alt="" />}
            <h2>{isClaude ? 'What shall we build?' : 'What shall we grow today?'}</h2>
            {isClaude && !chat && (
              <p className="cc-hello-note">
                {ccMissing ? (
                  <span className="cc-bad">{ccMissing}</span>
                ) : cc?.folder ? (
                  <>
                    Claude Code works in <b title={cc.folder}>{folderName(cc.folder)}</b>. Change it with the folder button below the message box.
                  </>
                ) : handOff?.kind === 'brief' ? (
                  'Your project brief is attached. Create the suggested new folder for it (or choose another below), then press send: Claude Code starts building right away.'
                ) : (
                  'Select a folder below the message box, then tell Claude Code what to do.'
                )}
              </p>
            )}
            {p.modelError && !isClaude && (
              <p className="error">
                {p.modelError}{' '}
                <button className="link" onClick={p.loadModel}>
                  Try again
                </button>
              </p>
            )}
          </div>
        ) : (
          <div className="thread">
            <div className="print-head">
              <div className="print-title">{chat?.title || 'Plotter chat'}</div>
              <div className="print-meta">
                {isClaude ? `Claude Code · ${chat?.cc?.folder ?? ''}` : 'Plotter'} · {new Date().toLocaleDateString()}
              </div>
            </div>
            {messages.map((m, i) => (
              <Message
                key={m.id}
                m={m}
                chatId={chat?.id}
                typing={!!pending && i === messages.length - 1 && m.role === 'assistant'}
                activity={activity}
                onProject={isClaude || !CLAUDE_CODE || i !== lastReply ? undefined : () => void createProject()}
                projectBusy={briefBusy}
              />
            ))}
          </div>
        )}
      </div>

      <div className="composer-wrap">
        {limitHit && (
          <div className="limit">
            <span>You’ve reached your ChatGPT plan’s usage limit for now.</span>
            <button className="btn primary" onClick={() => void api.openUsage()}>
              Manage usage
            </button>
          </div>
        )}
        <Composer
          draft={draft}
          setDraft={setDraft}
          attachments={attachments}
          setAttachments={setAttachments}
          leadSlot={isClaude ? <span className="lead-gap" /> : undefined}
          pending={isClaude ? ccBusy : !!pending}
          ready={isClaude ? true : !!p.model}
          placeholder={
            isClaude
              ? ccBusy
                ? 'Claude Code is working…'
                : handOff
                  ? 'Add what Claude Code should do with it (optional)'
                  : cc?.folder
                  ? `Tell Claude Code what to do in ${folderName(cc.folder)}`
                  : 'Select a folder below first'
              : p.model
                ? 'Ask Plotter anything'
                : p.modelError
                  ? 'Plotter could not load its model'
                  : 'Loading…'
          }
          onSend={() => (isClaude ? void sendClaude() : void sendMessage().catch(() => undefined))}
          onStop={stop}
          onVoice={() => setVoice(true)}
          onError={toast}
          research={research}
          setResearch={setResearch}
          onClaudeCode={isClaude || !CLAUDE_CODE ? undefined : () => p.onSendToClaude(draft)}
          variant={isClaude ? 'claude' : 'chatgpt'}
          suggestion={handOff ? undefined : suggestion}
          topSlot={
            handOff ? (
              <>
                <HandOffCard from={handOff} onRemove={() => setHandOff(null)} />
                {suggested && !chat && (
                  <div className="folder-suggest">
                    {cc?.folder === suggested.path && suggested.made ? (
                      <span>
                        Created <b>{folderName(suggested.path)}</b>. Claude Code will build the project there.
                      </span>
                    ) : (
                      <>
                        <span className="folder-suggest-text">
                          New folder <b>{folderName(suggested.path)}</b> in {suggested.path.slice(0, suggested.path.length - folderName(suggested.path).length).replace(/[\\/]$/, '')}
                        </span>
                        <button className="btn small primary" onClick={() => void makeSuggested()}>
                          Create folder
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            ) : undefined
          }
          canSendEmpty={!!handOff}
        />
        <div className="composer-below">
          {isClaude ? (
            <FolderPicker folder={cc?.folder ?? ''} onPick={(folder) => setCc({ folder })} autoOpen={!chat && !!cc && !cc.folder && !handOff?.folder} />
          ) : !p.planUsage ? (
            <button className="link plan-warn" onClick={() => void api.openUsage()} title="Plotter can’t use your ChatGPT plan until you allow it at sign-in">
              Plan usage not granted
            </button>
          ) : (
            <span />
          )}
          {isClaude ? (
            <EffortMenu title="Effort" efforts={CLAUDE_EFFORTS} effort={cc?.effort ?? 'xhigh'} setEffort={(effort) => setCc({ effort })} />
          ) : (
            <EffortMenu efforts={p.model?.efforts ?? []} effort={p.effort} setEffort={p.setEffort} />
          )}
        </div>
      </div>

      {voice && (
        <VoiceMode
          ask={ask}
          onClose={() => {
            setVoice(false)
            stop()
          }}
        />
      )}
    </main>
  )
}
