// Local (glass build): the commits behind one row of the Branches view (Paweł, 2026-11-17: "when
// i hover on branch it could show commits, same when clicked actualy ... we always should stay in
// branches view"). A row stands for its own commit and the plain commits folded under it on its
// line; a merge also for the commits it took in. Hovering the row shows them in a card; clicking
// opens them under the row, where a commit opens its own details.
import React from 'react'
import { cn } from '@/lib/class-names'
import type { GitHistoryItem } from '../../../../../shared/git/history/git-history-types'
import { gitGraphEdgeKey } from './git-graph-outline'
import { formatGitGraphRelativeTime } from './git-graph-row'
import { useGitGraphAuthorProps } from './git-graph-author-color'

export type GitGraphSegment = { title: string; ids: string[] }

/** The commits a Branches row stands for, as titled groups: its line, then each merged line. */
export function gitGraphSegments(
  item: GitHistoryItem,
  foldedByEdge: ReadonlyMap<string, string[]>,
  laneName: string | undefined,
  mergedName: string | undefined
): GitGraphSegment[] {
  const [first, ...merged] = item.parentIds
  const segments: GitGraphSegment[] = [
    {
      title: laneName ? `On ${laneName}` : 'On this line',
      ids: [item.id, ...(first ? (foldedByEdge.get(gitGraphEdgeKey(item.id, first)) ?? []) : [])]
    }
  ]
  merged.forEach((parent, index) => {
    const ids = foldedByEdge.get(gitGraphEdgeKey(item.id, parent)) ?? []
    if (ids.length > 0) {
      segments.push({
        title: `Merged in${index === 0 && mergedName ? ` from ${mergedName}` : ''}`,
        ids
      })
    }
  })
  return segments
}

function CommitLine({
  item,
  open,
  onOpen
}: {
  item: GitHistoryItem
  open?: boolean
  onOpen?: () => void
}): React.JSX.Element {
  const author = useGitGraphAuthorProps(item.author, item.authorEmail)
  const content = (
    <>
      <span className="min-w-0 flex-1 break-words">{item.subject}</span>
      <span className="max-w-[10rem] shrink-0 truncate" {...author}>
        {item.author}
      </span>
      <span className="w-16 shrink-0 text-right text-muted-foreground tabular-nums">
        {formatGitGraphRelativeTime(item.timestamp)}
      </span>
    </>
  )
  const className = 'flex w-full items-start gap-3 rounded px-2 py-0.5 text-left text-xs'
  return onOpen ? (
    <button
      type="button"
      data-git-graph-commit-line={item.id}
      className={cn(className, open ? 'ring-1 ring-ring ring-inset' : 'hover:bg-accent/50')}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
    >
      {content}
    </button>
  ) : (
    <div data-git-graph-commit-line={item.id} className={className}>
      {content}
    </div>
  )
}

export function GitGraphSegmentCommits({
  segments,
  itemById,
  limit,
  openId,
  onOpenCommit,
  renderDetails
}: {
  segments: GitGraphSegment[]
  itemById: ReadonlyMap<string, GitHistoryItem>
  /** At most this many commits per group, with "and N more" (the hover card). */
  limit?: number
  openId?: string | null
  onOpenCommit?: (id: string) => void
  renderDetails?: (item: GitHistoryItem) => React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {segments.map((segment) => {
        const shown = limit === undefined ? segment.ids : segment.ids.slice(0, limit)
        return (
          <div key={segment.title} className="min-w-0">
            <div className="px-2 pb-0.5 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
              {segment.title} · {segment.ids.length}
            </div>
            {shown.map((id) => {
              const item = itemById.get(id)
              if (!item) {
                return null
              }
              return (
                <React.Fragment key={id}>
                  <CommitLine
                    item={item}
                    open={openId === id}
                    onOpen={onOpenCommit ? () => onOpenCommit(id) : undefined}
                  />
                  {openId === id && renderDetails?.(item)}
                </React.Fragment>
              )
            })}
            {shown.length < segment.ids.length && (
              <div className="px-2 text-xs text-muted-foreground">
                and {segment.ids.length - shown.length} more — click the row to see all
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
