/** Public stand-in for PDF export, which lives in Plotter's private folder: switched off in this build. */
export const PDF_EXPORT = false

export function PdfBadge(_p: { size?: number }): React.JSX.Element | null {
  return null
}

export function PdfPreview(_p: { bytes: Uint8Array | null; name: string; error?: string; onClose: () => void }): React.JSX.Element | null {
  return null
}
