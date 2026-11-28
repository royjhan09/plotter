import type { CatalogEntry, PluginInfo, PopularService } from '../../shared/api'

/** Public stand-in for plugins (in Plotter's private folder): none in this build. */
export const PLUGINS = false
const OFF = 'Plugins are not part of this build.'

export const listPlugins = (): PluginInfo[] => []
export function savePlugin(_p: Omit<PluginInfo, 'id' | 'addedAt' | 'source'> & { id?: string }, _source?: PluginInfo['source']): PluginInfo[] {
  throw new Error(OFF)
}
export const removePlugin = (_id: string): PluginInfo[] => []
export const setPluginIcon = (_id: string, _icon: string | null): PluginInfo[] => []
export function uploadPlugin(_input: { zip?: string; files?: { path: string; base64: string }[] }): PluginInfo[] {
  throw new Error(OFF)
}
export const catalog = (): CatalogEntry[] => []
export function addFromCatalog(_kind: 'skill' | 'plugin', _id: string): void {
  throw new Error(OFF)
}
export const popular = (): PopularService[] => []
export function addPopular(_id: string, _key?: string): string {
  throw new Error(OFF)
}
export const popularIcons = async (): Promise<Record<string, string>> => ({})
