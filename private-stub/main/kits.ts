import type { Brand, BrandPatch, BrandSummary, Kit, KitComponent, KitPatch, KitRule, KitSummary, KitUse } from '../../shared/api'

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
export const saveComponent = (_id: string, _c: Partial<KitComponent> & { name: string; code: string }, _by?: string, _note?: string): Kit => off()
export const removeComponent = (_id: string, _componentId: string): Kit => off()
export const kitFolder = (_id: string): string => off()
export const kitFor = (_projectKitId?: string): Kit | null => null
export const kitBrief = (_kit: Kit, _brand?: Brand | null): string => ''
export const listBrands = (): BrandSummary[] => []
export const getBrand = (_id: string): Brand => off()
export const createBrand = (_name: string, _copyFrom?: string): Brand => off()
export const updateBrand = (_id: string, _patch: BrandPatch): Brand => off()
export const removeBrand = (_id: string): BrandSummary[] => []
export const setDefaultBrand = (_id: string): BrandSummary[] => []
export const saveBrandRule = (_id: string, _rule: Partial<KitRule> & { text: string }): Brand => off()
export const removeBrandRule = (_id: string, _ruleId: string): Brand => off()
export const brandFor = (_projectBrandId?: string, _projectKitId?: string): Brand | null => null
export const brandFolder = (_id: string): string => off()
export const slugOf = (name: string): string => name
export const listUsage = (_kitId: string): KitUse[] => []
export const versionCode = (_kitId: string, _componentId: string, _version: number): string => off()
export const restoreVersion = (_kitId: string, _componentId: string, _version: number): Kit => off()
export const addUseWhen = (_kitId: string, _componentId: string, _situation: string): Kit => off()
