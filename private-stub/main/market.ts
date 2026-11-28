import type { MarketCheck, MarketTool, MarketToolInput, ToolApproval } from '../../shared/api'

/** Public stand-in for the Market, which lives in Plotter's private folder: switched off in this build. */
export const MARKET = false

const off = (): never => {
  throw new Error('The Market is not part of this build.')
}

export interface MarketFunction {
  key: string
  tool: { id: string; name: string; description: string }
  risk: 'read' | 'write' | 'destructive'
  approval?: ToolApproval
  description: string
  parameters: Record<string, unknown>
  call: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<{ text: string; figures: string[]; isError: boolean }>
}

export const listMarket = (): MarketTool[] => []
export const saveMarketTool = (_t: MarketToolInput): MarketTool[] => off()
export const removeMarketTool = (_id: string): MarketTool[] => []
export const setMarketConnected = (_id: string, _on: boolean): MarketTool[] => []
export const setMarketApproval = (_id: string, _level: ToolApproval): MarketTool[] => []
export async function signInTool(_id: string): Promise<MarketTool[]> {
  return off()
}
export async function signOutTool(_id: string): Promise<MarketTool[]> {
  return []
}
export async function checkMarketTool(_id: string): Promise<MarketCheck> {
  return { ok: false, error: 'The Market is not part of this build.' }
}
export async function closeAllMarket(): Promise<void> {}
export async function connectedFunctions(): Promise<{ functions: MarketFunction[]; tools: { name: string; description: string }[]; unavailable: { name: string; why: string }[] }> {
  return { functions: [], tools: [], unavailable: [] }
}
