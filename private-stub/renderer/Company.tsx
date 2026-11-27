import type { ChatSummary, Project } from '../../shared/api'

/** Public stand-in for the company page (in Plotter's private folder): switched off. */
export const COMPANY = false

export function Company(_p: { projects: Project[]; chats: ChatSummary[]; onClose: () => void; onOpenProject: (id: string) => void; onStartChat: (roleId: string) => void; onOpenRoles: () => void }): React.JSX.Element | null {
  return null
}
