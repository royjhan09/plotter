import { app, safeStorage } from 'electron'
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_FEATURES, type Chat, type ChatMetaPatch, type ChatSummary, type Features, type Memory } from '../shared/api'

/** Plotter's files, all under its own user-data folder. */
const root = (): string => app.getPath('userData')
const chatsDir = (): string => join(root(), 'chats')

export function writeAtomic(path: string, data: string | Buffer): void {
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
  features?: Partial<Features>
  connectorsEnabled?: Partial<Record<'google' | 'notion', boolean>>
  /** Project folders recently sent to Claude Code, newest first. */
  ccFolders?: string[]
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
      out.push({ id: chat.id, title: chat.title, updatedAt: chat.updatedAt, pinned: !!chat.pinned, archived: !!chat.archived, kind: chat.kind ?? 'chatgpt', ...(chat.projectId ? { projectId: chat.projectId } : {}), ...(chat.roleId ? { roleId: chat.roleId } : {}) })
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
  // Pin and archive are changed only through updateChatMeta; a save from the window keeps them.
  const before = getChat(chat.id)
  if (before) {
    // the project is changed through updateChatMeta too (a window holding an older copy must not undo a move)
    chat = { ...chat, pinned: before.pinned, archived: before.archived, projectId: before.projectId, ...(chat.roleId ?? before.roleId ? { roleId: chat.roleId ?? before.roleId } : {}) }
    // A Claude Code chat's session id is written by the main process; keep it.
    // (A new folder starts a new session, so then it is not carried over.)
    if (before.cc?.sessionId && chat.cc && !chat.cc.sessionId && chat.cc.folder === before.cc.folder) chat = { ...chat, cc: { ...chat.cc, sessionId: before.cc.sessionId } }
  }
  writeAtomic(join(chatsDir(), `${safeId(chat.id)}.json`), JSON.stringify(chat, null, 2))
}

/** Rename (also marks it named, so the auto-title leaves it alone), pin or archive a chat. */
export function updateChatMeta(id: string, patch: ChatMetaPatch): void {
  const chat = getChat(id)
  if (!chat) return
  if (typeof patch.title === 'string' && patch.title.trim()) {
    chat.title = patch.title.trim().slice(0, 200)
    chat.titled = true
  }
  if (typeof patch.pinned === 'boolean') chat.pinned = patch.pinned
  if (patch.projectId === null) delete chat.projectId
  else if (typeof patch.projectId === 'string' && patch.projectId) chat.projectId = patch.projectId
  if (typeof patch.archived === 'boolean') {
    chat.archived = patch.archived
    if (patch.archived) chat.pinned = false
  }
  mkdirSync(chatsDir(), { recursive: true })
  writeAtomic(join(chatsDir(), `${safeId(chat.id)}.json`), JSON.stringify(chat, null, 2))
}

/** Writes a chat as given (the main process's own updates, e.g. a Claude Code reply as it streams). */
export function writeChatFile(chat: Chat): void {
  mkdirSync(chatsDir(), { recursive: true })
  writeAtomic(join(chatsDir(), `${safeId(chat.id)}.json`), JSON.stringify(chat, null, 2))
}

export function removeChat(id: string): void {
  rmSync(join(chatsDir(), `${safeId(id)}.json`), { force: true })
}

// ---- features (Settings → Features) ----

export function readFeatures(): Features {
  return { ...DEFAULT_FEATURES, ...(readSettings().features ?? {}) }
}

export function updateFeatures(patch: Partial<Features>): Features {
  const clean: Partial<Features> = {}
  for (const k of Object.keys(DEFAULT_FEATURES) as (keyof Features)[]) if (typeof patch[k] === 'boolean') clean[k] = patch[k]
  const next = { ...readFeatures(), ...clean }
  updateSettings({ features: next })
  return next
}

// ---- memory: facts the model saved about the user ----

const memoriesPath = (): string => join(root(), 'memories.json')

export function listMemories(): Memory[] {
  try {
    return JSON.parse(readFileSync(memoriesPath(), 'utf8')) as Memory[]
  } catch {
    return []
  }
}

function writeMemories(list: Memory[]): Memory[] {
  mkdirSync(root(), { recursive: true })
  writeAtomic(memoriesPath(), JSON.stringify(list, null, 2))
  return list
}

export function addMemory(text: string): Memory {
  const m: Memory = { id: Math.random().toString(36).slice(2, 8), text: text.trim().slice(0, 500), at: Date.now() }
  writeMemories([...listMemories(), m].slice(-200))
  return m
}

export function removeMemory(id: string): Memory[] {
  return writeMemories(listMemories().filter((m) => m.id !== id))
}

export function clearMemories(): Memory[] {
  return writeMemories([])
}

// ---- connector credentials and tokens: encrypted like the sign-in ----

const connectorsPath = (): string => join(root(), 'connectors.bin')

export function readConnectorSecrets<T>(): T | null {
  if (!existsSync(connectorsPath())) return null
  try {
    return JSON.parse(safeStorage.decryptString(readFileSync(connectorsPath()))) as T
  } catch {
    return null
  }
}

export function writeConnectorSecrets(value: unknown): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS encryption is not available, so Plotter will not store connector sign-ins.')
  mkdirSync(root(), { recursive: true })
  writeAtomic(connectorsPath(), safeStorage.encryptString(JSON.stringify(value)))
}
