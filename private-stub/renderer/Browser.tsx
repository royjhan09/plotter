/** Public stand-in for the browser pane (in Plotter's private folder): switched off in this build. */
export const BROWSER = false

export interface BrowserAttach {
  attachments: import('../../shared/api').Attachment[]
  notes: string
  png: string
}

export function BrowserPane(_p: { onClose: () => void }): React.JSX.Element | null {
  return null
}

export function queueBrowserOpen(_url: string): void {}

export function BrowserIcon(): React.JSX.Element | null {
  return null
}
