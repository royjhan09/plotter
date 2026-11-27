import type { RoleIdentity } from '../../shared/api'
import { SproutBot } from '../../renderer/src/SproutBot'

/** Public stand-in for a role's own look (in Plotter's private folder): the plain sprout-bot. */
export const ROLE_BOTS = false

export function RoleBot({ size = 84, working = false, className = '' }: { identity: RoleIdentity; replies?: number; size?: number; working?: boolean; className?: string; crop?: 'hat' | 'eyes' | 'neck' | 'hand' }): React.JSX.Element {
  return <SproutBot size={size} working={working} className={className} />
}
