/** Public stand-in for kit tags in previews (in Plotter's private folder): previews are shown as written. */
export const KIT_TAGS = false

export const expandKitTags = async (html: string, _projectId?: string | null): Promise<string> => html

export const kitNewIn = (_text: string): { name: string; inner: string }[] => []

export function KitOffers(_p: { text: string; projectId?: string | null; chatTitle?: string }): React.JSX.Element | null {
  return null
}
