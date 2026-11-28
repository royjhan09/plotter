import type { SkillDetail, SkillDraft, SkillInfo } from '../../shared/api'

/** Public stand-in for skills (in Plotter's private folder): none in this build. */
export const SKILLS = false
const OFF = 'Skills are not part of this build.'

export const skillsRoot = (): string => ''
export const listSkills = (): SkillInfo[] => []
export const enabledSkills = (): SkillInfo[] => []
export function getSkill(_id: string): SkillDetail {
  throw new Error(OFF)
}
export function readSkillFile(_id: string, _path: string): string {
  throw new Error(OFF)
}
export function saveSkill(_d: SkillDraft, _source?: SkillInfo['source'], _pluginId?: string): SkillInfo {
  throw new Error(OFF)
}
export const setSkillEnabled = (_id: string, _on: boolean): SkillInfo[] => []
export const removeSkill = (_id: string): SkillInfo[] => []
export const recordSkillUse = (_id: string): void => undefined
export const skillCheck = (_draft: { name: string; description: string; body?: string }, _files?: string[]): string[] => []
export const downloadSkill = (_id: string): { name: string; zip: string } => {
  throw new Error('Skills are not part of this build.')
}
export function uploadSkills(_input: { zip?: string; files?: { path: string; base64: string }[] }): SkillInfo[] {
  throw new Error(OFF)
}
