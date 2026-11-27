import type { Company, RoleEntity } from '../../shared/api'

/** Public stand-in for the company page (in Plotter's private folder): none. */
export const COMPANY = false

const NONE: Company = { name: 'My company', reportsTo: {}, updatedAt: 0 }
export const getCompany = (): Company => NONE
export const renameCompany = (_name: string): Company => NONE
export const placeRole = (_roleId: string, _reportsTo: string | null): Company => NONE
export const roleTeam = (_role: RoleEntity): { manager?: string; reports: string[] } | null => null
