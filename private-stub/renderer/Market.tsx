/** Public stand-in for the Market page, which lives in Plotter's private folder: switched off in this build. */
export const MARKET = false

export function Market({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div className="market-page">
      <div className="market-inner">
        <button className="settings-back" onClick={onClose}>
          Back to chat
        </button>
        <h2>Market</h2>
        <p className="market-lead">The Market is not part of this build.</p>
      </div>
    </div>
  )
}
