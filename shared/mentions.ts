/** Group chats: who a message tags, and the key a Claude Code member's run goes by. */

/**
 * The members a message tags with @Name (any case; the longest name wins, so "@Backend engineer" is not read as
 * "@Backend"). Tags inside code are not tags. In the order they appear, each once.
 */
export function mentionsIn(text: string, members: { id: string; name: string }[]): string[] {
  const plain = text.replace(/```[\s\S]*?(```|$)/g, ' ').replace(/`[^`\n]*`/g, ' ')
  const lower = plain.toLowerCase()
  const byLength = [...members].filter((m) => m.name.trim()).sort((a, b) => b.name.length - a.name.length)
  const found: string[] = []
  for (let i = lower.indexOf('@'); i >= 0; i = lower.indexOf('@', i + 1)) {
    // an @ inside a word (an email address) is not a tag
    if (i > 0 && /[\p{L}\p{N}._-]/u.test(lower[i - 1]!)) continue
    const rest = lower.slice(i + 1)
    const hit = byLength.find((m) => {
      const name = m.name.trim().toLowerCase()
      return rest.startsWith(name) && !/[\p{L}\p{N}]/u.test(rest[name.length] ?? '')
    })
    if (hit && !found.includes(hit.id)) found.push(hit.id)
  }
  return found
}

/** A Claude Code member's run in a group chat goes by this key (to stop it, and so two never run at once). */
export const memberKey = (chatId: string, roleId: string): string => `${chatId}::${roleId}`
