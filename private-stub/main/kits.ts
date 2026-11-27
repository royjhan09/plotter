import type { Kit, KitComponent, KitPatch, KitRule, KitSummary } from '../../shared/api'

/** Public stand-in for design kits (in Plotter's private folder): switched off. */
export const KITS = false

const OFF = 'Design kits are not part of this build.'
const off = (): never => {
  throw new Error(OFF)
}

export const listKits = (): KitSummary[] => []
export const getKit = (_id: string): Kit => off()
export const createKit = (_name: string, _copyFrom?: string): Kit => off()
export const updateKit = (_id: string, _patch: KitPatch): Kit => off()
export const removeKit = (_id: string): KitSummary[] => []
export const setDefaultKit = (_id: string): KitSummary[] => []
export const saveRule = (_id: string, _rule: Partial<KitRule> & { text: string }): Kit => off()
export const removeRule = (_id: string, _ruleId: string): Kit => off()
export const saveComponent = (_id: string, _c: Partial<KitComponent> & { name: string; code: string }, _by?: string): Kit => off()
export const removeComponent = (_id: string, _componentId: string): Kit => off()
export const kitFolder = (_id: string): string => off()
export const kitFor = (_projectKitId?: string): Kit | null => null
export const kitBrief = (_kit: Kit): string => ''
export const slugOf = (name: string): string => name
