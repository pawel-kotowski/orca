// Local (glass build): what a Branches-view row says instead of a commit message (Paweł,
// 2026-11-17: "an easy way to see just branches without commit messages to understand the big
// merging picture"). A tip names its branches; a merge names the branch it took in and how many
// commits came with it; a fork point names the line it is on. "+N commits" opens those commits in
// the Detailed view.
import React from 'react'
import { ChevronsDown, GitFork, GitMerge } from 'lucide-react'
import type { GitHistoryItemViewModel } from '../../../../../shared/git/history/git-history-graph'
import type { GitHistoryGraphColorId } from '../../../../../shared/git/history/git-history-types'
import { graphColor } from '@/components/right-sidebar/source-control/sync/git-history-graph-svg'
import { gitGraphMergedBranchName } from './git-graph-lane-names'
import { gitGraphEdgeKey } from './git-graph-outline'

function plural(count: number): string {
  return `${count} commit${count === 1 ? '' : 's'}`
}

export function GitGraphOutlineSummary({
  viewModel,
  laneName,
  laneNames,
  foldedByEdge,
  hasRefs,
  onFocusBranch,
  onShowCommits
}: {
  viewModel: GitHistoryItemViewModel
  laneName?: string
  laneNames: Map<string, string>
  foldedByEdge: Map<string, number>
  hasRefs: boolean
  onFocusBranch: (name: string) => void
  onShowCommits: () => void
}): React.JSX.Element {
  const item = viewModel.historyItem
  const [first, ...merged] = item.parentIds
  const below = first === undefined ? 0 : (foldedByEdge.get(gitGraphEdgeKey(item.id, first)) ?? 0)
  const mergedName = merged.length
    ? (gitGraphMergedBranchName(item.subject) ?? laneNames.get(merged[0]!))
    : undefined
  const mergedColor = merged.length
    ? viewModel.outputSwimlanes.find((lane) => lane.id === merged[0])?.color
    : undefined
  const mergedFolded = merged.reduce(
    (sum, parent) => sum + (foldedByEdge.get(gitGraphEdgeKey(item.id, parent)) ?? 0),
    0
  )
  const name = (text: string, color?: GitHistoryGraphColorId) => (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded px-1 font-medium text-foreground hover:bg-accent"
      title={`Follow ${text}`}
      onClick={(event) => {
        event.stopPropagation()
        onFocusBranch(text)
      }}
    >
      {color && (
        <span
          aria-hidden
          className="size-1.5 rounded-full"
          style={{ background: graphColor(color) }}
        />
      )}
      <span className="break-all">{text}</span>
    </button>
  )
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-muted-foreground">
      {merged.length > 0 && (
        <span className="inline-flex flex-wrap items-center gap-1">
          <GitMerge className="size-3.5 shrink-0" />
          merged {mergedName ? name(mergedName, mergedColor) : 'a branch'}
          {mergedFolded > 0 && <span>({plural(mergedFolded)})</span>}
          {laneName && !hasRefs && <>into {name(laneName)}</>}
        </span>
      )}
      {merged.length === 0 && !hasRefs && (
        <span className="inline-flex items-center gap-1">
          <GitFork className="size-3.5 shrink-0" />
          {laneName ? <>fork on {name(laneName)}</> : 'fork point'}
        </span>
      )}
      {below > 0 && (
        <button
          type="button"
          className="inline-flex items-center gap-0.5 rounded border border-dashed border-border px-1.5 tabular-nums hover:border-ring hover:bg-accent hover:text-foreground"
          title={`${plural(below)} further down this line before its next branch point. Click: show them in the Detailed view`}
          onClick={(event) => {
            event.stopPropagation()
            onShowCommits()
          }}
        >
          <ChevronsDown className="size-3" />
          {plural(below)}
        </button>
      )}
    </span>
  )
}
