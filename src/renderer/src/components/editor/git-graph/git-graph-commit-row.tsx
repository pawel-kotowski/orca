// Local (glass build): one commit of the Git Graph in the chosen view. Compact is the classic one
// line; Detailed puts the commit's branch names on their own line above its full message, and a
// click on a name follows that branch; Branches shows the names and what the commit did to the
// branches (merged, forked) with how many commits the row stands for, which a click opens under
// the row (a hover card was tried and removed, 2026-11-17: Paweł, "remove hover on branch").
import React from 'react'
import type { GitGraphLaneRow } from './git-graph-branch-layout'
import type { GitGraphLayout } from './git-graph-columns'
import { GitGraphRow } from './git-graph-row'
import { GitGraphTallRow } from './git-graph-tall-row'
import { GitGraphRefChip, groupGitGraphRefs } from './git-graph-ref-chips'
import { GitGraphOutlineSummary } from './git-graph-outline-summary'
import type { GitGraphSegment } from './git-graph-segment-commits'
import type { GitGraphDensity } from './git-graph-toolbar'

type GitGraphCommitRowProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
  viewModel: GitGraphLaneRow
  layout: GitGraphLayout
  density: GitGraphDensity
  selected: boolean
  flashing: boolean
  /** Merges highlighted: this row is not one of them, so it fades. */
  faded?: boolean
  /** Several names on this commit show as one and +N until the +N is clicked. */
  stackNames?: boolean
  focusedBranch: string | null
  laneName?: string
  currentRefId?: string
  /** Branches view: what the row stands for, and the name of the branch a merge took in. */
  segments?: GitGraphSegment[]
  mergedName?: string
  /** Branches view: the branches whose lines leave this commit. */
  starts?: string[]
  pinned?: string[]
  onSelect: () => void
  onOpen: () => void
  onFocusBranch: (name: string) => void
}

export const GitGraphCommitRow = React.forwardRef<HTMLDivElement, GitGraphCommitRowProps>(
  function GitGraphCommitRow(
    {
      viewModel,
      layout,
      density,
      selected,
      flashing,
      faded,
      stackNames,
      focusedBranch,
      laneName,
      currentRefId,
      segments,
      mergedName,
      starts,
      pinned,
      onFocusBranch,
      ...rowProps
    },
    ref
  ): React.JSX.Element {
    const item = viewModel.historyItem
    const [expanded, setExpanded] = React.useState(false)
    const groups = groupGitGraphRefs(item.references ?? [], currentRefId)
    // Following a branch is a Detailed and Compact thing; Branches rows open their commits.
    const dimmed =
      !!faded ||
      (density !== 'branches' &&
        !!focusedBranch &&
        laneName !== focusedBranch &&
        !groups.some((group) => group.name === focusedBranch))
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
    // Stacked: the name that matters here leads (the current branch, else this line's own
    // branch), the rest wait behind "+N".
    const lead =
      groups.find((group) => group.isHead) ??
      groups.find((group) => group.name === laneName) ??
      groups[0]
    const stacked = !!stackNames && !expanded && groups.length > 1 && lead
    const shownGroups = stacked ? [lead] : groups
    const chips = shownGroups.map((group) => (
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
    if (stacked) {
      const others = groups.filter((group) => group !== lead)
      chips.push(
        <button
          key="more"
          type="button"
          title={`Also here:\n${others.map((group) => (group.remote ? `${group.remote}/` : '') + group.name).join('\n')}\nClick: show them`}
          className="rounded-md border border-dashed border-border px-1.5 text-[11px] leading-[18px] text-muted-foreground tabular-nums hover:border-ring hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation()
            setExpanded(true)
          }}
        >
          +{others.length}
        </button>
      )
    }
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
            starts={starts ?? []}
            pinned={pinned ?? []}
            segments={segments ?? []}
            hasRefs={groups.length > 0}
          />
        </span>
      )
      main = summary
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
        top={density === 'detailed' && chips.length > 0 ? chips : undefined}
        main={main}
        // A Branches row leads with 20px name chips: 2px above them puts their middle on the node.
        mainClassName={branches ? 'py-0.5 leading-5' : undefined}
      />
    )
  }
)
