import { app, safeStorage } from 'electron'
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Chat, ChatSummary } from '../shared/api'

/** Plotter's files, all under its own user-data folder. */
const root = (): string => app.getPath('userData')
const chatsDir = (): string => join(root(), 'chats')

function writeAtomic(path: string, data: string | Buffer): void {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, path)
}

// ---- secrets (tokens): encrypted with the OS keychain (DPAPI on Windows) ----

const secretsPath = (): string => join(root(), 'session.bin')

export function readSecrets<T>(): T | null {
  if (!existsSync(secretsPath())) return null
  try {
    const raw = readFileSync(secretsPath())
    return JSON.parse(safeStorage.decryptString(raw)) as T
  } catch {
    return null
  }
}

export function writeSecrets(value: unknown): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS encryption is not available, so Plotter will not store your sign-in.')
  mkdirSync(root(), { recursive: true })
  writeAtomic(secretsPath(), safeStorage.encryptString(JSON.stringify(value)))
}

export function clearSecrets(): void {
  rmSync(secretsPath(), { force: true })
}

// ---- settings (not secret) ----

export interface Settings {
  /** Stable per-install id sent as ext_agent_host_id. */
  hostId?: string
  welcomeSeen?: boolean
  lastModel?: string
  theme?: 'light' | 'dark'
}

const settingsPath = (): string => join(root(), 'settings.json')

export function readSettings(): Settings {
  try {
    return JSON.parse(readFileSync(settingsPath(), 'utf8')) as Settings
  } catch {
    return {}
  }
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...readSettings(), ...patch }
  mkdirSync(root(), { recursive: true })
  writeAtomic(settingsPath(), JSON.stringify(next, null, 2))
  return next
}

// ---- chats: one JSON file each ----

const safeId = (id: string): string => {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('bad chat id')
  return id
}

export function listChats(): ChatSummary[] {
  if (!existsSync(chatsDir())) return []
  const out: ChatSummary[] = []
  for (const name of readdirSync(chatsDir())) {
    if (!name.endsWith('.json')) continue
    try {
      const chat = JSON.parse(readFileSync(join(chatsDir(), name), 'utf8')) as Chat
      out.push({ id: chat.id, title: chat.title, updatedAt: chat.updatedAt })
    } catch {
      // a broken file is skipped, not fatal
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getChat(id: string): Chat | null {
  try {
    return JSON.parse(readFileSync(join(chatsDir(), `${safeId(id)}.json`), 'utf8')) as Chat
  } catch {
    return null
  }
}

export function saveChat(chat: Chat): void {
  mkdirSync(chatsDir(), { recursive: true })
  writeAtomic(join(chatsDir(), `${safeId(chat.id)}.json`), JSON.stringify(chat, null, 2))
}

export function removeChat(id: string): void {
  rmSync(join(chatsDir(), `${safeId(id)}.json`), { force: true })
}
