import type { Chat, HistoryItem, RoleEntity, TeamTurn } from '../shared/api'
import { getRole, listRoles } from '@private/main/roles'
import { getCompany, roleTeam } from '@private/main/company'
import { primaryModel, streamRound, toInput } from './openai'

/**
 * Team chats: several roles working on one purpose, talking to each other to get it done. ChatGPT is the
 * facilitator: after each message it picks who speaks next (and to whom), or stops when the work is done or
 * needs the user. Each member then replies as its role (assistant.ts, with asRole).
 */

/** One member as the facilitator and the other members see it. */
export function memberLine(r: RoleEntity): string {
  const t = roleTeam(r)
  const team = t ? [t.manager ? `reports to ${t.manager.replace(/, who .*$/, '')}` : '', ...t.relations.map((x) => x.replace(/\byou\b/g, r.name).replace(/^You /, `${r.name} `))].filter(Boolean).join('; ') : ''
  return `- ${r.name}: ${r.tagline || r.purpose.slice(0, 140)}${r.responsibilities.length ? ` Responsible for: ${r.responsibilities.slice(0, 5).join('; ')}.` : ''}${team ? ` (${team})` : ''}`
}

/** The conversation as one text, each message with who wrote it (the newest kept whole, older ones cut short). */
export function transcript(history: HistoryItem[], max = 24): string {
  const name = (id?: string): string => (id ? (getRole(id)?.name ?? 'A member') : 'Assistant')
  const items = history.slice(-max)
  return items
    .map((h, i) => {
      const who = h.role === 'user' ? 'User' : name(h.speaker)
      const text = h.text.replace(/\[\[tool:[^\]]+\]\]/g, '').trim()
      const keep = i >= items.length - 4 ? 4000 : 900
      return `### ${who}\n${text.length > keep ? `${text.slice(0, keep)}…` : text}`
    })
    .join('\n\n')
}

const FACILITATOR = `You run a team chat in the user's company: you never write the work yourself, you only decide who speaks next.
Read the purpose, the members and the conversation. Pick the member whose job fits the next step, and who they should address. Let members hand work to each other the way their relations say (who hands work to whom, who reviews whom, who reports to whom). Stop when the user's latest request is done (someone has given the finished result), when the team needs a decision or information only the user has, or when members start repeating each other.
Answer with JSON only:
{"next": "<member name>" or "done", "to": "<member name>" or "you", "note": "what they should do now, one short line", "done": "when next is done: one line on why (finished, or the question for the user)"}`

async function askJson(instructions: string, text: string, tag: string): Promise<Record<string, unknown>> {
  const model = await primaryModel()
  const effort = model.efforts.find((e) => e.effort === 'low')?.effort ?? model.defaultEffort
  let out = ''
  await streamRound(
    { model: model.slug, effort, instructions, input: [toInput({ role: 'user', text })], tools: [], verbosity: 'low', tag },
    { onDelta: (t) => (out += t), onActivity: () => undefined, onSource: () => undefined },
    AbortSignal.timeout(90_000)
  )
  try {
    return JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Who speaks next (the facilitator's pick), or that the team is done for now. */
export async function nextSpeaker(chat: Chat, history: HistoryItem[], turnsLeft: number): Promise<TeamTurn> {
  const members = (chat.team?.members ?? []).map((id) => getRole(id)).filter((r): r is RoleEntity => !!r)
  if (!members.length) return { speaker: null, done: 'This team chat has no members left.' }
  if (turnsLeft <= 0) return { speaker: null, done: 'The team has taken its turns for this message.' }
  const j = await askJson(
    FACILITATOR,
    `Company: ${getCompany().name}\nPurpose of this chat: ${chat.team?.purpose ?? chat.title}\nMembers:\n${members.map(memberLine).join('\n')}\nTurns left before the user is asked again: ${turnsLeft}\n\nThe conversation:\n${transcript(history)}`,
    'facilitator'
  )
  const pick = String(j['next'] ?? '').trim().toLowerCase()
  const who = members.find((m) => m.name.toLowerCase() === pick) ?? members.find((m) => pick && (pick.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(pick)))
  if (!who || pick === 'done') return { speaker: null, done: String(j['done'] ?? '').trim() || undefined }
  const to = String(j['to'] ?? '').trim()
  const toMember = members.find((m) => m.name.toLowerCase() === to.toLowerCase())
  return { speaker: who.id, to: toMember && toMember.id !== who.id ? toMember.name : 'you', ...(j['note'] ? { note: String(j['note']).slice(0, 300) } : {}) }
}

/** The roles a purpose needs, picked by ChatGPT from the ones the user made. */
export async function suggestMembers(purpose: string): Promise<string[]> {
  const roles = listRoles()
  if (!roles.length || !purpose.trim()) return []
  const j = await askJson(
    'You pick which of the user\'s roles should be in a team chat for a purpose: only those whose job the work needs (usually 2 to 4). Answer with JSON only: {"members": ["<role name>", ...]}',
    `Purpose: ${purpose}\nRoles:\n${roles.map(memberLine).join('\n')}`,
    'suggest-members'
  )
  const names = Array.isArray(j['members']) ? (j['members'] as unknown[]).map((x) => String(x).toLowerCase()) : []
  return roles.filter((r) => names.includes(r.name.toLowerCase())).map((r) => r.id)
}
