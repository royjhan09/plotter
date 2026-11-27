import { createContext, useContext } from 'react'
import type { RoleEntity } from '../../shared/api'

/** The roles you made, for anything that shows a role chat (its look, its name). Filled by App. */
export const RolesContext = createContext<RoleEntity[]>([])

export const useRole = (id: string | undefined): RoleEntity | undefined => {
  const roles = useContext(RolesContext)
  return id ? roles.find((r) => r.id === id) : undefined
}
