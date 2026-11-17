// Local (glass build): Find in the classic Git Graph: the next loaded commit after `fromId` (folded
// in the Branches view or not) whose subject, message, author, hash or branch names hold the text.
import type { GitHistoryItem } from '../../../../../shared/git/history/git-history-types'

export function findGitGraphCommit(
  items: readonly GitHistoryItem[],
  query: string,
  fromId: string | null
): string | undefined {
  const needle = query.trim().toLowerCase()
  if (!needle || items.length === 0) {
    return undefined
  }
  const start = items.findIndex((item) => item.id === fromId)
  for (let offset = 1; offset <= items.length; offset += 1) {
    const item = items[(start + offset) % items.length]!
    const haystack = [
      item.subject,
      item.message,
      item.author,
      item.id,
      ...(item.references ?? []).map((ref) => ref.name)
    ]
      .join('\n')
      .toLowerCase()
    if (haystack.includes(needle)) {
      return item.id
    }
  }
  return undefined
}
