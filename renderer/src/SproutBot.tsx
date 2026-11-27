/**
 * Plotter's sprout-bot, drawn live so it can move: now and then it glances down (at your message box) and
 * blinks; while a reply is being written it looks down, as if writing. Same shapes as assets/sprout.svg.
 */
export function SproutBot({ size = 84, working = false, className = '' }: { size?: number; working?: boolean; className?: string }): React.JSX.Element {
  return (
    <svg className={`sprout-bot ${working ? 'working' : ''} ${className}`} viewBox="74 64 118 152" width={size} height={(size * 152) / 118} aria-hidden="true">
      <g className="sprout-bot-sprout">
        <path d="M126.5 150 V110" stroke="#2f9e44" strokeWidth="8" strokeLinecap="round" fill="none" />
        <path d="M123 126 C115 108 99 99 81 101 C86 118 103 128 123 126 Z" fill="#69db7c" />
        <path d="M129 112 C134 89 156 73 186 71 C183 95 161 111 129 112 Z" fill="#40c057" />
      </g>
      <rect x="92" y="149" width="72" height="62" rx="12" fill="#e8590c" />
      <g className="sprout-bot-eyes">
        <rect x="108" y="167" width="10" height="17" rx="4" fill="#ffffff" />
        <rect x="138" y="167" width="10" height="17" rx="4" fill="#ffffff" />
      </g>
    </svg>
  )
}
