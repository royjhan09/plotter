import { ROLE_TOOL_INFO, type Chat, type HistoryItem, type RoleEntity, type TeamTurn } from '../shared/api'
import { getRole, listRoles } from '@private/main/roles'
import { getCompany, roleTeam } from '@private/main/company'
import { primaryModel, streamRound, toInput } from './openai'

/**
 * Team chats: several roles working on one purpose, talking to each other to get it done. ChatGPT is the
 * facilitator: after each message it picks who speaks next (and to whom), or stops when the work is done or
 * needs the user. Each member then replies as its role (assistant.ts, with asRole).
 */

/** One member as the facilitator and the other members see it: its job, its tools, and how it works with the others. */
export function memberLine(r: RoleEntity): string {
  const t = roleTeam(r)
  const team = t ? [t.manager ? `reports to ${t.manager.replace(/, who .*$/, '')}` : '', ...t.relations.map((x) => x.replace(/\byou\b/g, r.name).replace(/^You /, `${r.name} `))].filter(Boolean).join('; ') : ''
  const tools = r.tools.length ? r.tools.map((x) => ROLE_TOOL_INFO[x].label).join(', ') : 'none (it can write and review, but cannot run or test anything)'
  return `- ${r.name}: ${r.tagline || r.purpose.slice(0, 140)}${r.responsibilities.length ? ` Responsible for: ${r.responsibilities.slice(0, 5).join('; ')}.` : ''} Tools: ${tools}.${team ? ` (${team})` : ''}`
}

/**
 * The conversation, short, for the facilitator: code left out and each message cut to a few lines. Every message
 * is shortened the same way however old it is, so the text up to the newest message stays the same from turn to
 * turn (and can be cached); the newest message comes after it at more length.
 */
export function transcript(history: HistoryItem[], max = 30): { earlier: string; latest: string } {
  const name = (id?: string): string => (id ? (getRole(id)?.name ?? 'A member') : 'Assistant')
  const clean = (t: string): string =>
    t
      .replace(/\[\[tool:[^\]]+\]\]/g, '')
      .replace(/```[\s\S]*?(```|$)/g, (m) => `[code, ${m.split('\n').length} lines]`)
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  const line = (h: HistoryItem, keep: number): string => {
    const text = clean(h.text)
    return `### ${h.role === 'user' ? 'User' : name(h.speaker)}\n${text.length > keep ? `${text.slice(0, keep)}…` : text}`
  }
  const items = history.slice(-max)
  const last = items[items.length - 1]
  return { earlier: items.slice(0, -1).map((h) => line(h, 500)).join('\n\n'), latest: last ? line(last, 2500) : '' }
}

const FACILITATOR = `You run a team chat in the user's company: you never write the work yourself, you only decide who speaks next.
Read the purpose, the members (with their tools) and the conversation. Pick the member whose job fits the next step, and who they should address. Let members hand work to each other the way their relations say (who hands work to whom, who reviews whom, who reports to whom).
Stop (next: "done") when:
- the user's latest request is done: any review has signed it off, and the complete final version is in the chat as one piece (if fixes came only as changed lines, first ask the author to post the complete final version once, then stop),
- the team needs a decision or information only the user has,
- the next step needs something no member's tools can do (testing in a real browser, on a phone, with a screen reader…): say in "done" what the user should check,
- or members start repeating each other or passing the same request back and forth.
Answer with JSON only:
{"next": "<member name>" or "done", "to": "<member name>" or "you", "note": "what they should do now, one short line", "done": "when next is done: one line on why (finished, or what the user should do)"}`

async function askJson(instructions: string, text: string, tag: string, cacheKey?: string): Promise<Record<string, unknown>> {
  const model = await primaryModel()
  const effort = model.efforts.find((e) => e.effort === 'low')?.effort ?? model.defaultEffort
  let out = ''
  await streamRound(
    { model: model.slug, effort, instructions, input: [toInput({ role: 'user', text })], tools: [], verbosity: 'low', tag, ...(cacheKey ? { cacheKey } : {}) },
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
export async function nextSpeaker(chat: Chat, history: HistoryItem[], turnsLeft: number, tag = 'facilitator'): Promise<TeamTurn> {
  const members = (chat.team?.members ?? []).map((id) => getRole(id)).filter((r): r is RoleEntity => !!r)
  if (!members.length) return { speaker: null, done: 'This team chat has no members left.' }
  if (turnsLeft <= 0) return { speaker: null, done: 'The team has taken its turns for this message.' }
  const t = transcript(history)
  // what stays the same comes first (company, purpose, members, the earlier conversation), what changes last
  const j = await askJson(
    FACILITATOR,
    `Company: ${getCompany().name}\nPurpose of this chat: ${chat.team?.purpose ?? chat.title}\nMembers:\n${members.map(memberLine).join('\n')}\n\nThe conversation so far:\n${t.earlier || '(nothing yet)'}\n\nThe newest message:\n${t.latest}\n\nTurns left before the user is asked again: ${turnsLeft}`,
    tag,
    `team:${chat.id}:facilitator`
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
  // Claude Code roles work in their own chats, not in (ChatGPT) team chats
  const roles = listRoles().filter((r) => !r.retired && r.engine !== 'claude')
  if (!roles.length || !purpose.trim()) return []
  const j = await askJson(
    'You pick which of the user\'s roles should be in a team chat for a purpose: only those whose job the work needs (usually 2 to 4). Answer with JSON only: {"members": ["<role name>", ...]}',
    `Purpose: ${purpose}\nRoles:\n${roles.map(memberLine).join('\n')}`,
    'suggest-members'
  )
  const names = Array.isArray(j['members']) ? (j['members'] as unknown[]).map((x) => String(x).toLowerCase()) : []
  return roles.filter((r) => names.includes(r.name.toLowerCase())).map((r) => r.id)
}
