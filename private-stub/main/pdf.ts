import type { BrowserWindow } from 'electron'

/** Public stand-in for PDF export, which lives in Plotter's private folder: switched off in this build. */
export const PDF_EXPORT = false

export function pdfHandlers(_getWin: () => BrowserWindow | null, _browserOnly: boolean): Record<string, (...args: never[]) => unknown> {
  return {}
}
