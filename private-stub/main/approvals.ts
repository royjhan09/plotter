import type { ApprovalAsk, ToolApproval } from '../../shared/api'

/** Public stand-in for approving tool use (in Plotter's private folder): calls go ahead. */
export const APPROVALS = false
export type Risk = 'read' | 'write' | 'destructive'
export const needsApproval = (_level: ToolApproval | undefined, _risk: Risk): boolean => false
export const answerApproval = (_id: string, _allow: boolean): void => undefined
export async function approveCall(_level: ToolApproval | undefined, _risk: Risk, _ask: Omit<ApprovalAsk, 'id'>, _signal?: AbortSignal): Promise<boolean> {
  return true
}
export const builtinApprovals = (): Record<string, ToolApproval> => ({})
export const setBuiltinApproval = (_id: string, _level: ToolApproval): Record<string, ToolApproval> => ({})
export const browserRisk = (_tool: string): Risk => 'read'
