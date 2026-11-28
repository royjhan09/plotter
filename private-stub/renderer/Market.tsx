/** Public stand-in for the Market page, which lives in Plotter's private folder: switched off in this build. */
export const MARKET = false

export function Market({ onClose }: { onClose: () => void; onTryInChat?: (text: string) => void; start?: { popularId?: string; query?: string } }): React.JSX.Element {
  return (
    <div className="market-page">
      <div className="market-inner">
        <h2>Market</h2>
        <p className="market-lead">The Market is not part of this build.</p>
      </div>
    </div>
  )
}
