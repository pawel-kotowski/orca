// Local (glass build): the commits behind one row of the Branches view (Paweł, 2026-11-17: "when
// i hover on branch it could show commits, same when clicked actualy ... we always should stay in
// branches view"). A row stands for its own commit and the plain commits folded under it on its
// line; a merge also for the commits it took in. Clicking the row opens them under it, where a
// commit opens its own details.
import React from 'react'
import { cn } from '@/lib/class-names'
import type { GitHistoryItem } from '../../../../../shared/git/history/git-history-types'
import { gitGraphEdgeKey } from './git-graph-outline'
import { formatGitGraphRelativeTime } from './git-graph-row'
import { useGitGraphAuthorProps } from './git-graph-author-color'

/** `title` is absent for the row's own line: the row right above names it and counts it. */
export type GitGraphSegment = { key: string; title?: string; ids: string[] }

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
      // No heading: the row's own branch label and count sit right above (Paweł, 2026-11-17:
      // "redundant branch reference").
      key: `line:${laneName ?? ''}`,
      ids: [item.id, ...(first ? (foldedByEdge.get(gitGraphEdgeKey(item.id, 0)) ?? []) : [])]
    }
  ]
  merged.forEach((_parent, index) => {
    const ids = foldedByEdge.get(gitGraphEdgeKey(item.id, index + 1)) ?? []
    if (ids.length > 0) {
      segments.push({
        key: `merged:${index}`,
        title: `merged in${index === 0 && mergedName ? ` from ${mergedName}` : ''}`,
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
      <span className="w-16 shrink-0 text-right text-foreground/70 tabular-nums">
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
  openId,
  onOpenCommit,
  renderDetails
}: {
  segments: GitGraphSegment[]
  itemById: ReadonlyMap<string, GitHistoryItem>
  openId?: string | null
  onOpenCommit?: (id: string) => void
  renderDetails?: (item: GitHistoryItem) => React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {segments.map((segment) => {
        return (
          <div key={segment.key} className="min-w-0">
            {segment.title && (
              <div className="mt-1 border-t border-foreground/10 px-2 pt-1.5 pb-0.5 text-xs text-foreground/65">
                {segment.title} · {segment.ids.length}
              </div>
            )}
            {segment.ids.map((id) => {
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
          </div>
        )
      })}
    </div>
  )
}
