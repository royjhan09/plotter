import { createContext } from 'react'

/** The chat a reply is shown in: its project picks the design kit that fills in kit tags in previews. */
export const KitScope = createContext<{ projectId?: string | null; chatTitle?: string }>({})
