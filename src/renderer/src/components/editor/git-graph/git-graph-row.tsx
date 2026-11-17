// Local (glass build): one commit row of the Git Graph tab — graph, subject with refs, author, date, hash.
import React from 'react'
import { Check, Tag } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { cn } from '@/lib/class-names'
import { getIntlLocale } from '@/i18n/i18n'
import type {
  GitHistoryGraphColorId,
  GitHistoryItemRef
} from '../../../../../shared/git/history/git-history-types'
import { dedupeRemoteTrackingRefs } from '../../../../../shared/git/history/git-history-ref-display'
import {
  GitGraphColumnResizeHandle,
  type GitGraphColumnKey,
  type GitGraphLayout,
  type GitGraphOptionalColumn
} from './git-graph-columns'
import { useGitGraphAuthorProps } from './git-graph-author-color'
import { useGitGraphRefColour } from './git-graph-branch-colour-context'
import { graphColor } from '@/components/right-sidebar/source-control/sync/git-history-graph-svg'
import type { GitGraphLaneRow } from './git-graph-branch-layout'
import { GitGraphLanesSvg } from './git-graph-lanes-svg'

export const GIT_GRAPH_ROW_HEIGHT = 24

// Narrow ("46m ago", "3h ago") so the date fits a narrow column; the full date is its tooltip.
const relativeTime = (): Intl.RelativeTimeFormat =>
  new Intl.RelativeTimeFormat(getIntlLocale(), { numeric: 'auto', style: 'narrow' })
const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60]
]

export function formatGitGraphRelativeTime(timestamp: number | undefined): string {
  if (timestamp == null || !Number.isFinite(timestamp)) {
    return ''
  }
  const seconds = (timestamp - Date.now()) / 1000
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(seconds) >= size) {
      return relativeTime().format(Math.round(seconds / size), unit)
    }
  }
  return relativeTime().format(0, 'minute')
}

/**
 * A badge's colour: the lane colour of the commit it sits on, so a badge always matches the line
 * it marks (Paweł, 2026-11-15: "main color is brown and doesnt match branch line color"; main and
 * master used the base-ref colour, which the lanes here never use). Tags stay plain.
 */
export function gitGraphRefColor(
  itemRef: GitHistoryItemRef,
  laneColor?: GitHistoryGraphColorId
): GitHistoryGraphColorId | undefined {
  if (itemRef.category === 'tags') {
    return undefined
  }
  return laneColor ?? itemRef.color
}

/**
 * A ref name, marked quietly (Paweł, 2026-11-15: "dont make branch names all colored, just mark
 * them with color somehow more delicately"): muted text in a thin neutral outline, with a small
 * dot in the lane colour. The current branch reads in the normal text colour.
 */
export function GitGraphRefBadge({
  itemRef,
  isHead,
  laneColor
}: {
  itemRef: GitHistoryItemRef
  isHead?: boolean
  laneColor?: GitHistoryGraphColorId
}): React.JSX.Element {
  const refColor = useGitGraphRefColour(itemRef, gitGraphRefColor(itemRef, laneColor))
  return (
    <span
      title={itemRef.category ? `${itemRef.name} (${itemRef.category})` : itemRef.name}
      className={cn(
        'inline-flex max-w-[14rem] min-w-0 shrink items-center gap-1 rounded-full border border-border/70 px-1.5 text-[10.5px] leading-4',
        isHead ? 'font-medium text-foreground' : 'text-foreground/80'
      )}
    >
      {itemRef.category === 'tags' ? (
        <Tag className="size-2.5 shrink-0" />
      ) : (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: refColor ? graphColor(refColor) : 'var(--muted-foreground)' }}
        />
      )}
      <span className="truncate">{itemRef.name}</span>
    </span>
  )
}

type GitGraphRowProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
  viewModel: GitGraphLaneRow
  layout: GitGraphLayout
  selected: boolean
  currentRefId?: string
  onSelect: () => void
  onOpen: () => void
}

export const GitGraphRow = React.forwardRef<HTMLDivElement, GitGraphRowProps>(function GitGraphRow(
  { viewModel, layout, selected, currentRefId, onSelect, onOpen, className, ...rootProps },
  ref
): React.JSX.Element {
  const item = viewModel.historyItem
  const authorProps = useGitGraphAuthorProps(item.author, item.authorEmail)
  const isBoundary = viewModel.kind === 'incoming-changes' || viewModel.kind === 'outgoing-changes'
  const refs = dedupeRemoteTrackingRefs(item.references ?? [], {})
  const laneColor = isBoundary ? undefined : viewModel.nodeColor
  return (
    <div
      {...rootProps}
      ref={ref}
      role="row"
      aria-selected={selected}
      data-git-graph-commit={item.id}
      className={cn(
        'grid cursor-default items-center gap-x-3 pr-3 text-xs',
        isBoundary && 'text-muted-foreground italic',
        className
      )}
      style={{ height: GIT_GRAPH_ROW_HEIGHT, gridTemplateColumns: layout.template }}
      onClick={isBoundary ? undefined : onSelect}
      onDoubleClick={isBoundary ? undefined : onOpen}
    >
      <div className="flex h-full items-stretch overflow-hidden pl-2">
        <GitGraphLanesSvg row={viewModel} />
      </div>
      {/* The subject always starts at the column's left edge (Paweł, 2026-11-15: "branch name
          should not make commit msg start more on the right"); refs follow it and give way first. */}
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        <span className="min-w-0 truncate" title={item.message || item.subject}>
          {item.subject}
        </span>
        {refs.length > 0 && (
          <span className="flex max-w-[45%] min-w-0 shrink-0 items-center gap-1 overflow-hidden">
            {refs.map((itemRef) => (
              <GitGraphRefBadge
                key={itemRef.id}
                itemRef={itemRef}
                isHead={itemRef.id === currentRefId}
                laneColor={laneColor}
              />
            ))}
          </span>
        )}
      </div>
      {layout.author && (
        <span className="truncate" title={item.authorEmail} {...authorProps}>
          {item.author}
        </span>
      )}
      {layout.date && (
        <span
          className="truncate text-foreground/80"
          title={
            item.timestamp ? new Date(item.timestamp).toLocaleString(getIntlLocale()) : undefined
          }
        >
          {formatGitGraphRelativeTime(item.timestamp)}
        </span>
      )}
      {layout.commit && (
        <span className="truncate font-mono text-foreground/80">
          {isBoundary ? '' : (item.displayId ?? item.id.slice(0, 7))}
        </span>
      )}
    </div>
  )
})

const OPTIONAL_COLUMNS: [GitGraphOptionalColumn, string][] = [
  ['author', 'Author'],
  ['date', 'Date'],
  ['commit', 'Commit']
]

export function GitGraphHeaderRow({
  layout,
  onResize,
  onReset,
  onToggleColumn,
  descriptionLabel = 'Description'
}: {
  layout: GitGraphLayout
  descriptionLabel?: string
  onToggleColumn?: (key: GitGraphOptionalColumn) => void
  onResize: (key: GitGraphColumnKey, width: number) => void
  onReset: (key: GitGraphColumnKey) => void
}): React.JSX.Element {
  const handle = (key: GitGraphColumnKey, edge: 'left' | 'right', label: string) => (
    <GitGraphColumnResizeHandle
      edge={edge}
      width={key === 'graph' ? layout.graph : layout.widths[key]}
      label={`Resize ${label} column`}
      onResize={(width) => onResize(key, width)}
      onReset={() => onReset(key)}
    />
  )
  const header = (
    <div
      className="grid shrink-0 gap-x-3 border-b border-border pr-3 text-[11px] font-semibold tracking-wide text-foreground/72 uppercase select-none"
      style={{ gridTemplateColumns: layout.template }}
      title={onToggleColumn ? 'Right-click: choose columns' : undefined}
    >
      <span className="relative py-1 pl-2">
        Graph
        {handle('graph', 'right', 'Graph')}
      </span>
      <span className="py-1">{descriptionLabel}</span>
      {layout.author && (
        <span className="relative py-1">
          {handle('author', 'left', 'Author')}
          Author
        </span>
      )}
      {layout.date && (
        <span className="relative py-1">
          {handle('date', 'left', 'Date')}
          Date
        </span>
      )}
      {layout.commit && (
        <span className="relative py-1">
          {handle('commit', 'left', 'Commit')}
          Commit
        </span>
      )}
    </div>
  )
  if (!onToggleColumn) {
    return header
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{header}</ContextMenuTrigger>
      <ContextMenuContent>
        {OPTIONAL_COLUMNS.map(([key, label]) => (
          <ContextMenuItem key={key} onSelect={() => onToggleColumn(key)}>
            <Check className={cn('size-3.5', !layout.shown[key] && 'invisible')} />
            {label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
