import { app } from 'electron'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROJECT_MEMORY_LIMIT, type Chat, type Project } from '../shared/api'
import { getChat, listChats, writeAtomic } from './store'

/**
 * Projects: groups of chats (ChatGPT and Claude Code) with a small shared memory. The memory is a short
 * list of notes (decisions, facts, where things stand), capped so sending it with every message stays cheap.
 * Chats add notes themselves when something matters to the whole project; the user can edit them.
 */

const path = (): string => join(app.getPath('userData'), 'projects.json')

export function listProjects(): Project[] {
  try {
    return JSON.parse(readFileSync(path(), 'utf8')) as Project[]
  } catch {
    return []
  }
}

function write(list: Project[]): Project[] {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeAtomic(path(), JSON.stringify(list, null, 2))
  return list
}

const newId = (): string => Math.random().toString(36).slice(2, 10)

export const getProject = (id: string | undefined): Project | null => (id ? (listProjects().find((p) => p.id === id) ?? null) : null)

export function createProject(name: string): Project {
  const now = Date.now()
  const p: Project = { id: newId(), name: name.trim().slice(0, 80) || 'New project', notes: [], createdAt: now, updatedAt: now }
  write([...listProjects(), p])
  return p
}

export function renameProject(id: string, name: string): Project[] {
  const clean = name.trim().slice(0, 80)
  if (!clean) return listProjects()
  return write(listProjects().map((p) => (p.id === id ? { ...p, name: clean, updatedAt: Date.now() } : p)))
}

export function removeProject(id: string): Project[] {
  return write(listProjects().filter((p) => p.id !== id))
}

function update(id: string, change: (p: Project) => Project): Project {
  const list = listProjects()
  const i = list.findIndex((p) => p.id === id)
  if (i < 0) throw new Error('That project no longer exists.')
  const next = { ...change(list[i]!), updatedAt: Date.now() }
  list[i] = next
  write(list)
  return next
}

const memoryChars = (p: Project): number => p.notes.reduce((n, x) => n + x.text.length, 0)

/** Adds a note to the shared memory; refuses (with the reason) when the memory is full. */
export function addNote(id: string, text: string, by: string): Project {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (!clean) throw new Error('The note is empty.')
  if (clean.length > PROJECT_MEMORY_LIMIT.noteChars) throw new Error(`Keep a note under ${PROJECT_MEMORY_LIMIT.noteChars} characters.`)
  return update(id, (p) => {
    if (p.notes.length >= PROJECT_MEMORY_LIMIT.notes || memoryChars(p) + clean.length > PROJECT_MEMORY_LIMIT.chars)
      throw new Error('The shared memory is full. Replace or forget an old note first.')
    if (p.notes.some((n) => n.text.toLowerCase() === clean.toLowerCase())) return p
    return { ...p, notes: [...p.notes, { id: newId(), text: clean, by, at: Date.now() }] }
  })
}

export function editNote(id: string, noteId: string, text: string): Project {
  const clean = text.trim().replace(/\s+/g, ' ').slice(0, PROJECT_MEMORY_LIMIT.noteChars)
  if (!clean) return removeNote(id, noteId)
  return update(id, (p) => ({ ...p, notes: p.notes.map((n) => (n.id === noteId ? { ...n, text: clean, at: Date.now() } : n)) }))
}

export function removeNote(id: string, noteId: string): Project {
  return update(id, (p) => ({ ...p, notes: p.notes.filter((n) => n.id !== noteId) }))
}

/** The project as a chat sees it: its name, the other chats in it, and the shared memory (with note ids). */
export function projectContext(chat: Pick<Chat, 'id' | 'projectId'>): { project: Project; text: string } | null {
  const project = getProject(chat.projectId)
  if (!project) return null
  const others = listChats()
    .filter((c) => c.projectId === project.id && c.id !== chat.id && !c.archived)
    .slice(0, 12)
    .map((c) => `- ${c.kind === 'claude' ? 'Claude Code' : 'ChatGPT'}: ${c.title}`)
  const notes = project.notes.map((n) => `- [${n.id}] ${n.text}`)
  const text = [
    `This chat is part of the project "${project.name}".`,
    others.length ? `Other chats in it:\n${others.join('\n')}` : 'It is the only chat in the project so far.',
    notes.length ? `Shared project memory (every chat in the project sees it; [id] note):\n${notes.join('\n')}` : 'The shared project memory is empty.'
  ].join('\n')
  return { project, text }
}

/** A short digest of a chat for another chat: its title and its last few turns, clipped. */
export function chatDigest(chatId: string | null, turns = 6, clip = 700): string {
  const chat = chatId ? getChat(chatId) : null
  if (!chat) return 'The chat beside it is new: nothing has been said there yet.'
  const msgs = chat.messages.filter((m) => m.text.trim() || m.from).slice(-turns)
  const lines = msgs.map((m) => {
    const who = m.role === 'user' ? (m.from?.kind === 'side' ? `Sent over from the ${m.from.sender === 'claude' ? 'Claude Code' : 'ChatGPT'} chat` : 'User') : chat.kind === 'claude' ? 'Claude Code' : 'ChatGPT'
    const body = `${m.text}${m.from ? `\n[attached: ${m.from.text}]` : ''}`.replace(/```(ui|chart|mermaid)[\s\S]*?```/g, '[a $1 visual]').trim()
    return `${who}: ${body.length > clip ? `${body.slice(0, clip)}…` : body}`
  })
  return `"${chat.title}" (${chat.kind === 'claude' ? 'Claude Code' : 'ChatGPT'}, ${chat.messages.length} messages). Its last turns:\n${lines.join('\n\n') || '(nothing yet)'}`
}
