/**
 * Which parts of Plotter are public (in the GitHub repo), which are private, and why.
 *
 * The rule: code that uses your ChatGPT plan stays public, because OpenAI's plan-usage track for apps
 * like Plotter is for "open-source and locally hosted apps". Code that doesn't use ChatGPT lives in
 * ./private: a separate, git-ignored repo that the build pulls in when present. No effect on speed: it is
 * compiled into the same app. Without it (a public checkout) small stand-ins in ./private-stub switch
 * those features off. Code pushed before the move stays visible in the public history.
 */

export type Visibility = 'private' | 'public'
export type Advice = 'keep-private' | 'must-public' | 'stay-public'

export interface VisibilityItem {
  name: string
  /** Where it is today. */
  now: Visibility
  advice: Advice
  why: string
  /** The tradeoff of where it is. */
  tradeoff: string
}

export interface VisibilityGroup {
  title: string
  lead: string
  items: VisibilityItem[]
}

const MOVED = 'In the private folder. The public repo has a stand-in that switches it off. Versions pushed before the move are still in the public history.'

export const VISIBILITY: VisibilityGroup[] = [
  {
    title: 'Your data: only on this PC',
    lead: 'Never in the repo. It lives in AppData\\Roaming\\Plotter (and Claude Code’s own folder).',
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
      { name: 'Claude Code sessions', now: 'private', advice: 'keep-private', why: 'Kept by Claude Code in your user folder.', tradeoff: 'Nothing to change.' },
      { name: 'Projects and their shared memory', now: 'private', advice: 'keep-private', why: 'Stored on this PC (projects.json).', tradeoff: 'Nothing to change.' },
      { name: 'Your design kits', now: 'private', advice: 'keep-private', why: 'Folders on this PC (kits/): rules, tokens and component files.', tradeoff: 'Nothing to change.' },
      { name: 'Your OpenAI API key for pictures', now: 'private', advice: 'keep-private', why: 'Encrypted with Windows (DPAPI) on this PC (images.bin).', tradeoff: 'Nothing to change.' }
    ]
  },
  {
    title: 'Private code: in the private folder',
    lead: 'Features that don’t use ChatGPT, moved to C:\\Coding\\plotter\\private (its own repo, ignored by the public one). Plotter runs exactly the same.',
    items: [
      { name: 'Claude Code chats', now: 'private', advice: 'keep-private', why: 'Runs your own Claude Code, not ChatGPT: the runner, the folder menu and the reply view.', tradeoff: MOVED },
      { name: 'The Market', now: 'private', advice: 'keep-private', why: 'Registering tools, the page, the MCP connections and the bridge for Claude Code.', tradeoff: MOVED },
      {
        name: 'Claude Code’s side of projects and side-by-side sending',
        now: 'private',
        advice: 'keep-private',
        why: 'How Claude Code gets the shared memory and the chat beside it, and how its notes and messages are picked out of its answers.',
        tradeoff: MOVED
      },
      {
        name: 'Pictures from OpenAI’s image model',
        now: 'private',
        advice: 'keep-private',
        why: 'Uses your own API key, not your ChatGPT plan: the key store, the calls to the image model, and the image tool for Claude Code.',
        tradeoff: MOVED
      },
      {
        name: 'Design kits',
        now: 'private',
        advice: 'keep-private',
        why: 'The kits page, where kits are kept, and how Claude Code gets your kit folder.',
        tradeoff: MOVED
      },
      {
        name: 'Roles and their looks',
        now: 'private',
        advice: 'keep-private',
        why: 'The Roles page, where roles are kept, the sprout-bot’s costumes and how it grows with each role.',
        tradeoff: `${MOVED} The public stand-in has no Roles page, and role chats show the plain sprout.`
      },
      {
        name: 'Role tool wishes and combining roles',
        now: 'private',
        advice: 'keep-private',
        why: 'Where the tools a role wished for are kept, the Roles page buttons to give or dismiss them, combining two roles with its trade-off, and retired roles.',
        tradeoff: `${MOVED} The public stand-in keeps no wishes and cannot combine roles.`
      },
      {
        name: 'The Lab page',
        now: 'private',
        advice: 'keep-private',
        why: 'The Lab page, where untested ideas wait with what a test would cost, and the results of the tests you ran.',
        tradeoff: `${MOVED} The public stand-in has no Lab: chats are not asked to note ideas.`
      },
      {
        name: 'The browser pane',
        now: 'private',
        advice: 'keep-private',
        why: 'Web pages beside the chat (tabs, address bar), and a markup toolbar like the one in Claude (pick an element with its HTML, styles and React components; pen, shapes, steps, text; colours, widths; undo and redo) whose screenshot and notes go into a message.',
        tradeoff: `${MOVED} The public stand-in has no browser pane and no globe button.`
      },
      {
        name: 'Skills, plugins and approvals in the Market',
        now: 'private',
        advice: 'keep-private',
        why: 'Skills (SKILL.md folders) and plugins (tools and skills bundled, with prompts to try), made by chatting, in an editor, by upload or from the catalogue; approval levels with Allow/Deny before a tool runs.',
        tradeoff: `${MOVED} The public stand-in has no skills, no plugins, and tools run without asking.`
      },
      {
        name: 'Popular services and account sign-in',
        now: 'private',
        advice: 'keep-private',
        why: 'Official MCP servers of popular services (Notion, Linear, Atlassian, GitHub, Stripe…) ready to add, and signing in to their accounts (OAuth) with tokens kept encrypted on this PC; each shown with its official logo, fetched once from its own website and kept on this PC.',
        tradeoff: `${MOVED} The public stand-in has no Popular list and no account sign-in.`
      },
      {
        name: 'Chats following skills',
        now: 'public',
        advice: 'must-public',
        why: 'How ChatGPT chats see the skills list and open, read and save skills (main/skillsChat.ts), and ask before Market tools run.',
        tradeoff: 'Shows how skills are offered to ChatGPT; the skills themselves stay on your PC.'
      },
      {
        name: 'Chats using the browser',
        now: 'private',
        advice: 'keep-private',
        why: 'ChatGPT (tools loaded when a reply needs them) and Claude Code (through the tool bridge) open, read, click, type in and screenshot pages in the browser pane, with the pane showing what they do.',
        tradeoff: `${MOVED} The public stand-in gives chats no browser tools.`
      },
      {
        name: 'Kit tags in previews',
        now: 'private',
        advice: 'keep-private',
        why: 'Previews use design-kit components through <kit> tags filled in by Plotter (CSS scoped per component), and pieces a reply makes that the kit lacks are offered to add.',
        tradeoff: `${MOVED} The public stand-in shows previews as written, with no kit tags and no offers.`
      },
      {
        name: 'Claude Code members in group chats',
        now: 'private',
        advice: 'keep-private',
        why: 'A Claude Code role working in a group chat: its own session in the group’s folder, given only the group messages since its last turn.',
        tradeoff: `${MOVED} The public stand-in has no Claude Code members in groups.`
      },
      {
        name: 'Company page and org chart',
        now: 'private',
        advice: 'keep-private',
        why: 'Your company’s name, its projects at a glance, and who reports to whom among your roles.',
        tradeoff: `${MOVED} The public stand-in has no Company page, and roles are not told their place.`
      },
      {
        name: 'Design kit tools, versions and usage',
        now: 'private',
        advice: 'keep-private',
        why: 'The kit tools both chats use (catalog, record a use, save as an update, variant or alternative), every component’s version history, the log of where each piece was used, and the local link Claude Code calls them through.',
        tradeoff: MOVED
      },
      { name: 'Import from library', now: 'private', advice: 'keep-private', why: 'Gathers the files and pictures from your chats to attach again.', tradeoff: MOVED },
      { name: 'PDF export and preview', now: 'private', advice: 'keep-private', why: 'Prints a chat on this PC.', tradeoff: MOVED },
      { name: 'Picture viewer and drawing on pictures', now: 'private', advice: 'keep-private', why: 'Runs on this PC.', tradeoff: `${MOVED} The public stand-in still shows a picture full size, without the zoom or drawing.` }
    ]
  },
  {
    title: 'Public: uses your ChatGPT plan',
    lead: 'The code OpenAI’s open-source track covers. Keeping it public is what makes using your plan in Plotter fit the rules.',
    items: [
      {
        name: 'ChatGPT sign-in and plan usage',
        now: 'public',
        advice: 'must-public',
        why: 'Signs in with your ChatGPT account and sends requests on your plan.',
        tradeoff: 'Making it private would mean switching to a paid OpenAI API key instead of your plan.'
      },
      { name: 'Chat replies (streaming, reasoning level, web search)', now: 'public', advice: 'must-public', why: 'Every reply is a ChatGPT request.', tradeoff: 'Same as above.' },
      { name: 'Visuals in replies (charts, diagrams, maths, mockups)', now: 'public', advice: 'must-public', why: 'Part of how ChatGPT is asked to reply, and how its replies are drawn.', tradeoff: 'Same as above.' },
      { name: 'Memory, Run Python, Canvas, deep research', now: 'public', advice: 'must-public', why: 'Tools and modes ChatGPT uses during replies.', tradeoff: 'Same as above.' },
      { name: 'Connectors (Google, Notion)', now: 'public', advice: 'must-public', why: 'Tools ChatGPT calls during replies.', tradeoff: 'Same as above.' },
      { name: 'Chat titles and Tab suggestions', now: 'public', advice: 'must-public', why: 'Small ChatGPT requests made after replies.', tradeoff: 'Same as above.' },
      {
        name: 'Create project (the brief)',
        now: 'public',
        advice: 'must-public',
        why: 'ChatGPT sums the chat up into a brief (main/openai.ts). Handing it to Claude Code and making the new folder are private.',
        tradeoff: 'Shows how the brief is asked for, nothing of the Claude Code side.'
      },
      { name: 'Voice mode and dictation', now: 'public', advice: 'must-public', why: 'Voice mode sends your speech to ChatGPT, and needs dictation (speech to text) to do it.', tradeoff: 'Dictation stays with voice mode so the public app is complete.' },
      {
        name: 'Sending to the chat beside, and project memory, in ChatGPT replies',
        now: 'public',
        advice: 'must-public',
        why: 'Tools ChatGPT uses during replies: look at and send to the chat beside, save and forget project notes (main/assistant.ts).',
        tradeoff: 'Same as above.'
      },
      {
        name: 'Pictures in ChatGPT replies (drawn, or handed to the image model)',
        now: 'public',
        advice: 'must-public',
        why: 'The draw_picture and generate_image tools ChatGPT uses during replies (main/assistant.ts).',
        tradeoff: 'Shows that pictures can be drawn or made, not how the image model is called.'
      },
      {
        name: 'The + menu’s choices: image generation, web search, $tools',
        now: 'public',
        advice: 'must-public',
        why: 'They change what ChatGPT is asked to do for that message (main/assistant.ts).',
        tradeoff: 'Same as above.'
      },
      {
        name: 'Roles in ChatGPT replies',
        now: 'public',
        advice: 'must-public',
        why: 'How ChatGPT is told its role and given only that role’s tools, and how it fills in a new role (main/assistant.ts, main/openai.ts).',
        tradeoff: 'Shows that roles exist, not what yours say (they stay on this PC).'
      },
      {
        name: 'Team chats',
        now: 'public',
        advice: 'must-public',
        why: 'ChatGPT picks who speaks next and each member replies as its role (main/team.ts, main/assistant.ts).',
        tradeoff: 'Shows how team chats take turns, not what your roles say.'
      },
      {
        name: 'Roles reviewed and combined by ChatGPT',
        now: 'public',
        advice: 'must-public',
        why: 'How a role says it lacked a tool, the "Suggest tools" review, making a role by chatting, the draft of a combined role, and a role’s per-project tools and notes in its replies are ChatGPT parts (main/assistant.ts, main/openai.ts, main/projects.ts).',
        tradeoff: 'Shows how roles are reviewed and combined, not your roles themselves.'
      },
      {
        name: 'Who answers in a group chat',
        now: 'public',
        advice: 'must-public',
        why: 'ChatGPT decides who an untagged group message is for, and after a round which members who sat it out may be needed (main/team.ts); the routing tests are in main/routeTests.ts.',
        tradeoff: 'Shows how a group picks who answers, not your roles or chats.'
      },
      {
        name: 'Lab tests run by ChatGPT',
        now: 'public',
        advice: 'must-public',
        why: 'How a chat notes an untested idea at the end of a reply, and how a test runs: ChatGPT checking a claim with Python or the web, or the same task done several ways, measured, then judged (main/assistant.ts, main/labRun.ts).',
        tradeoff: 'Shows how ideas are tested, not your ideas or results.'
      },
      {
        name: 'Recruiter: the team a project needs',
        now: 'public',
        advice: 'must-public',
        why: 'When a project is made, ChatGPT suggests the roles it needs (reusing yours where they fit) with their tools and skills, and adding one puts it to work there (main/recruit.ts, main/openai.ts). The built-in Recruiter role itself is kept with the private roles.',
        tradeoff: 'Shows how a team is suggested, not your projects or roles.'
      },
      {
        name: 'Your design kit in ChatGPT replies',
        now: 'public',
        advice: 'must-public',
        why: 'How ChatGPT is told your rules and components, and how it is handed the kit tools (main/assistant.ts). The tools themselves are private.',
        tradeoff: 'Shows that a kit is used, not what is in yours (that stays on this PC).'
      },
      {
        name: 'Handing Market tools to a ChatGPT reply',
        now: 'public',
        advice: 'must-public',
        why: 'The one piece of the Market inside a ChatGPT request (main/marketChat.ts).',
        tradeoff: 'Shows that connected tools are offered to ChatGPT, nothing about which tools or how they work.'
      }
    ]
  },
  {
    title: 'Public: kept public on purpose',
    lead: 'These don’t use ChatGPT, but hiding them would cost more than it gains.',
    items: [
      {
        name: 'Two chats side by side, drag and drop',
        now: 'public',
        advice: 'stay-public',
        why: 'Woven into the app’s main layout.',
        tradeoff: 'Moving it would mean restructuring the app for little benefit; no effect on speed either way.'
      },
      { name: 'Chat list: pin, rename, archive, search', now: 'public', advice: 'stay-public', why: 'Ordinary app plumbing.', tradeoff: 'Low value to hide.' },
      {
        name: 'Projects: the list, the project page and where notes are kept',
        now: 'public',
        advice: 'stay-public',
        why: 'Part of the chat list, and the ChatGPT side reads the notes from it.',
        tradeoff: 'The page could move to the private folder, but the store must stay where ChatGPT’s code can reach it. Little to gain.'
      },
      { name: 'Settings, themes, characters and look', now: 'public', advice: 'stay-public', why: 'Appearance and preferences.', tradeoff: 'Low value to hide.' },
      {
        name: 'The hooks for the private parts',
        now: 'public',
        advice: 'stay-public',
        why: 'A few lines in the chat code that call the private features, and the stand-ins that switch them off.',
        tradeoff: 'They show the features exist, not how they work.'
      }
    ]
  }
]

export const ADVICE_LABEL: Record<Advice, string> = {
  'keep-private': 'Private',
  'must-public': 'Keep public',
  'stay-public': 'Public by choice'
}
