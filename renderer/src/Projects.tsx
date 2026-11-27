import { useEffect, useState } from 'react'
import { PROJECT_MEMORY_LIMIT, type ChatKind, type ChatSummary, type KitSummary, type Project } from '../../shared/api'
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
  toast
}: {
  project: Project
  chats: ChatSummary[]
  onClose: () => void
  onOpenChat: (id: string) => void
  onNewChat: (kind: ChatKind) => void
  onRemoveChat: (id: string) => void
  onDeleted: () => void
  toast: (m: string) => void
}): React.JSX.Element {
  const [name, setName] = useState(project.name)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [kits, setKits] = useState<KitSummary[]>([])
  useEffect(() => void api.kits.list().then(setKits, () => setKits([])), [])
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
        <button className="settings-back" onClick={onClose} title="Back to the chat (Esc)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5 8 12l7 7" />
          </svg>
          Back to chat
        </button>
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
