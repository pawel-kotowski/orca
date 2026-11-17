// Local (glass build): highlighting every merge into chosen branches (Paweł, 2026-11-17: "i also
// need a way to quickly highlight all merges to development and to main"). The toolbar's "Merges
// into" toggles pick the branches (the pinned ones are offered); a merge into one of them is
// framed in that branch's colour and every other row fades; n and Shift+N step through them.
import { useCallback, useState } from 'react'
import type { GitGraphLaneRow } from './git-graph-branch-layout'
import { gitGraphMergedPullRequest } from './git-graph-lane-names'

/**
 * A merge on one of the target branches' lines: a merge commit, or a pull request squashed into
 * one commit ("… (#1145)"; aikros lands every PR that way and has no merge commits at all, so
 * "Merges into development" found nothing there, 2026-11-17).
 */
export function isGitGraphMergeInto(
  row: GitGraphLaneRow,
  laneNames: ReadonlyMap<string, string>,
  targets: readonly string[]
): boolean {
  const item = row.historyItem
  if (
    targets.length === 0 ||
    (item.parentIds.length < 2 && !gitGraphMergedPullRequest(item.subject))
  ) {
    return false
  }
  const lane = laneNames.get(row.historyItem.id)
  return lane !== undefined && targets.includes(lane)
}

export function useGitGraphMergeMarks(): {
  targets: string[]
  toggle: (branch: string) => void
  clear: () => void
} {
  const [targets, setTargets] = useState<string[]>([])
  const toggle = useCallback((branch: string) => {
    setTargets((current) =>
      current.includes(branch) ? current.filter((name) => name !== branch) : [...current, branch]
    )
  }, [])
  return { targets, toggle, clear: useCallback(() => setTargets([]), []) }
}

/** The highlighted merge after (step 1) or before (step -1) the row `fromId`, wrapping around. */
export function nextGitGraphMark(
  rows: readonly GitGraphLaneRow[],
  laneNames: ReadonlyMap<string, string>,
  targets: readonly string[],
  fromId: string | null,
  step: 1 | -1
): string | undefined {
  const at = rows.findIndex((row) => row.historyItem.id === fromId)
  const marked = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => isGitGraphMergeInto(row, laneNames, targets))
  const target =
    step > 0
      ? (marked.find(({ index }) => index > at) ?? marked[0])
      : (marked.findLast(({ index }) => index < at) ?? marked.at(-1))
  return target?.row.historyItem.id
}
