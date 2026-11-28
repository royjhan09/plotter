import type { Company, RoleEntity, RoleLink, RoleMergeTradeoff } from '../../shared/api'

/** Public stand-in for the company page (in Plotter's private folder): none. */
export const COMPANY = false

const NONE: Company = { name: 'My company', reportsTo: {}, updatedAt: 0 }
export const getCompany = (): Company => NONE
export const renameCompany = (_name: string): Company => NONE
export const placeRole = (_roleId: string, _reportsTo: string | null): Company => NONE
export const labelLine = (_roleId: string, _label: string): Company => NONE
export const linkRoles = (_input: Omit<RoleLink, 'id'>): Company => NONE
export const unlinkRoles = (_id: string): Company => NONE
export const linkWords = (l: RoleLink): string => l.label ?? ''
export const roleTeam = (_role: RoleEntity): { manager?: string; reports: string[]; relations: string[] } | null => null
export const replaceInChart = (_a: string, _b: string, _merged: string): Company => NONE
export const mergeTradeoff = (_a: RoleEntity, _b: RoleEntity, _draft: Pick<RoleEntity, 'name' | 'tagline' | 'purpose' | 'responsibilities' | 'boundaries' | 'style' | 'tools'>): RoleMergeTradeoff => ({
  setupTokens: { a: 0, b: 0, merged: 0 },
  replyTokens: { a: 0, b: 0, measured: false },
  handoffTokens: 0,
  responsibilities: 0,
  tools: 0,
  warnings: []
})
