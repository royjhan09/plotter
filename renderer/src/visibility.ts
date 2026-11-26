/**
 * Which parts of Plotter are public (in the GitHub repo), which are private, and which could be.
 *
 * The rule: code that uses your ChatGPT plan stays public, because OpenAI's plan-usage track for apps
 * like Plotter is for "open-source and locally hosted apps". Code that doesn't use ChatGPT can move to a
 * private folder that the build pulls in when present: no effect on speed (it is compiled into the same
 * app), the costs are a second repo to keep and a public repo that no longer has those features.
 * Code already pushed stays visible in the public history even after it moves.
 */

export type Visibility = 'private' | 'public'
export type Advice = 'keep-private' | 'must-public' | 'can-private' | 'partly'

export interface VisibilityItem {
  name: string
  /** Where it is today. */
  now: Visibility
  advice: Advice
  why: string
  /** What making it private would cost (speed, upkeep, behaviour). */
  tradeoff: string
}

export interface VisibilityGroup {
  title: string
  lead: string
  items: VisibilityItem[]
}

const NO_SPEED = 'No effect on speed: it would be compiled into the same app.'

export const VISIBILITY: VisibilityGroup[] = [
  {
    title: 'Already private: only on this PC',
    lead: 'Your data never goes in the repo. It lives in AppData\\Roaming\\Plotter.',
    items: [
      { name: 'Your chats (ChatGPT and Claude Code)', now: 'private', advice: 'keep-private', why: 'Stored as files on this PC.', tradeoff: 'Nothing to change.' },
      { name: 'Sign-in to ChatGPT', now: 'private', advice: 'keep-private', why: 'Tokens are encrypted with Windows (DPAPI) on this PC.', tradeoff: 'Nothing to change.' },
      { name: 'Settings, memories, theme, recent folders', now: 'private', advice: 'keep-private', why: 'Stored on this PC.', tradeoff: 'Nothing to change.' },
      {
        name: 'Tools you register in the Market, and their keys',
        now: 'private',
        advice: 'keep-private',
        why: 'Only the address is stored, on this PC; keys are encrypted. The tool’s own code stays wherever you keep it.',
        tradeoff: 'Nothing to change. A tool you might sell keeps its code in its own private repo.'
      },
      { name: 'Connector sign-ins (Google, Notion)', now: 'private', advice: 'keep-private', why: 'Encrypted on this PC.', tradeoff: 'Nothing to change.' },
      { name: 'Claude Code sessions', now: 'private', advice: 'keep-private', why: 'Kept by Claude Code in your user folder.', tradeoff: 'Nothing to change.' }
    ]
  },
  {
    title: 'Must stay public: uses your ChatGPT plan',
    lead: 'This is the code OpenAI’s open-source track covers. Keeping it public is what makes using your plan in Plotter fit the rules.',
    items: [
      {
        name: 'ChatGPT sign-in and plan usage',
        now: 'public',
        advice: 'must-public',
        why: 'Signs in with your ChatGPT account and sends requests on your plan.',
        tradeoff: 'Making it private would mean switching to a paid OpenAI API key instead of your plan.'
      },
      { name: 'Chat replies (streaming, reasoning level, web search)', now: 'public', advice: 'must-public', why: 'Every reply is a ChatGPT request.', tradeoff: 'Same as above.' },
      { name: 'Visuals in replies (charts, diagrams, maths, mockups)', now: 'public', advice: 'must-public', why: 'Part of how ChatGPT is asked to reply, and how its replies are drawn.', tradeoff: 'Splitting them out would separate the instructions from the drawing for no gain.' },
      { name: 'Memory', now: 'public', advice: 'must-public', why: 'A tool ChatGPT calls during replies.', tradeoff: 'Same as chat replies.' },
      { name: 'Run Python', now: 'public', advice: 'must-public', why: 'Runs code ChatGPT writes, as a ChatGPT tool.', tradeoff: 'Same as chat replies.' },
      { name: 'Canvas and deep research', now: 'public', advice: 'must-public', why: 'Ways of asking ChatGPT to answer.', tradeoff: 'Same as chat replies.' },
      { name: 'Connectors (Google, Notion)', now: 'public', advice: 'must-public', why: 'Tools ChatGPT calls during replies.', tradeoff: 'Same as chat replies.' },
      { name: 'Chat titles and Tab suggestions', now: 'public', advice: 'must-public', why: 'Small ChatGPT requests made after replies.', tradeoff: 'Same as chat replies.' },
      { name: 'Voice mode', now: 'public', advice: 'must-public', why: 'Your speech becomes a ChatGPT message.', tradeoff: 'Same as chat replies.' }
    ]
  },
  {
    title: 'Can be private: doesn’t use ChatGPT',
    lead: 'These could move to a private folder the build pulls in. Plotter would run exactly the same.',
    items: [
      {
        name: 'Claude Code chats',
        now: 'public',
        advice: 'can-private',
        why: 'Run your own Claude Code, not ChatGPT.',
        tradeoff: `${NO_SPEED} The public repo would no longer have Claude Code chats.`
      },
      {
        name: 'The Market (registering and connecting tools)',
        now: 'public',
        advice: 'partly',
        why: 'The registry, its page and the Claude Code bridge don’t use ChatGPT. Only the small piece that hands your tools to a ChatGPT reply does.',
        tradeoff: `${NO_SPEED} That one piece stays public; everything else can move.`
      },
      { name: 'PDF export and preview', now: 'public', advice: 'can-private', why: 'Prints a chat on this PC.', tradeoff: NO_SPEED },
      { name: 'Two chats side by side, drag and drop', now: 'public', advice: 'can-private', why: 'Layout only.', tradeoff: NO_SPEED },
      { name: 'Picture viewer and drawing on pictures', now: 'public', advice: 'can-private', why: 'Runs on this PC.', tradeoff: NO_SPEED },
      { name: 'Dictation (speech to text)', now: 'public', advice: 'can-private', why: 'Runs a speech model on this PC.', tradeoff: NO_SPEED },
      { name: 'Chat list: pin, rename, archive, search', now: 'public', advice: 'can-private', why: 'Organises files on this PC.', tradeoff: `${NO_SPEED} Low value to hide: it’s ordinary app plumbing.` },
      { name: 'Settings, themes, characters and look', now: 'public', advice: 'can-private', why: 'Appearance and preferences.', tradeoff: `${NO_SPEED} Low value to hide.` }
    ]
  }
]

export const ADVICE_LABEL: Record<Advice, string> = {
  'keep-private': 'Private',
  'must-public': 'Keep public',
  'can-private': 'Can be private',
  partly: 'Mostly can be private'
}
