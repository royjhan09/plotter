/** Public stand-in for the design-kit tools (in Plotter's private folder): none. */
export const KIT_OPS = false

export interface KitCtx {
  by: 'ChatGPT' | 'Claude Code'
  chatId?: string
  chatTitle?: string
  folder?: string
  afterReply?: (job: (replyText: string) => void) => void
}

export interface KitToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
  label: string
  run: (kitId: string, args: Record<string, unknown>, ctx: KitCtx) => { output: string; card?: { title: string; output: string } }
}

export const KIT_GUIDE = ''
export const kitToolSpecs = (): KitToolSpec[] => []
export const runKitTool = (_kitId: string, _name: string, _args: Record<string, unknown>, _ctx: KitCtx): { output: string; card?: { title: string; output: string } } => ({ output: '{"error":"Design kits are not part of this build."}' })
