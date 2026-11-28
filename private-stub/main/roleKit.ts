import type { RoleEntity, RoleIdea, RoleKit } from '../../shared/api'

/** Public stand-in for a role's own skills and tools (in Plotter's private folder): none in this build. */
const off = (): never => {
  throw new Error('Roles are not part of this build.')
}
export const roleKit = (_id: string): RoleKit => ({ skills: [], tools: [], good: [] })
export const linkRole = (_id: string, _kind: 'skill' | 'tool' | 'plugin', _ref: string, _on: boolean): RoleEntity => off()
export const linkSkillToRole = (_roleName: string, _skillId: string): boolean => false
export const addIdeas = (_id: string, _ideas: Omit<RoleIdea, 'at'>[]): RoleEntity => off()
export const adoptIdeas = (_id: string): RoleEntity => off()
export const dismissIdea = (_id: string, _name: string): RoleEntity => off()
