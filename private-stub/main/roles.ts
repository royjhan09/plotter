import type { RoleEntity, RoleDraft, RoleIdentity, RoleTool } from '../../shared/api'

/** Public stand-in for roles (in Plotter's private folder): none. */
export const ROLES = false

export const ROLE_TOOLS: RoleTool[] = []
const OFF = 'Roles are not part of this build.'
export const listRoles = (): RoleEntity[] => []
export const getRole = (_id: string | undefined): RoleEntity | undefined => undefined
export const cleanIdentity = (_i: Partial<RoleIdentity> | undefined): RoleIdentity => ({ color: '#e8590c', hat: 'none', eyes: 'none', neck: 'none', hand: 'none' })
export const cleanDraft = (_d: Partial<RoleDraft>): RoleDraft => {
  throw new Error(OFF)
}
export const saveRole = (_input: RoleDraft & { id?: string }): RoleEntity => {
  throw new Error(OFF)
}
export const removeRole = (_id: string): RoleEntity[] => []
export const bumpRole = (_id: string): void => undefined
