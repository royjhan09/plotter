import type { Company, RoleEntity, RoleLink } from '../../shared/api'

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
