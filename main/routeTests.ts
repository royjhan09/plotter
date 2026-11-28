import type { HistoryItem, RoleEntity, RoleTool } from '../shared/api'
import { alsoIn, routeIn, type GroupView } from './team'
import { usageLog, nextUsageSeq } from './openai'

/**
 * Tests for how a group chat decides who answers (routeIn) and who else may be needed after a round (alsoIn).
 * The rule that matters most: a member who should be in is never left out. Each case says who must be picked,
 * who must not, and who may go either way; each runs several times, because the router is a model call.
 * Run on the dev server: debug:routeTest (times per case).
 */

const role = (id: string, name: string, tagline: string, responsibilities: string[], engine: 'chatgpt' | 'claude' = 'chatgpt', tools: RoleTool[] = []): RoleEntity => ({
  id,
  name,
  tagline,
  purpose: tagline,
  responsibilities,
  tools,
  engine,
  identity: { color: '#888888' } as unknown as RoleEntity['identity'],
  replies: 0,
  createdAt: 0,
  updatedAt: 0
})

const TEAM: RoleEntity[] = [
  role('builder', 'Builder', 'Full-stack developer who builds and changes the app', ['Write and change the app code (frontend and backend)', 'Fix bugs', 'Run the app and its tests'], 'claude'),
  role('designer', 'Designer', 'UI and UX designer', ['Screens, layouts and visual design', 'The design kit and its rules', 'How easy the app is to use, on desktop and mobile']),
  role('copy', 'Copywriter', 'Writes the words in the product and its marketing', ['Headlines, buttons and form text', 'Emails and the landing page', 'Tone of voice']),
  role('reviewer', 'Reviewer', 'Code reviewer and QA', ['Review code changes for bugs and security problems', 'Test plans', 'Sign off a change before it ships']),
  role('pm', 'Product manager', 'Decides what gets built and when', ['Priorities and scope', 'The launch plan', 'Trade-offs between features']),
  role('privacy', 'Privacy advisor', 'Keeps the product within data protection law', ['What personal data is collected and why', 'Consent and privacy notices', 'Data retention'], 'chatgpt', ['web'])
]

const group: GroupView = { purpose: 'Build and launch the Sprout habit-tracker app', members: TEAM, key: 'route-test' }

const u = (text: string): HistoryItem => ({ role: 'user', text })
const m = (speaker: string, text: string): HistoryItem => ({ role: 'assistant', text, speaker })

interface Case {
  name: string
  history: HistoryItem[]
  /** after a round: who took part */
  spoke?: string[]
  must: string[]
  mustNot: string[]
}

/** A message that tags nobody: who should answer it. */
const ROUTE_CASES: Case[] = [
  { name: 'Feature request', history: [u('Can you add a dark mode toggle to the settings page?')], must: ['builder'], mustNot: ['privacy', 'copy'] },
  {
    name: 'Opinion on another member',
    history: [u('How should we store the habit streaks?'), m('builder', 'I will keep streaks in localStorage only, no server table, and recompute them on load. Simple and fast.'), u('What do you think about what Builder said?')],
    must: ['reviewer'],
    mustNot: ['copy', 'designer']
  },
  { name: 'Follow-up to the last speaker', history: [u('Write a headline for the landing page.'), m('copy', 'Grow one habit at a time, and watch it bloom.'), u('Make it shorter.')], must: ['copy'], mustNot: ['builder', 'privacy', 'reviewer'] },
  { name: 'New personal data', history: [u("We're going to ask for users' birthdays at signup so we can send a birthday discount email.")], must: ['privacy'], mustNot: [] },
  { name: 'Planning question', history: [u('What should we build first for the launch?')], must: ['pm'], mustNot: ['privacy'] },
  { name: 'Asking everyone', history: [u('Everyone: give me one risk you see in the launch plan.')], must: ['builder', 'designer', 'copy', 'reviewer', 'pm', 'privacy'], mustNot: [] },
  { name: 'Visual problem', history: [u('The signup button is hard to see on mobile.')], must: ['designer'], mustNot: ['privacy', 'pm'] },
  { name: 'Analytics question', history: [u('Is it OK to put Google Analytics on the landing page?')], must: ['privacy'], mustNot: ['copy'] },
  { name: 'Crash report', history: [u('The app crashes when I open settings.')], must: ['builder'], mustNot: ['copy', 'privacy', 'pm'] },
  { name: 'Thanks', history: [u('Add a streak counter to the home screen.'), m('builder', 'Done: the home screen shows the current streak, updated when a habit is checked.'), u('Thanks!')], must: ['builder'], mustNot: ['privacy', 'copy', 'pm', 'designer'] }
]

/** After a round: who else should be offered. */
const ALSO_CASES: Case[] = [
  {
    name: 'Signup now stores a phone number',
    history: [u('Add a phone number to signup so we can send reminders by text.'), m('builder', 'Added a required phone field to the signup form and the /signup API. Phone numbers are stored in the users table. Files changed: src/Signup.tsx, api/signup.ts, db/schema.sql.')],
    spoke: ['builder'],
    must: ['privacy', 'reviewer'],
    mustNot: []
  },
  { name: 'Headline rewritten', history: [u('Rewrite the homepage headline, warmer.'), m('copy', 'New headline: "Small steps, every day. Sprout keeps you going."')], spoke: ['copy'], must: [], mustNot: ['privacy', 'reviewer'] },
  {
    name: 'New colour palette',
    history: [u('Our colours feel dull. Propose a new palette.'), m('designer', 'New palette: leaf green #2F9E44 as the main colour, soft cream #FFF8E7 background, charcoal text. I updated the design kit tokens.')],
    spoke: ['designer'],
    must: ['builder'],
    mustNot: ['privacy', 'copy']
  },
  {
    name: 'Feature cut while being built',
    history: [u('Builder, start on the referral program.'), m('builder', 'Started: invite links and a referral table. About half done.'), u('PM, is the referral program needed for v1?'), m('pm', "No. We'll cut the referral program from v1 and revisit after launch.")],
    spoke: ['pm'],
    must: ['builder'],
    mustNot: ['privacy']
  },
  {
    name: 'Product renamed',
    history: [u('Copywriter, we need a better name than Sprout.'), m('copy', 'Going with "Sprig": short, fresh, and the domain is free. I have updated the tagline to "Sprig: tiny habits, big growth."')],
    spoke: ['copy'],
    must: ['builder', 'designer'],
    mustNot: []
  },
  {
    name: 'Analytics script added',
    history: [u('Add analytics so we can see which screens people use.'), m('builder', 'Added a tracking script that records every screen view with the user id and device. Files changed: src/analytics.ts, src/App.tsx.')],
    spoke: ['builder'],
    must: ['privacy', 'reviewer'],
    mustNot: ['copy']
  },
  {
    name: 'Shared button changed',
    history: [u('Make our buttons rounder and bigger.'), m('designer', 'Updated the Button component in the design kit: 14px radius, 48px tall. Every screen that uses it changes.')],
    spoke: ['designer'],
    must: ['builder'],
    mustNot: ['privacy', 'copy']
  },
  { name: 'Small talk', history: [u('Thanks for today, Builder.'), m('builder', "You're welcome!")], spoke: ['builder'], must: [], mustNot: ['designer', 'copy', 'reviewer', 'pm', 'privacy'] },
  {
    name: 'Bug fix in checkout maths',
    history: [u('The premium price shows $4.99 but charges $5.99. Fix it.'), m('builder', 'Fixed: the price was rounded up twice in api/billing.ts. Charges now match the shown price. Added a test.')],
    spoke: ['builder'],
    must: ['reviewer'],
    mustNot: ['copy', 'privacy', 'designer']
  }
]

export interface RouteTestResult {
  kind: 'route' | 'also'
  name: string
  runs: { picked: string[]; missed: string[]; extra: string[]; /** also: must-be members offered only as maybe */ weak?: string[]; maybe?: string[] }[]
}

export interface RouteTestReport {
  cases: RouteTestResult[]
  /** Of all must-be-picked members over all runs, the share that was picked. */
  recall: number
  /** Runs that picked a member who must not be (as needed, or for a message, to answer). */
  wrongPicks: number
  /** Runs that offered a member who must not be, folded as "maybe". */
  wrongMaybe: number
  /** After a round: must-be members offered only as "maybe" (folded), over all runs. */
  weak: number
  /** After a round: members offered as needed, and as maybe, on average per run. */
  perRound: { needed: number; maybe: number }
  runs: number
  calls: number
  tokens: { input: number; cached: number; output: number }
}

export async function runRouteTests(times = 2): Promise<RouteTestReport> {
  const first = nextUsageSeq()
  const cases: RouteTestResult[] = []
  const jobs: Promise<void>[] = []
  for (const c of ROUTE_CASES) {
    const r: RouteTestResult = { kind: 'route', name: c.name, runs: [] }
    cases.push(r)
    for (let i = 0; i < times; i++)
      jobs.push(
        routeIn(group, c.history, 'test:route').then((x) => {
          r.runs.push({ picked: x.answer, missed: c.must.filter((id) => !x.answer.includes(id)), extra: x.answer.filter((id) => c.mustNot.includes(id)) })
        })
      )
  }
  for (const c of ALSO_CASES) {
    const r: RouteTestResult = { kind: 'also', name: c.name, runs: [] }
    cases.push(r)
    for (let i = 0; i < times; i++)
      jobs.push(
        alsoIn(group, c.history, c.spoke ?? [], 'test:also').then((x) => {
          const picked = x.map((a) => a.roleId)
          const maybe = x.filter((a) => a.level === 'maybe').map((a) => a.roleId)
          r.runs.push({ picked, maybe, missed: c.must.filter((id) => !picked.includes(id)), extra: picked.filter((id) => c.mustNot.includes(id)), weak: c.must.filter((id) => maybe.includes(id)) })
        })
      )
  }
  await Promise.all(jobs)
  const all = [...ROUTE_CASES, ...ALSO_CASES]
  const mustTotal = cases.reduce((n, r, i) => n + all[i]!.must.length * r.runs.length, 0)
  const missed = cases.reduce((n, r) => n + r.runs.reduce((k, x) => k + x.missed.length, 0), 0)
  const calls = usageLog.filter((x) => x.seq >= first && x.tag.startsWith('test:'))
  return {
    cases,
    recall: mustTotal ? Math.round(((mustTotal - missed) / mustTotal) * 1000) / 10 : 100,
    wrongPicks: cases.reduce((n, r) => n + r.runs.filter((x) => x.extra.some((id) => !x.maybe?.includes(id))).length, 0),
    wrongMaybe: cases.reduce((n, r) => n + r.runs.filter((x) => x.extra.some((id) => x.maybe?.includes(id))).length, 0),
    weak: cases.reduce((n, r) => n + r.runs.reduce((k, x) => k + (x.weak?.length ?? 0), 0), 0),
    perRound: (() => {
      const rs = cases.filter((c) => c.kind === 'also').flatMap((c) => c.runs)
      const avg = (f: (x: (typeof rs)[number]) => number): number => Math.round((rs.reduce((n, x) => n + f(x), 0) / Math.max(1, rs.length)) * 10) / 10
      return { needed: avg((x) => x.picked.length - (x.maybe?.length ?? 0)), maybe: avg((x) => x.maybe?.length ?? 0) }
    })(),
    runs: cases.reduce((n, r) => n + r.runs.length, 0),
    calls: calls.length,
    tokens: { input: calls.reduce((n, x) => n + x.input, 0), cached: calls.reduce((n, x) => n + x.cached, 0), output: calls.reduce((n, x) => n + x.output, 0) }
  }
}
