// Local (glass build): one commit of the Git Graph in the chosen view. Compact is the classic one
// line; Detailed puts the commit's branch names on their own line above its full message, and a
// click on a name follows that branch; Branches shows the names and what the commit did to the
// branches (merged, forked) with how many commits the row stands for, which a hover shows in a
// card and a click opens under the row.
import React from 'react'
import type { GitHistoryItem } from '../../../../../shared/git/history/git-history-types'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import type { GitGraphLaneRow } from './git-graph-branch-layout'
import type { GitGraphLayout } from './git-graph-columns'
import { GitGraphRow } from './git-graph-row'
import { GitGraphTallRow } from './git-graph-tall-row'
import { GitGraphRefChip, groupGitGraphRefs } from './git-graph-ref-chips'
import { GitGraphOutlineSummary } from './git-graph-outline-summary'
import { GitGraphSegmentCommits, type GitGraphSegment } from './git-graph-segment-commits'
import type { GitGraphDensity } from './git-graph-toolbar'

type GitGraphCommitRowProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
  viewModel: GitGraphLaneRow
  layout: GitGraphLayout
  density: GitGraphDensity
  selected: boolean
  flashing: boolean
  focusedBranch: string | null
  laneName?: string
  currentRefId?: string
  /** Branches view: what the row stands for, and the name of the branch a merge took in. */
  segments?: GitGraphSegment[]
  mergedName?: string
  itemById?: ReadonlyMap<string, GitHistoryItem>
  onSelect: () => void
  onOpen: () => void
  onFocusBranch: (name: string) => void
}

const HOVER_LIMIT = 12

export const GitGraphCommitRow = React.forwardRef<HTMLDivElement, GitGraphCommitRowProps>(
  function GitGraphCommitRow(
    {
      viewModel,
      layout,
      density,
      selected,
      flashing,
      focusedBranch,
      laneName,
      currentRefId,
      segments,
      mergedName,
      itemById,
      onFocusBranch,
      ...rowProps
    },
    ref
  ): React.JSX.Element {
    const item = viewModel.historyItem
    const groups = groupGitGraphRefs(item.references ?? [], currentRefId)
    // Following a branch is a Detailed and Compact thing; Branches rows open their commits.
    const dimmed =
      density !== 'branches' &&
      !!focusedBranch &&
      laneName !== focusedBranch &&
      !groups.some((group) => group.name === focusedBranch)
    if (density === 'compact') {
      return (
        <GitGraphRow
          {...rowProps}
          ref={ref}
          viewModel={viewModel}
          layout={layout}
          selected={selected}
          currentRefId={currentRefId}
          className={
            dimmed && !selected
              ? 'opacity-35'
              : flashing
                ? 'ring-1 ring-ring ring-inset'
                : undefined
          }
        />
      )
    }
    const branches = density === 'branches'
    const chips = groups.map((group) => (
      <GitGraphRefChip
        key={group.key}
        group={group}
        laneColor={viewModel.nodeColor}
        size={branches ? 'lg' : 'md'}
        focused={!branches && group.name === focusedBranch}
        // In Branches a name is part of the row: the click opens the row's commits.
        onFocusBranch={branches ? undefined : onFocusBranch}
      />
    ))
    let main: React.ReactNode = (
      <span className="break-words whitespace-pre-wrap" title={item.message || item.subject}>
        {item.subject}
      </span>
    )
    if (branches) {
      const summary = (
        <span className="flex flex-wrap items-center gap-1.5">
          {chips}
          <GitGraphOutlineSummary
            row={viewModel}
            laneName={laneName}
            mergedName={mergedName}
            segments={segments ?? []}
            hasRefs={groups.length > 0}
          />
        </span>
      )
      // An open row already lists its commits under it; a card would repeat them.
      main =
        selected || !segments || !itemById ? (
          summary
        ) : (
          <HoverCard openDelay={450} closeDelay={80}>
            <HoverCardTrigger asChild>
              <span className="inline-flex max-w-full">{summary}</span>
            </HoverCardTrigger>
            <HoverCardContent align="start" className="w-[36rem] max-w-[80vw] p-2">
              <GitGraphSegmentCommits segments={segments} itemById={itemById} limit={HOVER_LIMIT} />
            </HoverCardContent>
          </HoverCard>
        )
    }
    return (
      <GitGraphTallRow
        {...rowProps}
        ref={ref}
        viewModel={viewModel}
        layout={layout}
        selected={selected}
        dimmed={dimmed}
        flashing={flashing}
        laneName={laneName}
        top={density === 'detailed' && chips.length > 0 ? chips : undefined}
        main={main}
        // A Branches row leads with 20px name chips: 2px above them puts their middle on the node.
        mainClassName={branches ? 'py-0.5 leading-5' : undefined}
      />
    )
  }
)
