import type { Attachment, LibraryItem, LibraryRef } from '../../shared/api'

/** Public stand-in for the library (in Plotter's private folder): switched off. */
export const LIBRARY = false

export const listLibrary = (): LibraryItem[] => []

export function getLibraryItem(_ref: LibraryRef): Attachment {
  throw new Error('The library is not part of this build.')
}
