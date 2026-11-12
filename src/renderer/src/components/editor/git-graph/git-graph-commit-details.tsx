// Local (glass build): the Git Graph tab's commit details, opened under the clicked row — message,
// metadata and the commit's files.
// A file click opens its diff beside the graph (a preview tab, so browsing replaces it); double click keeps it.
import React, { useEffect, useState } from 'react'
import { Copy, FileDiff, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { FileTypeIcon } from '@/components/FileTypeIcon'
import { basename, dirname } from '@/lib/path'
import { detectLanguage } from '../../../../../shared/editor-language/editor-language-detect'
import { getConnectionId } from '@/lib/workspace/ownership/connection-context'
import { translate } from '@/i18n/i18n'
import { getRuntimeGitCommitCompare } from '@/runtime/source-control/git/runtime-git-diff-client'
import { STATUS_COLORS } from '@/lib/source-control/paths/git-path-decoration'
import { requireGitOwnerTarget } from '@/components/right-sidebar/source-control/sync/worktree-git-owner-target'
import { formatGitHistoryTimestamp } from '@/components/right-sidebar/source-control/sync/git-history-format'
import { STATUS_LABELS } from '../../../../../shared/git/status/git-status-labels'
import type { GitFileStatus } from '../../../../../shared/git/status/git-status-types'
import type {
  GitHistoryGraphColorId,
  GitHistoryItem
} from '../../../../../shared/git/history/git-history-types'
import type { GitCommitCompareResult } from '../../../../../shared/git/diff/git-diff-compare-types'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import { dedupeRemoteTrackingRefs } from '../../../../../shared/git/history/git-history-ref-display'
import { GitGraphRefBadge } from './git-graph-row'
import { gitGraphDiffTargetGroupId } from './open-git-graph-tab'

type CompareState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; result: GitCommitCompareResult }

export function GitGraphCommitDetails({
  worktreeId,
  worktreePath,
  ownerTarget,
  item,
  onSelectCommit,
  onClose,
  laneColor
}: {
  worktreeId: string
  worktreePath: string
  ownerTarget: RuntimeClientTarget | null
  item: GitHistoryItem
  onSelectCommit: (id: string) => void
  onClose: () => void
  laneColor?: GitHistoryGraphColorId
}): React.JSX.Element {
  const [compare, setCompare] = useState<CompareState>({ status: 'loading' })
  const openCommitDiff = useAppStore((s) => s.openCommitDiff)
  const openCommitAllDiffs = useAppStore((s) => s.openCommitAllDiffs)
  const focusGroup = useAppStore((s) => s.focusGroup)

  useEffect(() => {
    let live = true
    setCompare({ status: 'loading' })
    getRuntimeGitCommitCompare(
      {
        target: requireGitOwnerTarget(ownerTarget),
        worktreeId,
        worktreePath,
        connectionId: getConnectionId(worktreeId) ?? undefined
      },
      item.id
    )
      .then((result) => {
        if (!live) {
          return
        }
        setCompare(
          result.summary.status === 'ready'
            ? { status: 'ready', result }
            : { status: 'error', error: result.summary.errorMessage ?? 'Failed to load commit' }
        )
      })
      .catch((error: unknown) => {
        if (live) {
          setCompare({
            status: 'error',
            error: error instanceof Error ? error.message : String(error)
          })
        }
      })
    return () => {
      live = false
    }
  }, [item.id, ownerTarget, worktreeId, worktreePath])

  const openFile = (entryIndex: number, permanent: boolean): void => {
    if (compare.status !== 'ready') {
      return
    }
    const { summary, entries } = compare.result
    const entry = entries[entryIndex]
    if (!entry) {
      return
    }
    const targetGroupId = gitGraphDiffTargetGroupId(worktreeId)
    openCommitDiff(
      worktreeId,
      worktreePath,
      entry,
      {
        commitOid: summary.commitOid,
        parentOid: summary.parentOid,
        compareRef: summary.compareRef,
        baseRef: summary.baseRef,
        subject: item.subject,
        message: item.message
      },
      detectLanguage(entry.path),
      { targetGroupId, preview: !permanent }
    )
  }

  const openAll = (): void => {
    if (compare.status !== 'ready') {
      return
    }
    const targetGroupId = gitGraphDiffTargetGroupId(worktreeId)
    if (targetGroupId) {
      focusGroup(worktreeId, targetGroupId)
    }
    const { summary, entries } = compare.result
    openCommitAllDiffs(worktreeId, worktreePath, summary, entries, item.subject, item.message)
  }

  const copy = (text: string, label: string): void => {
    void window.api.ui.writeClipboardText(text).then(() => toast.success(`${label} copied`))
  }

  const body = item.message.startsWith(item.subject)
    ? item.message.slice(item.subject.length).trim()
    : item.message.trim()
  const refs = dedupeRemoteTrackingRefs(item.references ?? [], {})

  const files = (
    <>
      <div className="flex items-center gap-2 px-4 py-1.5">
        <span className="flex-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {compare.status === 'ready'
            ? `${compare.result.entries.length} ${compare.result.entries.length === 1 ? 'file' : 'files'} changed`
            : 'Files'}
        </span>
        <Button variant="ghost" size="xs" disabled={compare.status !== 'ready'} onClick={openAll}>
          <FileDiff className="size-3.5" />
          {translate('local.gitGraph.openAllChanges', 'Open all changes')}
        </Button>
      </div>
      {compare.status === 'loading' && (
        <div className="px-4 py-1 text-xs text-muted-foreground">Loading files…</div>
      )}
      {compare.status === 'error' && (
        <div className="px-4 py-1 text-xs text-destructive">{compare.error}</div>
      )}
      {compare.status === 'ready' &&
        compare.result.entries.map((entry, index) => {
          const status = entry.status as GitFileStatus
          const dir = dirname(entry.path)
          return (
            <button
              key={`${entry.path}:${index}`}
              type="button"
              title={entry.path}
              className="flex w-full min-w-0 items-center gap-1.5 px-4 py-1 text-left text-xs hover:bg-accent/40"
              onClick={() => openFile(index, false)}
              onDoubleClick={() => openFile(index, true)}
            >
              <FileTypeIcon
                filePath={entry.path}
                className="size-3.5 shrink-0"
                style={{ color: STATUS_COLORS[status] }}
              />
              <span className="min-w-0 flex-1 truncate">
                <span className="text-foreground">{basename(entry.path)}</span>
                {dir && dir !== '.' && <span className="ml-1.5 text-muted-foreground">{dir}</span>}
              </span>
              <span
                className="w-4 shrink-0 text-center text-[11px] font-bold"
                style={{ color: STATUS_COLORS[status] }}
              >
                {STATUS_LABELS[status]}
              </span>
            </button>
          )
        })}
    </>
  )

  // Opens under the clicked row (Paweł, 2026-11-10: "when i click commit it should open below
  // clicked commit, not on the side"): files on the left, message and metadata on the right
  // ("file changes on the left, descirption on right"); stacked, files first, when the tab is
  // narrow. Each property is set by one container variant only: a base class such as flex-col
  // wins over its @2xl: override in this build's CSS order.
  return (
    <div className="@container flex min-w-0 flex-1 flex-col border-y border-border">
      <div className="flex shrink-0 items-start gap-2 px-4 pt-2.5 pb-1.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold break-words text-foreground">{item.subject}</div>
          {refs.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {refs.map((ref) => (
                <GitGraphRefBadge key={ref.id} itemRef={ref} laneColor={laneColor} />
              ))}
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close details">
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="flex max-h-[20rem] min-h-0 scrollbar-sleek @max-2xl:flex-col @max-2xl:overflow-y-auto">
        <div className="min-w-0 border-border pb-2 scrollbar-sleek @max-2xl:border-b @2xl:w-[45%] @2xl:shrink-0 @2xl:overflow-y-auto @2xl:border-r">
          {files}
        </div>
        <div className="min-w-0 scrollbar-sleek @2xl:flex-1 @2xl:overflow-y-auto">
          <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2 gap-y-1 px-4 py-1.5 text-xs">
            <dt className="text-muted-foreground">Commit</dt>
            <dd className="flex min-w-0 items-center gap-1 font-mono">
              <span className="truncate">{item.id}</span>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => copy(item.id, 'Commit hash')}
                aria-label="Copy commit hash"
              >
                <Copy className="size-3" />
              </button>
            </dd>
            {item.parentIds.length > 0 && (
              <>
                <dt className="text-muted-foreground">
                  {item.parentIds.length > 1 ? 'Parents' : 'Parent'}
                </dt>
                <dd className="flex flex-wrap gap-x-2 font-mono">
                  {item.parentIds.map((parent) => (
                    <button
                      key={parent}
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => onSelectCommit(parent)}
                    >
                      {parent.slice(0, 8)}
                    </button>
                  ))}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Author</dt>
            <dd className="truncate">
              {item.author}
              {item.authorEmail ? (
                <span className="text-muted-foreground"> &lt;{item.authorEmail}&gt;</span>
              ) : null}
            </dd>
            <dt className="text-muted-foreground">Date</dt>
            <dd>{formatGitHistoryTimestamp(item.timestamp)}</dd>
          </dl>
          {body && (
            <pre className="mx-4 mt-1 mb-3 border-t border-border pt-2 font-sans text-xs whitespace-pre-wrap break-words text-foreground/90">
              {body}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
