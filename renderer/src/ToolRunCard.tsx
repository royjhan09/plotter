import { useState } from 'react'
import type { ToolRun } from '../../shared/api'

/** A Plotter tool run inside a reply: "Ran Python" (code, output, figures), "Saved to memory", "Searched Gmail"… */
export function ToolRunCard({ run }: { run: ToolRun }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const hasDetail = !!(run.code || run.output || run.error)
  const icon = run.kind === 'python' ? '🐍' : run.kind === 'memory' ? '🧠' : run.kind === 'market' ? '🧩' : '🔗'
  return (
    <div className={`toolrun ${run.kind} ${run.error ? 'failed' : ''}`}>
      <button className="toolrun-head" onClick={() => hasDetail && setOpen((o) => !o)} disabled={!hasDetail}>
        <span className="toolrun-icon">{icon}</span>
        <span className="toolrun-title">{run.title}</span>
        {run.kind === 'memory' && run.output && <span className="toolrun-inline">{run.output}</span>}
        {hasDetail && run.kind !== 'memory' && <span className="toolrun-toggle">{open ? 'Hide' : 'Show'}</span>}
      </button>
      {open && run.kind !== 'memory' && (
        <div className="toolrun-body">
          {run.code && (
            <pre className="toolrun-code">
              <code>{run.code}</code>
            </pre>
          )}
          {run.output && <pre className="toolrun-output">{run.output}</pre>}
          {run.error && <pre className="toolrun-error">{run.error}</pre>}
        </div>
      )}
      {run.figures && run.figures.length > 0 && (
        <div className="toolrun-figures">
          {run.figures.map((f, i) => (
            <img key={i} src={f} alt={`Figure ${i + 1}`} />
          ))}
        </div>
      )}
    </div>
  )
}
