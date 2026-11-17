// Local (glass build): what a Branches-view row says instead of a commit message (Paweł,
// 2026-11-17: "an easy way to see just branches without commit messages to understand the big
// merging picture"). A merge names the branch it took in, a fork point the line it is on, and a
// quiet number says how many commits the row stands for ("the number of commits could stay
// visible always ... but not with word commits - it repeats too much"). Nothing here is a button:
// the whole row opens its commits.
import React from 'react'
import { GitFork, GitMerge } from 'lucide-react'
import type { GitHistoryGraphColorId } from '../../../../../shared/git/history/git-history-types'
import { graphColor } from '@/components/right-sidebar/source-control/sync/git-history-graph-svg'
import type { GitGraphLaneRow } from './git-graph-branch-layout'
import { useGitGraphBranchColour } from './git-graph-branch-colour-context'
import type { GitGraphSegment } from './git-graph-segment-commits'

export function GitGraphCount({
  count,
  title
}: {
  count: number
  title: string
}): React.JSX.Element {
  return (
    <span
      title={title}
      className="rounded-full bg-foreground/[0.07] px-1.5 text-[10.5px] leading-4 text-muted-foreground tabular-nums"
    >
      {count}
    </span>
  )
}

function BranchName({
  name,
  color
}: {
  name: string
  color?: GitHistoryGraphColorId
}): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 font-medium text-foreground">
      {color && (
        <span
          aria-hidden
          className="size-1.5 rounded-full"
          style={{ background: graphColor(color) }}
        />
      )}
      <span className="break-all">{name}</span>
    </span>
  )
}

export function GitGraphOutlineSummary({
  row,
  laneName,
  mergedName,
  segments,
  hasRefs
}: {
  row: GitGraphLaneRow
  laneName?: string
  mergedName?: string
  segments: GitGraphSegment[]
  hasRefs: boolean
}): React.JSX.Element {
  const branchColour = useGitGraphBranchColour()
  const merged = row.historyItem.parentIds.length > 1
  const mergedColor = merged
    ? row.outputSwimlanes.find((lane) => lane.id === row.historyItem.parentIds[1])?.color
    : undefined
  const [own, ...mergedIn] = segments
  const mergedCount = mergedIn.reduce((sum, segment) => sum + segment.ids.length, 0)
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-muted-foreground">
      {merged && (
        <span className="inline-flex flex-wrap items-center gap-1">
          <GitMerge className="size-3.5 shrink-0" />
          merged{' '}
          {mergedName ? (
            <BranchName name={mergedName} color={branchColour(mergedName, mergedColor)} />
          ) : (
            'a branch'
          )}
          {mergedCount > 0 && (
            <GitGraphCount count={mergedCount} title={`${mergedCount} commits merged in`} />
          )}
          {laneName && !hasRefs && (
            <>
              into <BranchName name={laneName} color={row.nodeColor} />
            </>
          )}
        </span>
      )}
      {!merged && !hasRefs && (
        <span className="inline-flex items-center gap-1">
          <GitFork className="size-3.5 shrink-0" />
          {laneName ? (
            <>
              fork on <BranchName name={laneName} color={row.nodeColor} />
            </>
          ) : (
            'fork point'
          )}
        </span>
      )}
      {/* A lone commit needs no count: a "1" on every stacked branch is noise. */}
      {own && own.ids.length > 1 && (
        <GitGraphCount
          count={own.ids.length}
          title={`${own.ids.length} commit${own.ids.length === 1 ? '' : 's'} on this line down to the next branch point. Hover or click the row to see them.`}
        />
      )}
    </span>
  )
}
