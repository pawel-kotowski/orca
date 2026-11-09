// Local (glass build): one commit row of the Git Graph tab — graph, subject with refs, author, date, hash.
import React from 'react'
import { Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GitHistoryItemRef } from '../../../../../shared/git/history/git-history-types'
import type { GitHistoryItemViewModel } from '../../../../../shared/git/history/git-history-graph'
import { dedupeRemoteTrackingRefs } from '../../../../../shared/git/history/git-history-ref-display'
import {
  GitGraphColumnResizeHandle,
  type GitGraphColumnKey,
  type GitGraphLayout
} from './git-graph-columns'
import {
  GitHistoryGraphSvg,
  graphColor
} from '@/components/right-sidebar/source-control/sync/git-history-graph-svg'

export const GIT_GRAPH_ROW_HEIGHT = 24

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
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
      return relativeTime.format(Math.round(seconds / size), unit)
    }
  }
  return relativeTime.format(0, 'minute')
}

export function GitGraphRefBadge({
  itemRef,
  isHead
}: {
  itemRef: GitHistoryItemRef
  isHead?: boolean
}): React.JSX.Element {
  const color = itemRef.color ? graphColor(itemRef.color) : undefined
  return (
    <span
      title={itemRef.category ? `${itemRef.name} (${itemRef.category})` : itemRef.name}
      className={cn(
        'max-w-[14rem] shrink-0 truncate rounded border px-1.5 text-[11px] leading-4',
        isHead && 'font-semibold'
      )}
      style={{
        borderColor: color ?? 'var(--border)',
        color: color ?? 'var(--muted-foreground)',
        background: color ? `color-mix(in srgb, ${color} 12%, transparent)` : undefined
      }}
    >
      {itemRef.category === 'tags' && <Tag className="mr-0.5 inline size-2.5 align-[-1px]" />}
      {itemRef.name}
    </span>
  )
}

type GitGraphRowProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
  viewModel: GitHistoryItemViewModel
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
  const isBoundary = viewModel.kind === 'incoming-changes' || viewModel.kind === 'outgoing-changes'
  const refs = dedupeRemoteTrackingRefs(item.references ?? [], {})
  return (
    <div
      {...rootProps}
      ref={ref}
      role="row"
      aria-selected={selected}
      data-git-graph-commit={item.id}
      className={cn(
        'grid cursor-default items-center gap-x-3 pr-3 text-xs',
        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/40',
        isBoundary && 'text-muted-foreground italic',
        className
      )}
      style={{ height: GIT_GRAPH_ROW_HEIGHT, gridTemplateColumns: layout.template }}
      onClick={isBoundary ? undefined : onSelect}
      onDoubleClick={isBoundary ? undefined : onOpen}
    >
      <div className="flex h-full items-stretch overflow-hidden pl-2">
        <GitHistoryGraphSvg viewModel={viewModel} />
      </div>
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        {refs.map((itemRef) => (
          <GitGraphRefBadge
            key={itemRef.id}
            itemRef={itemRef}
            isHead={itemRef.id === currentRefId}
          />
        ))}
        <span className="min-w-0 truncate" title={item.message || item.subject}>
          {item.subject}
        </span>
      </div>
      {layout.author && (
        <span className="truncate text-muted-foreground" title={item.authorEmail}>
          {item.author}
        </span>
      )}
      {layout.date && (
        <span
          className="truncate text-muted-foreground"
          title={item.timestamp ? new Date(item.timestamp).toLocaleString() : undefined}
        >
          {formatGitGraphRelativeTime(item.timestamp)}
        </span>
      )}
      <span className="truncate font-mono text-muted-foreground">
        {isBoundary ? '' : (item.displayId ?? item.id.slice(0, 7))}
      </span>
    </div>
  )
})

export function GitGraphHeaderRow({
  layout,
  onResize,
  onReset
}: {
  layout: GitGraphLayout
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
  return (
    <div
      className="grid shrink-0 gap-x-3 border-b border-border pr-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase select-none"
      style={{ gridTemplateColumns: layout.template }}
    >
      <span className="relative py-1 pl-2">
        Graph
        {handle('graph', 'right', 'Graph')}
      </span>
      <span className="py-1">Description</span>
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
      <span className="relative py-1">
        {handle('commit', 'left', 'Commit')}
        Commit
      </span>
    </div>
  )
}
