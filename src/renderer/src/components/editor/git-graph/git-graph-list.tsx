// Local (glass build): the rows of the classic Git Graph, and what opens under the selected one:
// a commit's details in Detailed and Compact; in Branches, the commits the row stands for, where a
// commit opens its own details. The selected row and what it opened share one frame; in Detailed
// a branch's run of commits sits in a frame of its colour (git-graph-branch-frames.tsx).
import React from 'react'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import {
  GitHistoryCommitContextMenu,
  type GitHistoryCommitAction
} from '@/components/right-sidebar/source-control/sync/git-history-commit-context-menu'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import type { GitHistoryItem } from '../../../../../shared/git/history/git-history-types'
import type { GitGraphLaneRow } from './git-graph-branch-layout'
import type { GitGraphLayout } from './git-graph-columns'
import { GitGraphCommitDetails } from './git-graph-commit-details'
import { GitGraphCommitRow } from './git-graph-commit-row'
import { GitGraphSegmentCommits } from './git-graph-segment-commits'
import { GitGraphBranchFrame, gitGraphBranchRuns } from './git-graph-branch-frames'
import { GitGraphLaneFill, GitGraphMergeMark, GitGraphSelectionFrame } from './git-graph-tall-row'
import { isGitGraphMergeInto } from './use-git-graph-merge-marks'
import type { GitGraphDensity } from './git-graph-toolbar'
import type { GitGraphRows } from './use-git-graph-rows'

export function GitGraphList({
  model,
  layout,
  density,
  worktreeId,
  worktreePath,
  ownerTarget,
  currentRefId,
  selectedId,
  openCommitId,
  flashId,
  focusedBranch,
  mergeTargets,
  stackNames,
  onToggleRow,
  onSelectCommit,
  onOpenCommit,
  onCloseCommit,
  onFocusBranch,
  onCommitAction
}: {
  model: GitGraphRows
  layout: GitGraphLayout
  density: GitGraphDensity
  worktreeId: string
  worktreePath: string | null
  ownerTarget: RuntimeClientTarget | null
  currentRefId?: string
  selectedId: string | null
  /** Branches view: the commit whose details are open inside the selected row. */
  openCommitId: string | null
  flashId: string | null
  focusedBranch: string | null
  /** Branches whose merges are highlighted; empty: none. */
  mergeTargets: string[]
  /** Several names on one commit show as one and +N. */
  stackNames: boolean
  onToggleRow: (id: string) => void
  onSelectCommit: (id: string) => void
  onOpenCommit: (id: string | null) => void
  onCloseCommit: () => void
  onFocusBranch: (name: string) => void
  onCommitAction: (action: GitHistoryCommitAction, item: GitHistoryItem) => void
}): React.JSX.Element {
  const details = (
    item: GitHistoryItem,
    row: GitGraphLaneRow,
    onClose: () => void,
    withLanes = true
  ) =>
    worktreePath && (
      <div
        data-git-graph-details
        className="flex rounded-b-md bg-muted/30 dark:bg-black/30"
        aria-label="Commit details"
      >
        {/* overflow-hidden: lanes past a narrowed graph column are clipped instead of drawing
            over the details (Paweł, 2026-11-15: "files overlap with lines"). */}
        {withLanes && (
          <GitGraphLaneFill
            lanes={row.outputSwimlanes}
            className="shrink-0 self-stretch"
            style={{ width: layout.graph }}
          />
        )}
        <GitGraphCommitDetails
          worktreeId={worktreeId}
          worktreePath={worktreePath}
          ownerTarget={ownerTarget}
          item={item}
          onSelectCommit={onSelectCommit}
          onClose={onClose}
          laneColor={row.nodeColor}
          // Compact cuts the message short, so its details show it; elsewhere the row shows it.
          showTitle={density === 'compact'}
        />
      </div>
    )

  const renderRow = (row: GitGraphLaneRow): React.JSX.Element => {
    const id = row.historyItem.id
    const item = model.itemById.get(id) ?? row.historyItem
    const selected = id === selectedId
    const isMark = isGitGraphMergeInto(row, model.laneNames, mergeTargets)
    const branches = density === 'branches'
    const segments = branches ? model.segmentsOf(row) : undefined
    const content = (
      <>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <GitGraphCommitRow
              viewModel={row}
              layout={layout}
              density={density}
              selected={selected}
              flashing={flashId === id}
              focusedBranch={focusedBranch}
              faded={mergeTargets.length > 0 && !isMark}
              stackNames={stackNames}
              laneName={model.laneNames.get(id)}
              currentRefId={currentRefId}
              segments={segments}
              mergedName={branches ? model.mergedNameOf(row) : undefined}
              starts={branches ? model.startsOf(row) : undefined}
              pinned={model.pinned}
              onSelect={() => onToggleRow(id)}
              onOpen={() => (branches ? onToggleRow(id) : onSelectCommit(id))}
              onFocusBranch={onFocusBranch}
            />
          </ContextMenuTrigger>
          <GitHistoryCommitContextMenu item={item} onAction={onCommitAction} />
        </ContextMenu>
        {selected && !branches && details(item, row, onCloseCommit)}
        {selected && branches && segments && (
          <div data-git-graph-details className="flex pb-1.5" aria-label="Commits of this row">
            <GitGraphLaneFill
              lanes={row.outputSwimlanes}
              className="shrink-0 self-stretch"
              style={{ width: layout.graph }}
            />
            <div className="min-w-0 flex-1 pr-3 pl-3">
              <GitGraphSegmentCommits
                segments={segments}
                itemById={model.itemById}
                openId={openCommitId}
                onOpenCommit={(commit) => onOpenCommit(commit === openCommitId ? null : commit)}
                renderDetails={(commit) => (
                  <div className="my-1 overflow-hidden rounded-md border border-border/60">
                    {details(commit, row, () => onOpenCommit(null), false)}
                  </div>
                )}
              />
            </div>
          </div>
        )}
      </>
    )
    const framed = selected ? (
      <GitGraphSelectionFrame laneColor={row.nodeColor}>{content}</GitGraphSelectionFrame>
    ) : (
      content
    )
    return isMark ? (
      <GitGraphMergeMark key={id} color={row.nodeColor}>
        {framed}
      </GitGraphMergeMark>
    ) : (
      <React.Fragment key={id}>{framed}</React.Fragment>
    )
  }

  // Detailed: a branch's run of commits sits in a frame of its colour, headed by its name.
  const runs =
    density === 'detailed' ? gitGraphBranchRuns(model.rows, model.laneNames, model.pinned) : []
  const out: React.JSX.Element[] = []
  let index = 0
  for (const run of runs) {
    for (; index < run.start; index += 1) {
      out.push(renderRow(model.rows[index]!))
    }
    out.push(
      <GitGraphBranchFrame
        key={`frame:${model.rows[run.start]!.historyItem.id}`}
        color={run.color}
        left={layout.graph + 12}
      >
        {model.rows.slice(run.start, run.end + 1).map(renderRow)}
      </GitGraphBranchFrame>
    )
    index = run.end + 1
  }
  for (; index < model.rows.length; index += 1) {
    out.push(renderRow(model.rows[index]!))
  }
  return <>{out}</>
}
