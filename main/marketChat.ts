import type { ToolRun } from '../shared/api'
import type { LocalTool } from './openai'
import { connectedFunctions } from '@private/main/market'
import { approveCall } from '@private/main/approvals'

/**
 * Hands the tools connected in the Market to a ChatGPT reply, as function tools (public: it is part of how
 * Plotter uses ChatGPT). The Market itself, where tools are registered and stored, is private.
 */
export async function marketTools(): Promise<{ tools: LocalTool[]; instructions: string }> {
  const { functions, tools: connected, unavailable } = await connectedFunctions()
  if (!connected.length) return { tools: [], instructions: '' }
  const used = new Set<string>()
  const unique = (n: string): string => {
    const clean = (s: string): string => s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
    let name = clean(n)
    for (let i = 2; used.has(name); i++) name = clean(`${n.slice(0, 60)}_${i}`)
    used.add(name)
    return name
  }
  const card = (toolName: string, args: Record<string, unknown>, out: { text: string; figures: string[] }, error?: string): Omit<ToolRun, 'id'> => ({
    kind: 'market',
    title: error === 'Not allowed' ? `${toolName}: not allowed` : error ? `${toolName} failed` : `Used ${toolName}`,
    code: Object.keys(args).length ? JSON.stringify(args, null, 2) : undefined,
    output: error ? undefined : out.text.slice(0, 4000),
    error,
    figures: out.figures.length ? out.figures : undefined
  })
  const tools: LocalTool[] = functions.map((f) => ({
    name: unique(f.key),
    description: f.description,
    parameters: f.parameters,
    label: () => `Using ${f.tool.name}…`,
    run: async (args, signal) => {
      try {
        // the tool's approval level (Market): ask before calls it does not allow freely
        const ok = await approveCall(f.approval, f.risk, { who: 'ChatGPT', tool: f.tool.name, what: f.description.slice(0, 160), args: JSON.stringify(args, null, 2).slice(0, 2000) }, signal)
        if (!ok) return { output: 'The user did not allow this call.', run: card(f.tool.name, args, { text: '', figures: [] }, 'Not allowed') }
        const out = await f.call(args, signal)
        return { output: out.text || '(no output)', run: card(f.tool.name, args, out, out.isError ? out.text.slice(0, 600) : undefined) }
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e)
        return { output: `The tool could not be reached: ${why}`, run: card(f.tool.name, args, { text: '', figures: [] }, why) }
      }
    }
  }))
  const names = connected.map((t) => `${t.name} (${t.description.slice(0, 140)})`).join('; ')
  const notes = unavailable.map((u) => `${u.name} is connected but could not be reached right now (${u.why}); say so if the user asks for it.`)
  return {
    tools,
    instructions: `The user connected their own tools from Plotter's market: ${names}. Use them whenever a request matches what a tool does, instead of doing the work yourself. An image a tool returns is shown to the user automatically; don't paste it.${notes.length ? ' ' + notes.join(' ') : ''}`
  }
}
