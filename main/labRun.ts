import type { Chat, HistoryItem, LabArm, LabArmResult, LabEstimate, LabResult, LabTest, LabVerdict } from '../shared/api'
import { primaryModel, runConversation, streamRound, toInput, usageLog, type ConversationHandlers } from './openai'
import { reply } from './assistant'
import { nextSpeaker } from './team'
import { pythonTool } from './python'
import { getIdea, labResults, readLab, setLabResult, updateIdea } from '@private/main/lab'
import { getRole } from '@private/main/roles'

/**
 * The Lab's tests, run only when the user picks one (nothing here runs by itself):
 * - check: ChatGPT tests the claim the cheapest real way it has (Python, the web) and says what it missed;
 * - compare: the same task done each way (plain ChatGPT, a role, a team), each way's tokens and time measured from
 *   its own calls, then one call judges the outputs against the numbers.
 * Test runs change nothing of the user's (see dryRun in assistant.ts) and carry their own usage tag.
 */

const CHECK = `You test an idea before anyone relies on it. You get the idea and its claim.
1. Say in a line what would have to be true for the claim to hold, and what result would show it does not.
2. Test it the cheapest real way you have: run Python to compute, simulate or measure where that is possible; search the web for evidence where it is not. Do not only reason about it when it can be tried.
3. Name what the claim (or whoever proposed it) did not take into account: costs, side effects, cases where it breaks, what else it depends on.
Keep the write-up short. End with this block, as the very last thing:
\`\`\`lab-result
{"verdict": "holds" | "partly" | "fails" | "unclear", "summary": "<two sentences: what you found>", "considerations": ["<something not taken into account>"]}
\`\`\``

const JUDGE = `You judge a test in Plotter's Lab. An idea was tested by doing the same task in different ways; you get each way's output and what it cost. Judge only from the outputs and the numbers.
Mark how well each way did the task (1 poor to 5 excellent, one line why). Pick the best way overall, weighing quality against tokens and time (say so if it is a trade-off). Say whether the idea's claim holds, and list what the idea did not take into account that the outputs or numbers show.
Answer with JSON only:
{"arms": [{"label": "<as given>", "score": 1, "note": "<one line>"}], "winner": "<label>", "verdict": "holds" | "partly" | "fails" | "unclear", "summary": "<two or three sentences>", "considerations": ["<…>"]}`

const TEAM_TURNS = 8
const TYPICAL = { check: { tokens: 25_000, seconds: 60 }, plain: { tokens: 15_000, seconds: 30 }, role: { tokens: 10_000, seconds: 25 }, team: { tokens: 30_000, seconds: 120 }, judge: { tokens: 6_000, seconds: 15 } }
const VERDICTS: LabVerdict[] = ['holds', 'partly', 'fails', 'unclear']

const running = new Map<string, AbortController>()

const avg = (xs: number[]): number => xs.reduce((n, x) => n + x, 0) / xs.length

/** What a test would cost: averages of past Lab runs of the same kind where there are any, typical figures where not. */
export function estimateLab(test: LabTest): LabEstimate {
  const past = labResults()
  let measured = false
  const figure = (kind: keyof typeof TYPICAL): { tokens: number; seconds: number } => {
    const pick =
      kind === 'check'
        ? past.filter((r) => !r.arms).map((r) => ({ t: r.cost.input + r.cost.output, s: r.cost.ms / 1000 }))
        : kind === 'judge'
          ? past.filter((r) => r.arms).map((r) => ({ t: r.cost.input + r.cost.output - r.arms!.reduce((n, a) => n + a.input + a.output, 0), s: (r.cost.ms - r.arms!.reduce((n, a) => n + a.ms, 0)) / 1000 }))
          : past.flatMap((r) => (r.arms ?? []).filter((a) => a.type === kind).map((a) => ({ t: a.input + a.output, s: a.ms / 1000 })))
    if (!pick.length) return TYPICAL[kind]
    measured = true
    return { tokens: Math.max(0, avg(pick.map((p) => p.t))), seconds: Math.max(1, avg(pick.map((p) => p.s))) }
  }
  const parts = test.kind === 'check' ? [figure('check')] : [...test.arms.map((a) => figure(a.setup.type)), figure('judge')]
  return { tokens: Math.round(parts.reduce((n, p) => n + p.tokens, 0) / 100) * 100, seconds: Math.round(parts.reduce((n, p) => n + p.seconds, 0)), basis: measured ? 'measured' : 'typical' }
}

/** The calls a run made (by its tag), added up. */
function costOf(prefix: string): { input: number; cached: number; output: number; calls: number } {
  const calls = usageLog.filter((u) => u.tag.startsWith(prefix))
  return { input: calls.reduce((n, u) => n + u.input, 0), cached: calls.reduce((n, u) => n + u.cached, 0), output: calls.reduce((n, u) => n + u.output, 0), calls: calls.length }
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}…` : s)

function quiet(progress: (label: string) => void, onText: (t: string) => void): ConversationHandlers {
  return { onDelta: onText, onActivity: (l) => l && progress(l), onSource: () => undefined, onToolRun: () => undefined }
}

/** One way of doing the task, measured. */
async function runArm(arm: LabArm, task: string, tag: string, model: { slug: string; effort: string }, signal: AbortSignal, progress: (s: string) => void): Promise<LabArmResult> {
  const t0 = Date.now()
  const base = { requestId: tag, chatId: '', model: model.slug, effort: model.effort }
  let answer = ''
  if (arm.setup.type === 'team') {
    const members = arm.setup.roleIds.filter((id) => getRole(id))
    if (members.length < 2) throw new Error(`"${arm.label}" needs at least two roles.`)
    const chat: Chat = { id: `lab-${tag.replace(/[^\w-]/g, '-')}`, title: task.slice(0, 60), model: model.slug, messages: [], createdAt: t0, updatedAt: t0, team: { purpose: task, members } }
    const hist: HistoryItem[] = [{ role: 'user', text: task }]
    for (let turn = 0; turn < TEAM_TURNS; turn++) {
      progress(`${arm.label}: deciding who speaks next…`)
      const t = await nextSpeaker(chat, hist, TEAM_TURNS - turn, `${tag}:facilitator`)
      if (!t.speaker) break
      const who = getRole(t.speaker)?.name ?? 'A member'
      progress(`${arm.label}: ${who} is working…`)
      let text = ''
      await reply(
        { ...base, history: hist, asRole: t.speaker, ...(t.to ? { speakTo: t.to } : {}), ...(t.note ? { teamNote: t.note } : {}) },
        quiet((l) => progress(`${arm.label}: ${l}`), (d) => (text += d)),
        signal,
        { tag: `${tag}:member`, chat }
      )
      hist.push({ role: 'assistant', text, speaker: t.speaker })
    }
    answer = hist
      .slice(1)
      .map((h) => `${getRole(h.speaker)?.name ?? 'Member'}: ${clip(h.text, 1500)}`)
      .join('\n\n')
  } else {
    const roleId = arm.setup.type === 'role' ? arm.setup.roleId : undefined
    if (roleId && !getRole(roleId)) throw new Error(`The role in "${arm.label}" no longer exists.`)
    progress(`${arm.label}: working…`)
    await reply({ ...base, history: [{ role: 'user', text: task }], ...(roleId ? { asRole: roleId } : {}) }, quiet((l) => progress(`${arm.label}: ${l}`), (d) => (answer += d)), signal, { tag })
  }
  const c = costOf(tag)
  return { label: arm.label, type: arm.setup.type, ...c, ms: Date.now() - t0, answer: clip(answer.trim(), 4000) }
}

async function judge(claim: string, task: string, arms: LabArmResult[], tag: string, signal: AbortSignal): Promise<Record<string, unknown>> {
  const model = await primaryModel()
  const effort = model.efforts.find((e) => e.effort === 'medium')?.effort ?? model.defaultEffort
  const text = `Claim: ${claim}\nTask: ${task}\n\n${arms.map((a) => `## ${a.label}\nCost: ${a.input + a.output} tokens (${a.input} in, of which ${a.cached} cached; ${a.output} out), ${a.calls} calls, ${Math.round(a.ms / 1000)} s\nOutput:\n${clip(a.answer, 3500)}`).join('\n\n')}`
  let out = ''
  await streamRound({ model: model.slug, effort, instructions: JUDGE, input: [toInput({ role: 'user', text })], tools: [], verbosity: 'low', tag }, { onDelta: (t) => (out += t), onActivity: () => undefined, onSource: () => undefined }, signal)
  try {
    return JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)) as Record<string, unknown>
  } catch {
    throw new Error('The judge did not answer in the expected form. Run it again.')
  }
}

const verdictOf = (v: unknown): LabVerdict => (VERDICTS.includes(String(v) as LabVerdict) ? (String(v) as LabVerdict) : 'unclear')
const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 8) : [])

async function runTest(id: string, test: LabTest, signal: AbortSignal): Promise<LabResult> {
  const idea = getIdea(id)!
  const t0 = Date.now()
  const prefix = `lab:${id}:${t0.toString(36)}`
  const estimate = estimateLab(test).tokens
  let last = ''
  const progress = (s: string): void => {
    if (s === last || signal.aborted) return
    last = s
    updateIdea(id, { progress: s })
  }
  const model = await primaryModel()
  if (test.kind === 'check') {
    progress('Testing the claim…')
    let text = ''
    await runConversation(
      {
        model: model.slug,
        effort: model.efforts.find((e) => e.effort === 'medium')?.effort ?? model.defaultEffort,
        instructions: CHECK,
        history: [{ role: 'user', text: `Idea: ${idea.title}\nClaim: ${idea.claim}${idea.consider?.length ? `\nAlso check: ${idea.consider.join('; ')}` : ''}` }],
        webSearch: true,
        tools: [pythonTool(() => [])],
        tag: `${prefix}:check`
      },
      quiet(progress, (d) => (text += d)),
      signal
    )
    const m = /```[ \t]*lab-result[ \t]*\n([\s\S]*?)(```|$)/i.exec(text)
    let j: Record<string, unknown> = {}
    try {
      j = m ? (JSON.parse(m[1]!.trim()) as Record<string, unknown>) : {}
    } catch {
      // the write-up still says what was found
    }
    const report = text.replace(/\n*```[ \t]*lab-result[\s\S]*$/i, '').trim()
    return { at: Date.now(), verdict: verdictOf(j['verdict']), summary: String(j['summary'] ?? '').trim() || clip(report, 300), considerations: listOf(j['considerations']), cost: { ...costOf(prefix), ms: Date.now() - t0 }, estimate, report: clip(report, 6000) }
  }
  const arms: LabArmResult[] = []
  for (const [i, arm] of test.arms.entries()) {
    if (signal.aborted) throw new Error('Stopped.')
    arms.push(await runArm(arm, test.task, `${prefix}:arm${i}`, { slug: model.slug, effort: model.defaultEffort }, signal, progress))
  }
  progress('Judging the results…')
  const j = await judge(idea.claim, test.task, arms, `${prefix}:judge`, signal)
  const marks = Array.isArray(j['arms']) ? (j['arms'] as Record<string, unknown>[]) : []
  for (const a of arms) {
    const mark = marks.find((x) => String(x['label'] ?? '').toLowerCase() === a.label.toLowerCase())
    if (mark) {
      const score = Number(mark['score'])
      if (score >= 1 && score <= 5) a.score = Math.round(score)
      if (mark['note']) a.note = String(mark['note']).slice(0, 300)
    }
  }
  const winner = String(j['winner'] ?? '')
  return {
    at: Date.now(),
    verdict: verdictOf(j['verdict']),
    summary: String(j['summary'] ?? '').trim(),
    considerations: listOf(j['considerations']),
    arms,
    ...(arms.some((a) => a.label === winner) ? { winner } : {}),
    cost: { ...costOf(prefix), ms: Date.now() - t0 },
    estimate
  }
}

function checkTest(test: LabTest): LabTest {
  if (test?.kind === 'check') return { kind: 'check' }
  if (test?.kind !== 'compare') throw new Error('Pick how to test it.')
  const task = String(test.task ?? '').trim()
  if (!task) throw new Error('Say what task each way should do.')
  const arms = (Array.isArray(test.arms) ? test.arms : []).slice(0, 3).map((a, i) => ({ label: String(a.label ?? '').trim().slice(0, 60) || `Way ${i + 1}`, setup: a.setup }))
  if (arms.length < 2) throw new Error('A comparison needs at least two ways.')
  if (new Set(arms.map((a) => a.label.toLowerCase())).size < arms.length) throw new Error('Give each way its own name.')
  return { kind: 'compare', task: task.slice(0, 2000), arms }
}

/** Starts a test the user picked; its progress and result are saved with the idea as they come. */
export function startLab(id: string, raw: LabTest): void {
  if (running.has(id)) return
  if (!getIdea(id)) throw new Error('That idea is no longer in the Lab.')
  const test = checkTest(raw)
  const ctl = new AbortController()
  running.set(id, ctl)
  updateIdea(id, { status: 'running', test, progress: 'Starting…', error: undefined })
  void runTest(id, test, ctl.signal)
    .then((r) => setLabResult(id, r))
    .catch((e: unknown) => {
      if (!getIdea(id)) return
      updateIdea(id, ctl.signal.aborted ? { status: 'new', progress: undefined, error: 'Stopped.' } : { status: 'failed', progress: undefined, error: e instanceof Error ? e.message : String(e) })
    })
    .finally(() => running.delete(id))
}

export function stopLab(id: string): void {
  running.get(id)?.abort()
}

/** Tests left "running" when Plotter closed are not running any more. */
export function settleLab(): void {
  for (const i of readLab().ideas) if (i.status === 'running' && !running.has(i.id)) updateIdea(i.id, { status: 'failed', progress: undefined, error: 'Stopped when Plotter closed.' })
}
