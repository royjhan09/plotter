import type { BrowserWindow } from 'electron'

/** Public stand-in for the browser pane (in Plotter's private folder): switched off. */
export const BROWSER = false
const OFF = 'The browser pane is not part of this build.'

export function setupBrowser(_win: BrowserWindow, _open: (url: string) => void, _markShortcut?: () => void): void {}
export async function capturePage(_webContentsId: number): Promise<string> {
  throw new Error(OFF)
}
export async function captureUrl(_url: string, _width: number, _height: number): Promise<string> {
  throw new Error(OFF)
}
export function saveMarkup(_dataUrl: string): string {
  throw new Error(OFF)
}
