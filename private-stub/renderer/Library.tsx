import type { Attachment } from '../../shared/api'

/** Public stand-in for "Import from library" (in Plotter's private folder): switched off. */
export const LIBRARY = false

export function LibraryPicker(_p: { onPick: (a: Attachment) => void; onClose: () => void }): React.JSX.Element | null {
  return null
}
