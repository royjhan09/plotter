/** Public stand-in for chats using the browser pane (in Plotter's private folder): none. */
export interface BrowserTabState {
  webContentsId: number | null
  url: string
  title: string
}
export interface BrowserToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
  label: (args: Record<string, unknown>) => string
  run: (args: Record<string, unknown>, who: string) => Promise<{ text: string; image?: string }>
}

export const BROWSER_GUIDE = ''
export function setBrowserState(_s: { open: boolean; active: number | null; tabs: BrowserTabState[] }): void {}
export function setBrowserEmitter(_fn: (channel: string, payload: unknown) => void): void {}
export const browserToolSpecs = (): BrowserToolSpec[] => []
export async function runBrowserTool(_name: string, _args: Record<string, unknown>, _who: string): Promise<{ text: string; image?: string }> {
  return { text: 'The browser pane is not part of this build.' }
}
