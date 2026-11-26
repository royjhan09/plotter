import type { Chat, ChatMessage, ClaudeCodeMode } from '../../shared/api'

/**
 * Public stand-in for Claude Code chats, which live in Plotter's private folder. In a build without it,
 * Claude Code chats are switched off: no "New Claude Code chat", no "Send to Claude Code".
 */
export const CLAUDE_CODE = false

const off = (): never => {
  throw new Error('Claude Code chats are not part of this build.')
}

export async function sendClaudeTurn(_chat: Chat, _text: string): Promise<Chat> {
  return off()
}

export async function startClaudeChat(_task: string, _folder: string, _mode: ClaudeCodeMode, _effort?: string): Promise<Chat> {
  return off()
}

export function FolderPicker(_p: { folder: string; onPick: (folder: string) => void; autoOpen?: boolean }): React.JSX.Element | null {
  return null
}

/** An existing Claude Code reply, shown as plain text. */
export function ClaudeTurn({ m }: { m: ChatMessage; chatId: string }): React.JSX.Element {
  return <div className="cc-answer">{m.text}</div>
}
