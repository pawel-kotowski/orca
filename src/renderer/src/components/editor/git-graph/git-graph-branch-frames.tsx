// Local (glass build): in the Detailed view a branch's commits sit in a frame of the branch's
// colour, from its tip (where its name is) down its line for as long as its commits follow one
// another (Paweł, 2026-11-17: the name line above a tip read as belonging to the commit above it,
// "can we wrap commits for given branch in frame in color of branch?"). The frame covers the
// text columns only, so the lanes stay as they are; pinned branches (main, development) have
// their own column and get no frame.
import React from 'react'
import { graphColor } from '@/components/right-sidebar/source-control/sync/git-history-graph-svg'
import type { GitHistoryGraphColorId } from '../../../../../shared/git/history/git-history-types'
import type { GitGraphLaneRow } from './git-graph-branch-layout'

export type GitGraphBranchRun = { start: number; end: number; color: GitHistoryGraphColorId }

const hasBranchName = (row: GitGraphLaneRow): boolean =>
  (row.historyItem.references ?? []).some((ref) => ref.category !== 'tags')

/** Runs of rows on one branch: a tip with a branch name, then its first parents in a row. */
export function gitGraphBranchRuns(
  rows: readonly GitGraphLaneRow[],
  laneNames: ReadonlyMap<string, string>,
  pinned: readonly string[]
): GitGraphBranchRun[] {
  const runs: GitGraphBranchRun[] = []
  let index = 0
  while (index < rows.length) {
    const tip = rows[index]!
    const branch = laneNames.get(tip.historyItem.id)
    if (!branch || pinned.includes(branch) || !hasBranchName(tip)) {
      index += 1
      continue
    }
    let end = index
    while (end + 1 < rows.length) {
      const next = rows[end + 1]!
      // The run ends where its line leaves the list's order, or another branch's name begins.
      if (
        rows[end]!.historyItem.parentIds[0] !== next.historyItem.id ||
        laneNames.get(next.historyItem.id) !== branch ||
        hasBranchName(next)
      ) {
        break
      }
      end += 1
    }
    runs.push({ start: index, end, color: tip.nodeColor })
    index = end + 1
  }
  return runs
}

export function GitGraphBranchFrame({
  color,
  left,
  children
}: {
  color: GitHistoryGraphColorId
  /** Where the text columns start: the graph column's width plus the grid gap. */
  left: number
  children: React.ReactNode
}): React.JSX.Element {
  const inset = { left: left - 6, right: 4, top: 2, bottom: 2 }
  return (
    <div data-git-graph-branch-frame className="relative isolate">
      <div
        aria-hidden
        className="pointer-events-none absolute -z-10 rounded-lg opacity-[0.09]"
        style={{ ...inset, background: graphColor(color) }}
      />
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-lg border opacity-80"
        style={{ ...inset, borderColor: graphColor(color) }}
      />
    </div>
  )
}
