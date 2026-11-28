/** Public stand-in for roles (in Plotter's private folder): switched off. */
export const ROLES = false

export function Roles(_p: { onClose: () => void; onStartChat: (roleId: string) => void; onTryInChat?: (text: string) => void; onOpenMarket?: (open: { popularId?: string; query?: string }) => void }): React.JSX.Element | null {
  return null
}
