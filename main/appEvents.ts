import type { SideDelivery } from '../shared/api'

/** Events the main process sends to the window from deep inside a reply (set up once by index.ts). */
let emitter: (channel: string, payload: unknown) => void = () => undefined

export function setAppEmitter(fn: (channel: string, payload: unknown) => void): void {
  emitter = fn
}

/** One chat sent something to the chat beside it. */
export const deliverToSide = (d: SideDelivery): void => emitter('side:deliver', d)

/** A project's chats or shared memory changed. */
export const projectsChanged = (): void => emitter('projects:changed', {})
