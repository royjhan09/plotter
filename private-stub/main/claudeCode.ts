import type { BesideChat, Chat, ClaudeCodeUpdate } from '../../shared/api'

/** Public stand-in for Claude Code chats, which live in Plotter's private folder: switched off in this build. */
export const CLAUDE_CODE = false

export async function claudeCodeAvailable(): Promise<{ ok: boolean; version?: string; error?: string }> {
  return { ok: false, error: 'Claude Code chats are not part of this build.' }
}

export const recentFolders = (): string[] => []

export const settleStale = (chat: Chat): Chat => chat

export async function sendToClaude(_chatId: string, _messageId: string, _emit: (u: ClaudeCodeUpdate) => void, _beside?: BesideChat): Promise<void> {
  throw new Error('Claude Code chats are not part of this build.')
}

export async function sendMember(_chatId: string, _messageId: string, _roleId: string, _by: string, _emit: (u: ClaudeCodeUpdate) => void): Promise<void> {
  throw new Error('Claude Code members are not part of this build.')
}

export function stopClaude(_chatId: string): void {}

export function forgetGroup(_chatId: string): void {}

export function stopAllClaude(): void {}

export function suggestProjectFolder(_name: string): string {
  throw new Error('Claude Code chats are not part of this build.')
}

export function makeProjectFolder(_path: string): string {
  throw new Error('Claude Code chats are not part of this build.')
}
