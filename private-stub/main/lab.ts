import type { LabIdea, LabResult, LabState } from '../../shared/api'

/** Public stand-in for the Lab's store (private add-on): keeps nothing, and chats are not asked to note ideas. */

const MOVED = 'The Lab is part of the private add-ons.'

export const readLab = (): LabState => ({ ideas: [], capture: false })
export const labCapture = (): boolean => false
export const setLabCapture = (_on: boolean): LabState => readLab()
export const noteIdea = (_idea: { title: string; claim: string; consider?: string[] }, _from: LabIdea['from']): void => undefined
export const addIdea = (_idea: { title: string; claim: string }): LabState => {
  throw new Error(MOVED)
}
export const updateIdea = (_id: string, _change: Partial<LabIdea>): LabState => {
  throw new Error(MOVED)
}
export const getIdea = (_id: string): LabIdea | undefined => undefined
export const removeIdea = (_id: string): LabState => readLab()
export const setLabResult = (_id: string, _result: LabResult): void => undefined
export const labResults = (): LabResult[] => []
