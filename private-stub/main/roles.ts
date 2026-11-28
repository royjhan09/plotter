import type { RoleEntity, RoleDraft, RoleIdentity, RoleTool, RoleWish } from '../../shared/api'

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
export const bumpRole = (_id: string, _used?: { input: number; output: number }): void => undefined
export const addWishes = (_id: string, _wishes: { tool: string; why: string }[], _from: RoleWish['from']): RoleEntity | undefined => undefined
export const grantWish = (_id: string, _tool: string, _give: boolean): RoleEntity => {
  throw new Error(OFF)
}
export const setRetired = (_id: string, _retired: boolean): RoleEntity => {
  throw new Error(OFF)
}
export const saveCombined = (_a: RoleEntity, _b: RoleEntity, _draft: RoleDraft): RoleEntity => {
  throw new Error(OFF)
}
export const recruiter = (): RoleEntity | undefined => undefined
