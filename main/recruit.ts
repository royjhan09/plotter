import type { Project, RecruitPick, RoleDraft, RoleTool } from '../shared/api'
import { ROLE_TOOL_INFO } from '../shared/api'
import { ROLES, bumpRole, cleanDraft, listRoles, recruiter, saveRole } from '@private/main/roles'
import { addIdeas, adoptIdeas, roleKit } from '@private/main/roleKit'
import { listChats } from './store'
import { getProject, setProjectRole, setRecruit } from './projects'
import { projectsChanged } from './appEvents'
import { recruitTeam } from './openai'

/**
 * The Recruiter (HR): when a project is made (and has a name to go on), it suggests the team the project needs:
 * the user's roles where they fit, new roles where none does, each with the tools to use there and the skills it
 * needs. One small ChatGPT call per project; the suggestion is kept with the project until asked again.
 */
const isTool = (t: unknown): t is RoleTool => typeof t === 'string' && t in ROLE_TOOL_INFO
const strs = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, max) : [])

/** Whether a project has enough to go on: a name of its own, or notes or chats. */
export function worthRecruiting(p: Project): boolean {
  return ROLES && (p.name.trim().toLowerCase() !== 'new project' || p.notes.length > 0 || listChats().some((c) => c.projectId === p.id))
}

export async function runRecruit(projectId: string): Promise<Project | null> {
  const p = getProject(projectId)
  if (!p || !ROLES) return p
  setRecruit(projectId, (r) => ({ at: Date.now(), pending: true, picks: r?.picks ?? [] }))
  projectsChanged()
  const roles = listRoles().filter((r) => !r.retired && !r.builtin)
  try {
    const out = await recruitTeam({
      project: p.name,
      notes: p.notes.map((n) => n.text).slice(0, 20),
      chats: listChats()
        .filter((c) => c.projectId === p.id)
        .map((c) => c.title)
        .slice(0, 12),
      // each role's own skills and apps, so it picks only the part this project needs
      roles: roles.map((r) => {
        const kit = roleKit(r.id)
        return { name: r.name, engine: r.engine ?? 'chatgpt', tagline: r.tagline, tools: r.tools, toolOptions: r.toolOptions ?? r.tools, skills: kit.skills.map((s) => s.name).slice(0, 20), apps: kit.tools.map((t) => t.plugin ?? t.name).filter((x, i, a) => a.indexOf(x) === i).slice(0, 20) }
      })
    })
    const picks: RecruitPick[] = out.roles.map((x) => {
      const existing = String(x['existing'] ?? '').trim().toLowerCase()
      const mine = existing && existing !== 'null' ? roles.find((r) => r.name.toLowerCase() === existing) : undefined
      const engine = x['engine'] === 'claude' ? 'claude' : 'chatgpt'
      const tools = (Array.isArray(x['tools']) ? (x['tools'] as unknown[]) : []).filter(isTool)
      const pick: RecruitPick = { name: mine?.name ?? String(x['name'] ?? '').trim(), why: String(x['why'] ?? '').trim(), engine: mine?.engine ?? engine, tools, skills: strs(x['skills'], 4) }
      if (mine) {
        // its own skills and tools that this project needs, by name back to id (an app is a plugin's or a tool's name)
        const kit = roleKit(mine.id)
        const names = (k: string): string[] => strs(x[k], 20).map((n) => n.toLowerCase())
        const useSkills = kit.skills.filter((s) => names('use_skills').includes(s.name.toLowerCase())).map((s) => s.id)
        const useTools = kit.tools.filter((t) => names('use_apps').includes((t.plugin ?? t.name).toLowerCase()) || names('use_apps').includes(t.name.toLowerCase())).map((t) => t.id)
        return { ...pick, roleId: mine.id, ...(kit.skills.length ? { useSkills } : {}), ...(kit.tools.length ? { useTools } : {}) }
      }
      const n = (x['new'] && typeof x['new'] === 'object' ? x['new'] : {}) as Record<string, unknown>
      const draft: RoleDraft = cleanDraft({
        name: pick.name,
        tagline: String(n['tagline'] ?? pick.why),
        purpose: String(n['purpose'] ?? pick.why),
        responsibilities: strs(n['responsibilities'], 8),
        tools,
        toolOptions: (Array.isArray(n['toolOptions']) ? (n['toolOptions'] as unknown[]) : []).filter(isTool),
        engine,
        identity: (n['identity'] ?? {}) as RoleDraft['identity']
      })
      return { ...pick, draft }
    })
    const saved = setRecruit(projectId, { at: Date.now(), summary: out.summary, picks: picks.filter((x) => x.name) })
    const hr = recruiter()
    if (hr) bumpRole(hr.id)
    projectsChanged()
    return saved
  } catch (e) {
    const saved = setRecruit(projectId, { at: Date.now(), picks: [], error: e instanceof Error ? e.message : String(e) })
    projectsChanged()
    return saved
  }
}

/** Puts one pick to work in the project: the role (made first if it is new) with these tools, its skills as notes. */
export function hire(projectId: string, index: number): Project {
  const p = getProject(projectId)
  const pick = p?.recruit?.picks[index]
  if (!p || !pick) throw new Error('That suggestion is gone. Ask the Recruiter again.')
  let roleId = pick.roleId
  if (!roleId) {
    if (!pick.draft) throw new Error('That suggestion has no role to create.')
    roleId = saveRole(pick.draft).id
  }
  // the part of its own skills and tools this project needs; what it lacks becomes notes here and ideas for the role
  setProjectRole(projectId, {
    roleId,
    tools: pick.tools,
    ...(pick.useSkills ? { skillIds: pick.useSkills } : {}),
    ...(pick.useTools ? { marketIds: pick.useTools } : {}),
    ...(pick.skills.length ? { notes: `Skills needed here: ${pick.skills.join('; ')}.` } : {})
  })
  if (pick.skills.length) {
    addIdeas(roleId, pick.skills.map((s) => ({ kind: 'skill' as const, name: s, why: `Needed in the project "${p.name}".` })))
    adoptIdeas(roleId)
  }
  const saved = setRecruit(projectId, (r) => (r ? { ...r, picks: r.picks.map((x, i) => (i === index ? { ...x, roleId, added: true } : x)) } : r))!
  projectsChanged()
  return saved
}
