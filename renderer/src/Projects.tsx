import { useContext, useEffect, useState } from 'react'
import { PROJECT_MEMORY_LIMIT, ROLE_TOOL_INFO, type ChatKind, type ChatSummary, type KitSummary, type BrandSummary, type Project, type RecruitPick, type RoleDeployment, type RoleEntity, type RoleTool } from '../../shared/api'
import { RoleBot } from '@private/renderer/RoleBot'
import { ROLES } from '@private/renderer/Roles'
import { RolesContext } from './roles'
import { ClaudeBuddy } from './ClaudeBuddy'
import { CLAUDE_CODE } from '@private/renderer/ClaudeCode'
import icon from '../../assets/sprout.svg'

const api = window.plotter

/** A project: a folder with a small sprout. */
export const ProjectIcon = ({ size = 16 }: { size?: number }): React.JSX.Element => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6l2 2.2h7.4A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z" />
    <path d="M12 17v-4.5M12 12.5c0-1.6 1.2-2.6 2.8-2.6 0 1.6-1.2 2.6-2.8 2.6ZM12 14c0-1.3-1-2.1-2.3-2.1 0 1.3 1 2.1 2.3 2.1Z" />
  </svg>
)

const when = (t: number): string => {
  const d = (Date.now() - t) / 1000
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.round(d / 60)} min ago`
  if (d < 86400) return `${Math.round(d / 3600)} h ago`
  return new Date(t).toLocaleDateString()
}

/**
 * A project's page: its chats (ChatGPT and Claude Code), new chats in it, and the shared memory every chat
 * in it sees. The memory is small on purpose; the chats add notes themselves, and you can edit them here.
 */
export function ProjectPage({
  project,
  chats,
  onClose,
  onOpenChat,
  onNewChat,
  onRemoveChat,
  onDeleted,
  onRoleChat,
  toast
}: {
  project: Project
  chats: ChatSummary[]
  onClose: () => void
  onOpenChat: (id: string) => void
  onNewChat: (kind: ChatKind) => void
  onRemoveChat: (id: string) => void
  onDeleted: () => void
  /** A chat with a role, in this project (with this project's tool picks and notes for it). */
  onRoleChat?: (roleId: string) => void
  toast: (m: string) => void
}): React.JSX.Element {
  const [name, setName] = useState(project.name)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [kits, setKits] = useState<KitSummary[]>([])
  useEffect(() => void api.kits.list().then(setKits, () => setKits([])), [])
  const [brands, setBrands] = useState<BrandSummary[]>([])
  useEffect(() => void api.brands.list().then(setBrands, () => setBrands([])), [])
  useEffect(() => setName(project.name), [project.name])
  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) onClose()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const inProject = chats.filter((c) => c.projectId === project.id && !c.archived)
  const used = project.notes.reduce((n, x) => n + x.text.length, 0)
  const full = project.notes.length >= PROJECT_MEMORY_LIMIT.notes || used >= PROJECT_MEMORY_LIMIT.chars
  const fail = (e: unknown): void => toast((e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))

  const add = async (): Promise<void> => {
    if (!draft.trim()) return
    try {
      await api.projects.addNote(project.id, draft)
      setDraft('')
    } catch (e) {
      fail(e)
    }
  }

  return (
    <div className="market-page project-page">
      <div className="market-inner project-inner">
      <header className="market-head">
        <div className="project-title-row">
          <span className="project-page-icon">
            <ProjectIcon size={24} />
          </span>
          <input
            className="project-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name.trim() !== project.name && void api.projects.rename(project.id, name)}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
            aria-label="Project name"
            title="Click to rename"
          />
        </div>
      </header>

      <div className="project-body">
        <section className="project-section">
          <div className="project-section-head">
            <h3>Chats</h3>
            <div className="project-new">
              <button className="btn small" onClick={() => onNewChat('chatgpt')}>
                <img src={icon} alt="" width={16} height={16} /> New chat
              </button>
              {CLAUDE_CODE && (
                <button className="btn small" onClick={() => onNewChat('claude')}>
                  <ClaudeBuddy size={16} /> New Claude Code chat
                </button>
              )}
            </div>
          </div>
          {inProject.length === 0 ? (
            <p className="project-empty">No chats yet. Start one here, or move a chat in from the chat list (its ⋯ menu, or drag it onto the project).</p>
          ) : (
            <div className="project-chats">
              {inProject.map((c) => (
                <div key={c.id} className="project-chat" onClick={() => onOpenChat(c.id)}>
                  <span className="chat-kind">{c.kind === 'claude' ? <ClaudeBuddy size={18} /> : <img src={icon} alt="" />}</span>
                  <span className="project-chat-title">{c.title}</span>
                  <span className="project-chat-when">{when(c.updatedAt)}</span>
                  <button
                    className="row-btn"
                    title="Take out of the project"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveChat(c.id)
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {ROLES && <ProjectRoles project={project} onChat={onRoleChat} />}

        <section className="project-section">
          <div className="project-section-head">
            <h3>Shared memory</h3>
            <span className={`project-meter ${full ? 'full' : ''}`} title="Kept small so it stays cheap to send with every message">
              {project.notes.length}/{PROJECT_MEMORY_LIMIT.notes} notes · {used.toLocaleString()}/{PROJECT_MEMORY_LIMIT.chars.toLocaleString()} characters
            </span>
          </div>
          <p className="project-lead">
            Every chat in the project sees these notes. The chats save the decisions and facts the others need; add, edit or remove any of them here.
          </p>
          {project.notes.length === 0 && <p className="project-empty">Nothing yet. Notes appear as the chats decide things.</p>}
          <ul className="project-notes">
            {project.notes.map((n) => (
              <li key={n.id} className="project-note">
                {editing?.id === n.id ? (
                  <textarea
                    autoFocus
                    value={editing.text}
                    maxLength={PROJECT_MEMORY_LIMIT.noteChars}
                    onChange={(e) => setEditing({ id: n.id, text: e.target.value })}
                    onBlur={() => {
                      if (editing.text.trim() !== n.text) void api.projects.editNote(project.id, n.id, editing.text).catch(fail)
                      setEditing(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) (e.currentTarget as HTMLTextAreaElement).blur()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                  />
                ) : (
                  <span className="project-note-text" onClick={() => setEditing({ id: n.id, text: n.text })} title="Click to edit">
                    {n.text}
                  </span>
                )}
                <span className="project-note-by">
                  {n.by} · {when(n.at)}
                </span>
                <button className="row-btn" title="Remove" onClick={() => void api.projects.removeNote(project.id, n.id).catch(fail)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="project-add">
            <input
              value={draft}
              maxLength={PROJECT_MEMORY_LIMIT.noteChars}
              placeholder={full ? 'The memory is full: remove a note first' : 'Add a note every chat should know…'}
              disabled={full}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void add()}
            />
            <button className="btn small primary" disabled={full || !draft.trim()} onClick={() => void add()}>
              Add
            </button>
          </div>
        </section>

        {kits.length > 0 && (
          <section className="project-section">
            <div className="project-section-head">
              <h3>Design kit</h3>
              <select
                className="setting-select"
                value={project.kitId ?? ''}
                onChange={(e) => void api.projects.setKit(project.id, e.target.value || null).catch(fail)}
              >
                <option value="">Default ({kits.find((k) => k.isDefault)?.name ?? 'none'})</option>
                {kits.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="project-lead">The rules and components this project’s chats build with.</p>
          </section>
        )}

        {brands.length > 0 && (
          <section className="project-section">
            <div className="project-section-head">
              <h3>Brand</h3>
              <select className="setting-select" value={project.brandId ?? ''} onChange={(e) => void api.projects.setBrand(project.id, e.target.value || null).catch(fail)}>
                <option value="">Default ({brands.find((b) => b.isDefault)?.name ?? 'none'})</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
                <option value="none">None: the app picks its own look</option>
              </select>
            </div>
            <p className="project-lead">The colours, type and logo this project’s apps use.</p>
          </section>
        )}

        <section className="project-section danger-zone">
          {confirmDelete ? (
            <div className="project-delete-confirm">
              <span>Delete “{project.name}” and its shared memory? Its chats stay, outside any project.</span>
              <button className="btn small" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button
                className="btn small danger"
                onClick={() =>
                  void api.projects
                    .remove(project.id)
                    .then(onDeleted)
                    .catch(fail)
                }
              >
                Delete project
              </button>
            </div>
          ) : (
            <button className="link danger" onClick={() => setConfirmDelete(true)}>
              Delete project
            </button>
          )}
        </section>
      </div>
      </div>
    </div>
  )
}

/**
 * The roles working in a project: each a generic role (made once on the Roles page) with this project's own picks:
 * which of its usual tools it uses here, and notes on what is different here.
 */
function ProjectRoles({ project, onChat }: { project: Project; onChat?: (roleId: string) => void }): React.JSX.Element {
  const roles = useContext(RolesContext).filter((r) => !r.retired)
  const [open, setOpen] = useState<string | null>(null)
  const deployed = (project.roles ?? []).map((d) => ({ d, role: roles.find((r) => r.id === d.roleId) })).filter((x): x is { d: RoleDeployment; role: RoleEntity } => !!x.role)
  const free = roles.filter((r) => !deployed.some((x) => x.role.id === r.id))
  const save = (d: RoleDeployment): void => void api.projects.setRole(project.id, d)
  return (
    <section className="project-section">
      <Recruiter project={project} />
      <div className="project-section-head">
        <h3>Roles</h3>
        {free.length > 0 && (
          <select
            className="project-role-add"
            value=""
            onChange={(e) => {
              const r = roles.find((x) => x.id === e.target.value)
              if (!r) return
              save({ roleId: r.id, tools: r.tools })
              setOpen(r.id)
            }}
            aria-label="Add a role to this project"
          >
            <option value="">+ Add a role</option>
            {free.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {deployed.length === 0 ? (
        <p className="project-empty">{roles.length ? 'Add a role to work here: it keeps its job, and this project picks its tools and adds its own notes.' : 'Make roles on the Roles page, then add them here.'}</p>
      ) : (
        <div className="project-roles">
          {deployed.map(({ d, role }) => {
            const options = [...new Set([...(role.toolOptions ?? []), ...role.tools])] as RoleTool[]
            const changed = d.tools.join() !== role.tools.join() || !!d.notes
            return (
              <div key={role.id} className={`project-role ${open === role.id ? 'open' : ''}`}>
                <div className="project-role-head">
                  <span className="project-role-bot" style={{ ['--role' as string]: role.identity.color }}>
                    <RoleBot identity={role.identity} replies={role.replies} size={30} />
                  </span>
                  <span className="project-role-name">
                    <b>{role.name}</b>
                    <span>{role.engine === 'claude' ? 'Claude Code' : d.tools.length ? d.tools.map((t) => ROLE_TOOL_INFO[t].label).join(', ') : 'No tools'}{changed ? ' · adjusted for this project' : ''}</span>
                  </span>
                  {onChat && (
                    <button className="btn small primary" onClick={() => onChat(role.id)}>
                      Chat
                    </button>
                  )}
                  <button className="link" onClick={() => setOpen(open === role.id ? null : role.id)}>
                    {open === role.id ? 'Done' : 'Adjust'}
                  </button>
                </div>
                {open === role.id && (
                  <div className="project-role-body">
                    {role.engine !== 'claude' && (
                      <div className="kit-field">
                        <span>Tools here (from what this job usually uses)</span>
                        <div className="role-tool-pick">
                          {options.map((t) => (
                            <button key={t} className={d.tools.includes(t) ? 'on' : ''} title={ROLE_TOOL_INFO[t].hint} onClick={() => save({ ...d, tools: d.tools.includes(t) ? d.tools.filter((x) => x !== t) : [...d.tools, t] })}>
                              {ROLE_TOOL_INFO[t].label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <label className="kit-field">
                      <span>In this project</span>
                      <textarea
                        rows={2}
                        defaultValue={d.notes ?? ''}
                        placeholder="What is different here: tone, audience, conventions…"
                        onBlur={(e) => e.target.value !== (d.notes ?? '') && save({ ...d, notes: e.target.value })}
                      />
                    </label>
                    <button className="link danger-text" onClick={() => void api.projects.removeRole(project.id, role.id)}>
                      Take out of this project
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

/** The Recruiter's suggested team for the project: each role reused or new, with this project's tools and skills. */
function Recruiter({ project }: { project: Project }): React.JSX.Element | null {
  const roles = useContext(RolesContext)
  const hr = roles.find((r) => r.builtin === 'recruiter')
  const [busy, setBusy] = useState<number | 'all' | 'ask' | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!hr) return null
  const rec = project.recruit
  const run = async (what: number | 'all' | 'ask', job: () => Promise<unknown>): Promise<void> => {
    setBusy(what)
    setError(null)
    try {
      await job()
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    } finally {
      setBusy(null)
    }
  }
  const working = (p: RecruitPick): boolean => !!p.roleId && !!project.roles?.some((r) => r.roleId === p.roleId)
  const open = (rec?.picks ?? []).map((p, i) => ({ p, i })).filter((x) => !x.p.added && !working(x.p))
  const ask = (): void => void run('ask', () => api.projects.recruit(project.id))
  return (
    <div className="recruit">
      <div className="recruit-head">
        <span className="recruit-bot" style={{ ['--role' as string]: hr.identity.color }}>
          <RoleBot identity={hr.identity} replies={hr.replies} size={30} working={!!rec?.pending || busy === 'ask'} />
        </span>
        <span className="recruit-title">
          <b>Recruiter</b>
          <span>
            {rec?.pending || busy === 'ask'
              ? 'Looking at what this project needs…'
              : rec?.error
                ? `Could not suggest a team: ${rec.error}`
                : rec?.summary || (rec ? 'Suggested team' : 'Suggests the roles this project needs, with their tools and skills.')}
          </span>
        </span>
        {!rec?.pending && (
          <button className="link" disabled={busy !== null} onClick={ask}>
            {rec ? 'Ask again' : 'Suggest a team'}
          </button>
        )}
      </div>
      {!rec?.pending && rec && rec.picks.length > 0 && (
        <div className="recruit-picks">
          {rec.picks.map((p, i) => {
            const mine = p.roleId ? roles.find((r) => r.id === p.roleId) : undefined
            const identity = mine?.identity ?? p.draft?.identity
            return (
              <div key={i} className={`recruit-pick ${p.added || working(p) ? 'added' : ''}`}>
                <span className="project-role-bot" style={{ ['--role' as string]: identity?.color ?? '#e8590c' }}>
                  {identity && <RoleBot identity={identity} replies={mine?.replies ?? 0} size={28} />}
                </span>
                <span className="recruit-pick-body">
                  <span className="recruit-pick-name">
                    <b>{p.name}</b>
                    <span className={`recruit-tag ${mine ? 'yours' : 'new'}`}>{mine ? 'your role' : 'new role'}</span>
                    {p.engine === 'claude' && <span className="recruit-tag">Claude Code</span>}
                  </span>
                  <span className="recruit-why">{p.why}</span>
                  <span className="role-tools">
                    {p.engine !== 'claude' && (p.tools.length ? p.tools.map((t) => <span key={t}>{ROLE_TOOL_INFO[t].label}</span>) : <span>No tools</span>)}
                    {p.skills.map((k) => (
                      <span key={k} className="recruit-skill">
                        {k}
                      </span>
                    ))}
                  </span>
                </span>
                {p.added || working(p) ? (
                  <span className="recruit-added">{p.added ? 'Added' : 'In this project'}</span>
                ) : (
                  <button className="btn small" disabled={busy !== null} onClick={() => void run(i, () => api.projects.hire(project.id, i))}>
                    {busy === i ? 'Adding…' : 'Add to project'}
                  </button>
                )}
              </div>
            )
          })}
          {open.length > 1 && (
            <button
              className="btn small primary recruit-all"
              disabled={busy !== null}
              onClick={() =>
                void run('all', async () => {
                  for (const { i } of open) await api.projects.hire(project.id, i)
                })
              }
            >
              {busy === 'all' ? 'Adding…' : `Add all ${open.length}`}
            </button>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
