// Local (glass build): the Branches view leaves out merges into a pull request's branch (Paweł,
// 2026-11-27: "dont show merges to pr branches, like merged test into pr ... it obscures the
// view"). Bringing the base branch into a PR ("Merge remote-tracking branch 'origin/test' into
// feature-x", "chore: merge origin/test into feature-x") says nothing about how branches split and
// came back together, so such a merge folds into the PR's line like a plain commit and its line
// back to the base is not drawn; the same for a stack's lower PR merged into the upper one.
// Merges into long-lived branches (pinned ones, main, develop, …, a branch that takes in several)
// and GitHub's "Merge pull request #N" landings always stay.
//
// The branch a merge went into comes from its message, never from the graph's lane names: a line
// that carries other branches (backups of an integration branch, a PR started at an unpinned
// test's tip) takes their names further down, so one branch reads as many.
import type { GitHistoryItem } from '../../../../../shared/git/history/git-history-types'
import { gitGraphMergedBranchName } from './git-graph-lane-names'

/** "merge <source> into <target>", the way git, GitHub's Update branch and people write it. */
export function gitGraphMergeSourceAndTarget(
  subject: string
): { source: string; target: string } | undefined {
  // A note after the target stays out of it: "… into local/glass (1199 upstream commits)".
  const match =
    /\bmerge (?:remote-tracking )?(?:branch )?'?([^'\s]+)'?(?: of \S+)? into '?([^'\s]+?)'?(?:\s+\([^)]*\))?\s*$/i.exec(
      subject
    )
  return match ? { source: match[1]!, target: match[2]! } : undefined
}

/** The branch a merge with no "into" took in: "Merge origin/main", "Merge branch 'main'; …". */
function mergedBranchWithoutTarget(subject: string): string | undefined {
  return (
    gitGraphMergedBranchName(subject) ??
    /^merge (?:remote-tracking )?(?:branch )?'?([^'\s;:,]+)'?(?:[;,]|\s*$)/i.exec(subject)?.[1]
  )
}

/**
 * The merges the Branches view folds: two-parent merges into a branch that is not long-lived,
 * where the commit taken in still shows on a line of its own (it carries a branch, or its line
 * goes on), so leaving the merge out loses no commit from the view.
 */
export function gitGraphSyncMerges(
  items: readonly GitHistoryItem[],
  laneNames: ReadonlyMap<string, string>,
  /** Long-lived branches: the pinned ones and main, develop and the like. */
  trunks: readonly string[]
): Set<string> {
  const remotes = new Set<string>()
  const byId = new Map<string, GitHistoryItem>()
  const continues = new Set<string>()
  for (const item of items) {
    byId.set(item.id, item)
    if (item.parentIds[0]) {
      continues.add(item.parentIds[0])
    }
    for (const ref of item.references ?? []) {
      const slash = ref.name.indexOf('/')
      if (ref.category === 'remote branches' && slash > 0) {
        remotes.add(ref.name.slice(0, slash))
      }
    }
  }
  // `origin/test` → `test`; a branch name with a slash of its own keeps it.
  const branchOf = (name: string): string => {
    const slash = name.indexOf('/')
    return slash > 0 && remotes.has(name.slice(0, slash)) ? name.slice(slash + 1) : name
  }
  const merges = items
    .filter((item) => item.parentIds.length === 2)
    .map((item) => {
      const named = gitGraphMergeSourceAndTarget(item.subject)
      return {
        item,
        target: named ? branchOf(named.target) : undefined,
        source: named ? branchOf(named.source) : undefined
      }
    })
  // A branch that takes in two or more others is an integration branch (local/orca-glass, a
  // consolidation branch), like a long-lived one: merges into it stay. A stack's upper PR takes in
  // only its lower one, so its merges fold. A pull of a branch's own remote copy ("Merge branch
  // 'x' of github.com:o/r into x") does not count.
  const takenInBy = new Map<string, Set<string>>()
  for (const { source, target } of merges) {
    if (source && target && source !== target) {
      takenInBy.set(target, (takenInBy.get(target) ?? new Set()).add(source))
    }
  }
  const longLived = (branch: string): boolean =>
    trunks.includes(branch) || (takenInBy.get(branch)?.size ?? 0) > 1
  const folded = new Set<string>()
  for (const { item, target } of merges) {
    if (/^Merge pull request #\d+/.test(item.subject)) {
      continue
    }
    let sync: boolean
    if (target) {
      sync = !longLived(target)
    } else {
      // No "into": a long-lived branch taken in ("Merge origin/main") can only have gone into
      // another branch; it is a sync unless the line it sits on is long-lived itself.
      const source = mergedBranchWithoutTarget(item.subject)
      const lane = laneNames.get(item.id)
      sync = !!source && trunks.includes(branchOf(source)) && !(lane && longLived(lane))
    }
    const takenIn = item.parentIds[1]!
    const taken = byId.get(takenIn)
    const shownElsewhere = !taken || (taken.references?.length ?? 0) > 0 || continues.has(takenIn)
    if (sync && shownElsewhere) {
      folded.add(item.id)
    }
  }
  return folded
}
