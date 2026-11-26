import type { ImageKeyStatus, ImageOptions } from '../../shared/api'

/** Public stand-in for the image model (in Plotter's private folder): switched off. Drawn pictures still work. */
export const IMAGES = false

const OFF = 'The image model is not part of this build.'
const options: ImageOptions = { model: '', quality: 'medium' }

export const readImageOptions = (): ImageOptions => options
export const setImageOptions = (_patch: Partial<ImageOptions>): ImageOptions => options
export const imageKeyStatus = (): ImageKeyStatus => ({ set: false, options, models: [] })
export async function setImageKey(_raw: string): Promise<ImageKeyStatus> {
  throw new Error(OFF)
}
export const clearImageKey = (): ImageKeyStatus => imageKeyStatus()
export const imageKeyForRun = (): string | null => null

export interface ImageAsk {
  prompt: string
  size?: string
  quality?: string
  transparent?: boolean
}

export async function generateWithKey(_ask: ImageAsk, _signal?: AbortSignal): Promise<string> {
  throw new Error(OFF)
}
