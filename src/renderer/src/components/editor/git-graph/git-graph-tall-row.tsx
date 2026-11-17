// Local (glass build): a Git Graph row that grows to fit its text instead of cutting it (Paweł,
// 2026-11-17: "we dont have to stick to having one narrow row line ... clarity and readability is
// more important"). Branch names get a line of their own above the commit, across the whole row;
// the commit message wraps. The graph keeps up: lanes run straight through the extra height, the
// node sits level with the message's first line.
import React from 'react'
import { cn } from '@/lib/class-names'
import { getIntlLocale } from '@/i18n/i18n'
import type { GitHistoryGraphColorId } from '../../../../../shared/git/history/git-history-types'
import type { GitHistoryGraphNode } from '../../../../../shared/git/history/git-history-graph'
import { graphColor } from '@/components/right-sidebar/source-control/sync/git-history-graph-svg'
import { GIT_GRAPH_EMPTY_LANE, type GitGraphLaneRow } from './git-graph-branch-layout'
import { GitGraphLanesSvg, gitGraphLaneStroke } from './git-graph-lanes-svg'
import type { GitGraphLayout } from './git-graph-columns'
import { formatGitGraphRelativeTime } from './git-graph-row'
import { useGitGraphAuthorProps } from './git-graph-author-color'

// Matches SWIMLANE_WIDTH in git-history-graph-svg.tsx; the graph cell's pl-2 adds 8px.
const LANE_WIDTH = 11
const GRAPH_PADDING = 8

/** Straight lanes filling a graph cell's height, where the row is taller than its drawn node. */
export function GitGraphLaneFill({
  lanes,
  className,
  style
}: {
  lanes: readonly GitHistoryGraphNode[]
  className?: string
  style?: React.CSSProperties
}): React.JSX.Element {
  return (
    <div aria-hidden className={cn('relative overflow-hidden', className)} style={style}>
      {lanes.map((lane, index) => {
        if (lane.id === GIT_GRAPH_EMPTY_LANE) {
          return null
        }
        const width = gitGraphLaneStroke(lane.color)
        return (
          <div
            key={`${index}-${lane.id}`}
            className="absolute inset-y-0"
            style={{
              left: GRAPH_PADDING + LANE_WIDTH * (index + 1) - width / 2,
              width,
              background: graphColor(lane.color)
            }}
          />
        )
      })}
    </div>
  )
}

/**
 * The selected commit's frame: a hairline in its lane's colour around the row and the details
 * open under it, drawn over them (Paweł, 2026-11-17: "row highlight on selection is annoying").
 */
export function GitGraphSelectionFrame({
  laneColor,
  children
}: {
  laneColor: GitHistoryGraphColorId
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div data-git-graph-selection className="relative">
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-md border opacity-80"
        style={{ borderColor: graphColor(laneColor) }}
      />
    </div>
  )
}

/**
 * A merge into a highlighted branch (the toolbar's "Merges into" toggles): framed in that
 * branch's colour, a little stronger than a selection, while every other row fades.
 */
export function GitGraphMergeMark({
  color,
  children
}: {
  color: GitHistoryGraphColorId
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div data-git-graph-merge-mark className="relative isolate">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-md opacity-[0.07]"
        style={{ background: graphColor(color) }}
      />
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-md border-[1.5px]"
        style={{ borderColor: graphColor(color) }}
      />
    </div>
  )
}

type GitGraphTallRowProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
  viewModel: GitGraphLaneRow
  layout: GitGraphLayout
  selected: boolean
  /** Off the followed branch: drawn faint. */
  dimmed?: boolean
  /** Just jumped to: outlined for a moment. */
  flashing?: boolean
  /** The line above the commit (its branch names), across every column but the graph. */
  top?: React.ReactNode
  /** The commit's own line: its message, or the Branches view's summary. */
  main: React.ReactNode
  /** Vertical padding of the main line; its first line's middle must sit at 12px, level with the node. */
  mainClassName?: string
  onSelect: () => void
  onOpen: () => void
}

export const GitGraphTallRow = React.forwardRef<HTMLDivElement, GitGraphTallRowProps>(
  function GitGraphTallRow(
    {
      viewModel,
      layout,
      selected,
      dimmed,
      flashing,
      top,
      main,
      mainClassName = 'py-1 leading-4',
      onSelect,
      onOpen,
      className,
      ...rootProps
    },
    ref
  ): React.JSX.Element {
    const item = viewModel.historyItem
    const authorProps = useGitGraphAuthorProps(item.author, item.authorEmail)
    const lineRow = top ? 2 : 1
    // Author, date and hash sit level with the message's first line (24px tall, like the node).
    const meta = (column: number, content: React.ReactNode, extra?: string, title?: string) => (
      <span
        className={cn('self-start truncate leading-6 text-foreground/80', extra)}
        style={{ gridRow: lineRow, gridColumn: column }}
        title={title}
      >
        {content}
      </span>
    )
    let column = 3
    const authorColumn = layout.author ? column++ : 0
    const dateColumn = layout.date ? column++ : 0
    const hashColumn = column
    return (
      <div
        {...rootProps}
        ref={ref}
        role="row"
        aria-selected={selected}
        data-git-graph-commit={item.id}
        className={cn(
          'grid cursor-default gap-x-3 pr-3 text-xs transition-opacity',
          // Selection is a frame around the row and its details (GitGraphSelectionFrame), never a
          // fill: a filled row recoloured its text and washed out the lane colours.
          flashing && 'ring-1 ring-ring ring-inset',
          dimmed && !selected && 'opacity-35',
          className
        )}
        style={{ gridTemplateColumns: layout.template }}
        onClick={onSelect}
        onDoubleClick={onOpen}
      >
        {top && (
          <>
            <GitGraphLaneFill
              lanes={viewModel.inputSwimlanes}
              style={{ gridRow: 1, gridColumn: 1 }}
            />
            <div
              className="flex min-w-0 flex-wrap items-center gap-1 pt-1.5 pb-0.5"
              style={{ gridRow: 1, gridColumn: '2 / -1' }}
            >
              {top}
            </div>
          </>
        )}
        <div
          className="flex min-h-6 flex-col overflow-hidden pl-2"
          style={{ gridRow: lineRow, gridColumn: 1 }}
        >
          <GitGraphLanesSvg row={viewModel} />
          <GitGraphLaneFill lanes={viewModel.outputSwimlanes} className="-ml-2 flex-1" />
        </div>
        <div className={cn('min-w-0', mainClassName)} style={{ gridRow: lineRow, gridColumn: 2 }}>
          {main}
        </div>
        {layout.author && (
          <span
            className="self-start truncate leading-6"
            title={item.authorEmail}
            {...authorProps}
            // The author's hue rides in the same style object as its grid place.
            style={{
              ...authorProps.style,
              gridRow: lineRow,
              gridColumn: authorColumn
            }}
          >
            {item.author}
          </span>
        )}
        {layout.date &&
          meta(
            dateColumn,
            formatGitGraphRelativeTime(item.timestamp),
            undefined,
            item.timestamp ? new Date(item.timestamp).toLocaleString(getIntlLocale()) : undefined
          )}
        {layout.commit && meta(hashColumn, item.displayId ?? item.id.slice(0, 7), 'font-mono')}
      </div>
    )
  }
)
