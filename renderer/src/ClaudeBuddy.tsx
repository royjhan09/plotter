/** Plotter's Claude Code character and marks (public: the look, used by the chat list and replies). */

/**
 * The fuzzy outline around a rounded square (a squircle), as small rounded tufts: flat, no strokes, a
 * little uneven so it looks hand-made.
 */
const FUZZ = (() => {
  const n = 28
  const cx = 12
  const cy = 12.8
  const at = (t: number, r: number): string => {
    const c = Math.cos(t)
    const s = Math.sin(t)
    const x = Math.sign(c) * Math.pow(Math.abs(c), 0.55) * r
    const y = Math.sign(s) * Math.pow(Math.abs(s), 0.55) * r
    return `${(cx + x).toFixed(2)} ${(cy + y).toFixed(2)}`
  }
  const inner = (i: number): number => 7.0 + Math.sin(i * 2.1) * 0.18
  let d = `M${at(0, inner(0))}`
  for (let i = 0; i < n; i++) d += `Q${at(((i + 0.5) / n) * Math.PI * 2, 8.5 + Math.cos(i * 1.3) * 0.3)} ${at(((i + 1) / n) * Math.PI * 2, inner(i + 1))}`
  return `${d}Z`
})()

/**
 * Plotter's Claude Code character, drawn in the same format as Plotter's icon (rounded tile, flat shapes,
 * white block eyes) in its own colours: a squarish fuzzy ball of soot on a soft violet tile. It bobs while
 * it works.
 */
export function ClaudeBuddy({ size = 28, working = false, tile = true }: { size?: number; working?: boolean; tile?: boolean }): React.JSX.Element {
  return (
    <svg className={`buddy ${working ? 'working' : ''}`} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {tile && <rect x="0" y="0" width="24" height="24" rx="6" fill="#ffffff" stroke="#d4d4d8" strokeWidth="0.6" />}
      <g transform="translate(12 13.2) scale(0.74) translate(-12 -12.8)">
        <g className="buddy-body">
          <path d={FUZZ} fill="#1f1c29" />
          <rect x="5.4" y="6.2" width="13.2" height="13.2" rx="4.2" fill="#26222f" />
          {/* the sprout robot's block eyes, a little smaller and without pupils */}
          <rect className="buddy-eye" x="8.1" y="10.9" width="3" height="3.6" rx="1" fill="#fff" />
          <rect className="buddy-eye" x="12.9" y="10.9" width="3" height="3.6" rx="1" fill="#fff" />
        </g>
      </g>
    </svg>
  )
}

/** The small terminal mark used on buttons ("Send to Claude Code"). */
export function ClaudeCodeIcon({ size = 18 }: { size?: number }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="m7.5 10 2.5 2-2.5 2M12.5 15h4" />
    </svg>
  )
}

export const folderName = (f: string): string => f.split(/[\\/]/).filter(Boolean).pop() ?? f
