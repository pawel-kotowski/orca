// Local (glass build): one commit of the Git Graph in the chosen view. Compact is the classic one
// line; Detailed puts the commit's branch names on their own line above its full message; Branches
// shows the names and what the commit did to the branches (merged, forked) instead of the message.
// Off a followed branch the row fades.
import React from 'react'
import {
  getGitHistoryItemColor,
  type GitHistoryItemViewModel
} from '../../../../../shared/git/history/git-history-graph'
import type { GitGraphLayout } from './git-graph-columns'
import { GitGraphRow } from './git-graph-row'
import { GitGraphTallRow } from './git-graph-tall-row'
import { GitGraphRefChip, groupGitGraphRefs } from './git-graph-ref-chips'
import { GitGraphOutlineSummary } from './git-graph-outline-summary'
import type { GitGraphDensity } from './git-graph-toolbar'

type GitGraphCommitRowProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
  viewModel: GitHistoryItemViewModel
  layout: GitGraphLayout
  density: GitGraphDensity
  selected: boolean
  flashing: boolean
  focusedBranch: string | null
  laneNames: Map<string, string>
  currentRefId?: string
  foldedByEdge?: Map<string, number>
  onSelect: () => void
  onOpen: () => void
  onFocusBranch: (name: string) => void
  onShowCommits: () => void
}

const EMPTY_FOLDS = new Map<string, number>()

export const GitGraphCommitRow = React.forwardRef<HTMLDivElement, GitGraphCommitRowProps>(
  function GitGraphCommitRow(
    {
      viewModel,
      layout,
      density,
      selected,
      flashing,
      focusedBranch,
      laneNames,
      currentRefId,
      foldedByEdge,
      onFocusBranch,
      onShowCommits,
      ...rowProps
    },
    ref
  ): React.JSX.Element {
    const item = viewModel.historyItem
    const laneName = laneNames.get(item.id)
    const groups = groupGitGraphRefs(item.references ?? [], currentRefId)
    const dimmed =
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
                ? 'bg-accent/70 ring-1 ring-ring ring-inset'
                : undefined
          }
        />
      )
    }
    const laneColor = getGitHistoryItemColor(viewModel)
    const chips = groups.map((group) => (
      <GitGraphRefChip
        key={group.key}
        group={group}
        laneColor={laneColor}
        size={density === 'branches' ? 'lg' : 'md'}
        focused={group.name === focusedBranch}
        onFocusBranch={onFocusBranch}
      />
    ))
    const main =
      density === 'branches' ? (
        <span className="flex flex-wrap items-center gap-1.5">
          {chips}
          <GitGraphOutlineSummary
            viewModel={viewModel}
            laneName={laneName}
            laneNames={laneNames}
            foldedByEdge={foldedByEdge ?? EMPTY_FOLDS}
            hasRefs={groups.length > 0}
            onFocusBranch={onFocusBranch}
            onShowCommits={onShowCommits}
          />
        </span>
      ) : (
        <span className="break-words whitespace-pre-wrap" title={item.message || item.subject}>
          {item.subject}
        </span>
      )
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
        mainClassName={density === 'branches' ? 'py-0.5 leading-5' : undefined}
      />
    )
  }
)
