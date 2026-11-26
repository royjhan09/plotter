import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { Attachment, Chat, ChatMessage, Model, ReplyEvent } from '../../shared/api'
import { Composer } from './Composer'
import { VoiceMode } from './VoiceMode'
import { toAttachment } from './attachments'
import { CanvasContext } from './Canvas'
import { PdfBadge } from './PdfPreview'
import { Message } from './Message'
import { RailIcon } from './RailIcon'
import { ClaudeBuddy, folderName, sendClaudeTurn } from './ClaudeCode'
import icon from '../../assets/icon.png'

const api = window.plotter
const newId = (): string => crypto.randomUUID().replace(/-/g, '')

function titleFrom(text: string, attachments: Attachment[]): string {
  const line = text.trim().split('\n')[0] ?? ''
  if (!line) return attachments[0]?.name ?? 'New chat'
  return line.length > 48 ? `${line.slice(0, 47)}…` : line
}

export function cleanError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

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
  onSendToClaude: (task: string) => void
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

  const isClaude = chat?.kind === 'claude'
  const ccBusy = isClaude && chat.messages.some((m) => m.cc?.state === 'running')

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

  const newChat = (): void => {
    if (pendingRef.current) return
    onChatId(null)
  }

  /** A Claude Code chat: the message goes to Claude Code, which keeps working in its own session. */
  const sendClaude = async (): Promise<void> => {
    const current = chatRef.current
    const text = draft.trim()
    if (!current || !text || ccBusy) return
    setDraft('')
    const next = await sendClaudeTurn(current, text)
    if (chatRef.current?.id === next.id) {
      // keep any update that arrived while sending
      const seen = new Map(chatRef.current.messages.map((m) => [m.id, m]))
      chatRef.current = { ...next, messages: next.messages.map((m) => seen.get(m.id) ?? m) }
      setChat(chatRef.current)
    }
    refreshList()
  }

  /** Sends a message (the composer's, or voice mode's text) and resolves with the full reply. */
  const sendMessage = async (spoken?: string): Promise<string> => {
    const text = (spoken ?? draft).trim()
    const files = spoken === undefined ? attachments : []
    if ((!text && files.length === 0) || pendingRef.current || !p.model) return ''
    const now = Date.now()
    const asResearch = research && spoken === undefined
    const user: ChatMessage = { id: newId(), role: 'user', text, at: now, ...(files.length ? { attachments: files } : {}), ...(asResearch ? { research: true } : {}) }
    const reply: ChatMessage = { id: newId(), role: 'assistant', text: '', at: now }
    const current = chatRef.current
    const base: Chat = current ?? { id: newId(), title: titleFrom(text, files), model: p.model.slug, messages: [], createdAt: now, updatedAt: now }
    const history = [...base.messages.filter((m) => !(m.role === 'assistant' && !m.text)), user]
    const next: Chat = { ...base, model: p.model.slug, messages: [...history, reply], updatedAt: now }
    chatRef.current = next
    setChat(next)
    if (spoken === undefined) {
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
        history: history.map((m) => ({ role: m.role, text: m.text, ...(m.attachments ? { attachments: m.attachments } : {}) })),
        research: asResearch,
        canvas: canvas.current
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

  const setMode = (mode: 'edit' | 'plan'): void => {
    const current = chatRef.current
    if (!current?.cc || ccBusy) return
    chatRef.current = { ...current, cc: { ...current.cc, mode } }
    setChat(chatRef.current)
    void api.chats.save(chatRef.current)
  }

  const messages = chat?.messages ?? []
  return (
    <main
      className={`main pane ${isClaude ? 'claude' : ''} ${p.split ? 'split' : ''} ${p.focused ? 'focused' : ''}`}
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
        <button className="topbar-new" title="New chat" onClick={newChat} disabled={!!pending}>
          <RailIcon name="new" />
        </button>
        {isClaude && (
          <span className="pane-badge">
            <ClaudeBuddy size={22} working={ccBusy} />
          </span>
        )}
        <span className="chat-heading">{chat?.title ?? ''}</span>
        {isClaude && chat.cc && (
          <span className="cc-where">
            <button className="cc-folder-chip" title={`${chat.cc.folder} (open in File Explorer)`} onClick={() => void api.claudeCode.openFolder(chat.cc!.folder)}>
              {folderName(chat.cc.folder)}
            </button>
            <span className="cc-mode-switch" title={ccBusy ? 'Changes after Claude Code finishes' : 'May Claude Code change files?'}>
              <button className={chat.cc.mode === 'edit' ? 'on' : ''} disabled={ccBusy} onClick={() => setMode('edit')} title="May change files in this folder">
                {p.split ? 'Edit' : 'Make changes'}
              </button>
              <button className={chat.cc.mode === 'plan' ? 'on' : ''} disabled={ccBusy} onClick={() => setMode('plan')} title="Reads and answers; changes nothing">
                {p.split ? 'Look' : 'Look only'}
              </button>
            </span>
          </span>
        )}
        {messages.length > 0 && (
          <button className="topbar-pdf" title="Convert this chat to a PDF" onClick={() => chat && p.savePdf(undefined, chat)} disabled={!!pending || ccBusy || p.pdfBusy}>
            <PdfBadge />
            {!p.split && 'Convert chat to PDF'}
          </button>
        )}
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
                onPdf={p.pdfBusy || !chat ? undefined : (id) => p.savePdf(id, chat)}
                onClaudeCode={isClaude ? undefined : (msg) => p.onSendToClaude(msg.text)}
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
          efforts={isClaude ? [] : (p.model?.efforts ?? [])}
          effort={p.effort}
          setEffort={p.setEffort}
          pending={isClaude ? ccBusy : !!pending}
          ready={isClaude ? true : !!p.model}
          placeholder={
            isClaude
              ? ccBusy
                ? 'Claude Code is working…'
                : `Tell Claude Code what to do in ${folderName(chat?.cc?.folder ?? '')}`
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
          onClaudeCode={isClaude ? undefined : () => p.onSendToClaude(draft)}
          variant={isClaude ? 'claude' : 'chatgpt'}
        />
        <div className="plan-note">
          {isClaude ? (
            'Claude Code · on your Claude subscription'
          ) : (
            <>
              {p.planUsage ? 'Using ChatGPT plan' : 'Plan usage not granted at sign-in'} ·{' '}
              <button className="link" onClick={() => void api.openUsage()}>
                Manage usage
              </button>
            </>
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
