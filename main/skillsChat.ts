import type { PluginInfo, SkillInfo } from '../shared/api'
import type { LocalTool } from './openai'
import { enabledSkills, getSkill, readSkillFile, recordSkillUse, saveSkill, skillCheck } from '@private/main/skills'
import { listPlugins, savePlugin } from '@private/main/plugins'
import { listMarket } from '@private/main/market'

/**
 * Skills in ChatGPT chats (public: it is how Plotter uses ChatGPT; the skills themselves are kept in the private
 * Market). As in ChatGPT, the model always sees each enabled skill's name and description (one short list,
 * which changes only when skills do, so it stays cached) and opens a skill when a job matches: open_skill gives
 * its instructions and file list; read_skill_file reads a reference or script when a step needs it. Opening
 * skill-creator or plugin-creator adds the tool that saves what was made (so those tools cost nothing otherwise).
 */

const MAX_LISTED = 40

export const SKILLS_INTRO = (skills: SkillInfo[]): string =>
  `Skills (the user's manuals for specific jobs): before a job that matches one, open it with open_skill and follow it; read its other files with read_skill_file when a step needs them (scripts: run with run_python).
${skills
  .slice(0, MAX_LISTED)
  .map((s) => `- ${s.name}: ${s.description.replace(/\s+/g, ' ').slice(0, 260)}`)
  .join('\n')}${skills.length > MAX_LISTED ? `\n(and ${skills.length - MAX_LISTED} more: open_skill works with any skill name)` : ''}`

function saveSkillTool(): LocalTool {
  return {
    name: 'save_skill',
    description: 'Save a skill to the user\'s Market (a new one, or the same name again to update it). Only after the user agreed to the draft.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'lowercase-words-with-hyphens' },
        description: { type: 'string', description: 'What it does and when to use it, in the user\'s words (under 300 characters).' },
        instructions: { type: 'string', description: 'The body of SKILL.md (Markdown).' },
        files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string', description: 'e.g. references/checklist.md or scripts/tally.py' }, content: { type: 'string' } }, required: ['path', 'content'] } }
      },
      required: ['name', 'description', 'instructions']
    },
    label: () => 'Saving the skill…',
    run: async (args) => {
      try {
        const s = saveSkill(
          { name: String(args['name'] ?? ''), description: String(args['description'] ?? ''), body: String(args['instructions'] ?? ''), files: Array.isArray(args['files']) ? (args['files'] as { path: string; content: string }[]) : [] },
          'chat'
        )
        // the check on what was saved: common mistakes to fix (save again under the same name)
        const warnings = skillCheck({ name: String(args['name'] ?? ''), description: String(args['description'] ?? ''), body: String(args['instructions'] ?? '') }, s.files)
        return { output: JSON.stringify({ saved: s.name, files: s.files, ...(warnings.length ? { check: warnings } : {}) }), run: { kind: 'skill', title: 'Saved a skill to your Market', output: s.name } }
      } catch (e) {
        return { output: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }) }
      }
    }
  }
}

/** What a plugin's page still lacks, for the plugin-creator to offer (never to insist on). */
const pageGaps = (p: PluginInfo): string => {
  const gaps = [!p.about && 'about', !p.features?.length && 'main uses', p.examples.length < 2 && 'prompts', !p.category && 'category', !p.website && 'website', p.madeIcon && 'own logo'].filter(Boolean)
  return gaps.length ? ` (page could add: ${gaps.join(', ')})` : ''
}

function savePluginTool(): LocalTool {
  return {
    name: 'save_plugin',
    description: "Save a plugin to the user's Market: their tools and skills bundled, with example prompts and, if the user gave them, its page details. Saving under the name of one of their plugins updates it (fields left out stay as they are). Only after the user agreed to it.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string', description: 'What it is for, one line.' },
        examples: { type: 'array', items: { type: 'string' }, description: 'Two or three prompts to try it, in the user\'s words.' },
        tools: { type: 'array', items: { type: 'string' }, description: 'Names of Market tools to include.' },
        skills: { type: 'array', items: { type: 'string' }, description: 'Names of skills to include.' },
        about: { type: 'string', description: 'Optional page detail: a short paragraph on what it does and for whom.' },
        features: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string' } }, required: ['title', 'text'] }, description: 'Optional: two to four main uses, a short title and one line each.' },
        category: { type: 'string', description: 'Optional: e.g. Productivity, Writing, Developer tools, Design, Finance, Research.' },
        website: { type: 'string', description: 'Optional: a https link about it.' }
      },
      required: ['name', 'description']
    },
    label: () => 'Saving the plugin…',
    run: async (args) => {
      try {
        const names = (k: string): string[] => (Array.isArray(args[k]) ? (args[k] as unknown[]).map((x) => String(x).toLowerCase()) : [])
        const tools = listMarket().filter((t) => names('tools').includes(t.name.toLowerCase()))
        const skills = enabledSkills().filter((s) => names('skills').includes(s.name.toLowerCase()))
        const page = Object.fromEntries((['about', 'features', 'category', 'website'] as const).filter((k) => args[k] !== undefined).map((k) => [k, args[k]]))
        const have = listPlugins().find((p) => p.name.toLowerCase() === String(args['name'] ?? '').trim().toLowerCase())
        savePlugin(
          {
            name: String(args['name'] ?? ''),
            description: String(args['description'] ?? ''),
            examples: names('examples').length ? (args['examples'] as string[]) : [],
            // updating one: tools and skills left out stay as they were
            toolIds: names('tools').length || !have ? tools.map((t) => t.id) : have.toolIds,
            skillIds: names('skills').length || !have ? skills.map((s) => s.id) : have.skillIds,
            ...page
          },
          'chat'
        )
        return { output: JSON.stringify({ saved: args['name'], tools: tools.map((t) => t.name), skills: skills.map((s) => s.name) }), run: { kind: 'skill', title: 'Saved a plugin to your Market', output: String(args['name'] ?? '') } }
      } catch (e) {
        return { output: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }) }
      }
    }
  }
}

/** The skills part of a ChatGPT reply's set-up: the list, and the tools that open and read skills. */
export function skillSetup(): { instructions: string; tools: LocalTool[] } | null {
  let skills: SkillInfo[]
  try {
    skills = enabledSkills()
  } catch {
    return null
  }
  if (!skills.length) return null
  const openSkill: LocalTool = {
    name: 'open_skill',
    description: 'Open a skill: its instructions and file list.',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    label: (a) => `Opening the ${String(a['name'] ?? '')} skill…`,
    run: async (args) => {
      try {
        const s = getSkill(String(args['name'] ?? ''))
        if (!s.enabled) return { output: JSON.stringify({ error: `${s.name} is switched off in the Market.` }) }
        recordSkillUse(s.id)
        const files = s.files.filter((f) => f.toLowerCase() !== 'skill.md')
        let extra = ''
        const addTools: LocalTool[] = []
        if (s.name === 'skill-creator') addTools.push(saveSkillTool())
        if (s.name === 'plugin-creator') {
          addTools.push(savePluginTool())
          const tools = listMarket()
          const plugins = listPlugins()
          extra = `\n\nWhat the user has now:\n- Market tools: ${tools.map((t) => `${t.name} (${t.description.slice(0, 100)})`).join('; ') || 'none'}\n- Skills: ${enabledSkills()
            .map((x) => x.name)
            .join(', ')}\n- Plugins: ${plugins.map((p) => `${p.name}${p.source === 'chat' || p.source === 'you' ? pageGaps(p) : ''}`).join(', ') || 'none'}`
        }
        return {
          output: `# Skill: ${s.name}\n${s.body}${files.length ? `\n\nIts files (read with read_skill_file when a step needs one): ${files.join(', ')}` : ''}${extra}`,
          run: { kind: 'skill', title: 'Followed a skill', output: s.name },
          ...(addTools.length ? { addTools } : {})
        }
      } catch (e) {
        return { output: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }) }
      }
    }
  }
  const readFile: LocalTool = {
    name: 'read_skill_file',
    description: 'Read one file of a skill.',
    parameters: { type: 'object', properties: { name: { type: 'string' }, path: { type: 'string' } }, required: ['name', 'path'] },
    label: (a) => `Reading ${String(a['path'] ?? '')}…`,
    run: async (args) => {
      try {
        return { output: readSkillFile(String(args['name'] ?? ''), String(args['path'] ?? '')) }
      } catch (e) {
        return { output: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }) }
      }
    }
  }
  return { instructions: SKILLS_INTRO(skills), tools: [openSkill, readFile] }
}
