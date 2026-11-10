// Local (glass build): the Git Graph tab — every branch's history as a full-size graph. A clicked
// commit's details open under its row, and their files open as diffs beside the graph. Reuses the
// sidebar's graph layout and drawing.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, RefreshCw, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import { useWorktreeGitOwnerTarget } from '@/components/right-sidebar/source-control/sync/worktree-git-owner-target'
import { useGitHistoryCommitActions } from '@/components/right-sidebar/source-control/sync/use-git-history-commit-actions'
import { GitHistoryCommitContextMenu } from '@/components/right-sidebar/source-control/sync/git-history-commit-context-menu'
import {
  buildDefaultGitHistoryColorMap,
  buildGitHistoryViewModels
} from '../../../../../shared/git/history/git-history-graph'
import { useGitGraphHistory } from './use-git-graph-history'
import { GIT_GRAPH_ROW_HEIGHT, GitGraphHeaderRow, GitGraphRow } from './git-graph-row'
import { useGitGraphColumns } from './git-graph-columns'
import { GitGraphCommitDetails } from './git-graph-commit-details'
import type { GitHistoryItemViewModel } from '../../../../../shared/git/history/git-history-graph'
import { graphColor } from '@/components/right-sidebar/source-control/sync/git-history-graph-svg'

// Matches SWIMLANE_WIDTH in git-history-graph-svg.tsx: one lane's width in px.
const LANE_WIDTH = 11

// The lanes that run from the selected commit to the next row keep going through its details.
function GitGraphLaneContinuation({
  viewModel,
  width
}: {
  viewModel: GitHistoryItemViewModel
  width: number
}): React.JSX.Element {
  return (
    <div className="relative shrink-0 self-stretch" style={{ width }}>
      {viewModel.outputSwimlanes.map((lane, index) => (
        <div
          key={`${index}-${lane.id}`}
          className="absolute inset-y-0 w-px"
          // pl-2 (8px) of the row's graph cell, then the lane's centre as the row's SVG draws it.
          style={{ left: 8 + LANE_WIDTH * (index + 1) - 0.5, background: graphColor(lane.color) }}
        />
      ))}
    </div>
  )
}

const ALL_REFS_STORAGE_KEY = 'orca.gitGraph.allRefs'
// Text size of the graph, list and details (Paweł, 2026-11-09: "git graph font size is too small
// add resize button"); CSS zoom keeps rows, lanes and text in proportion.
const ZOOM_STORAGE_KEY = 'orca.gitGraph.zoom'
const ZOOM_STEPS = [0.9, 1, 1.1, 1.15, 1.25, 1.4, 1.6, 1.8]
const DEFAULT_ZOOM = 1.15

function readZoom(): number {
  try {
    const stored = Number(window.localStorage.getItem(ZOOM_STORAGE_KEY))
    return ZOOM_STEPS.includes(stored) ? stored : DEFAULT_ZOOM
  } catch {
    return DEFAULT_ZOOM
  }
}

function useGitGraphZoom(): [number, (direction: 1 | -1) => void] {
  const [zoom, setZoom] = useState(readZoom)
  const step = useCallback((direction: 1 | -1) => {
    setZoom((current) => {
      const index = ZOOM_STEPS.indexOf(current)
      const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction))]
      try {
        window.localStorage.setItem(ZOOM_STORAGE_KEY, String(next))
      } catch {
        // Storage unavailable: the size lasts for this tab only.
      }
      return next
    })
  }, [])
  return [zoom, step]
}
// Selection and scroll survive the tab remounting (a split beside it moves its group).
const viewByWorktree = new Map<string, { selectedId: string | null; scrollTop: number }>()

function readAllRefsPreference(): boolean {
  try {
    return window.localStorage.getItem(ALL_REFS_STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

export function GitGraphView({ worktreeId }: { worktreeId: string }): React.JSX.Element {
  const [allRefs, setAllRefs] = useState(readAllRefsPreference)
  const history = useGitGraphHistory(worktreeId, allRefs)
  const ownerTarget = useWorktreeGitOwnerTarget(worktreeId)
  const [selectedId, setSelectedId] = useState<string | null>(
    () => viewByWorktree.get(worktreeId)?.selectedId ?? null
  )
  useEffect(() => {
    const saved = viewByWorktree.get(worktreeId)
    viewByWorktree.set(worktreeId, { scrollTop: saved?.scrollTop ?? 0, selectedId })
  }, [selectedId, worktreeId])
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const [listWidth, setListWidth] = useState(1200)
  useEffect(() => {
    const el = columnRef.current
    if (!el) {
      return
    }
    const observer = new ResizeObserver(([entry]) => setListWidth(entry!.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const restoredScrollRef = useRef(false)
  const hasRows = history.items.length > 0
  useLayoutEffect(() => {
    if (restoredScrollRef.current || !hasRows || !listRef.current) {
      return
    }
    restoredScrollRef.current = true
    listRef.current.scrollTop = viewByWorktree.get(worktreeId)?.scrollTop ?? 0
  }, [hasRows, worktreeId])
  const { handleCommitAction } = useGitHistoryCommitActions({
    activeWorktreeId: worktreeId,
    worktreePath: history.worktreePath,
    activeRepoTarget: ownerTarget,
    resolveSplitTargetGroupId: () => undefined
  })

  const result = history.result
  const viewModels = useMemo(() => {
    if (!result) {
      return []
    }
    return buildGitHistoryViewModels(
      history.items,
      buildDefaultGitHistoryColorMap(result),
      result.currentRef,
      result.remoteRef,
      result.baseRef,
      // With every branch drawn, upstream commits are rows of their own; no summary rows.
      allRefs ? false : result.hasIncomingChanges,
      allRefs ? false : result.hasOutgoingChanges,
      result.mergeBase
    )
  }, [allRefs, history.items, result])

  const graphWidth = useMemo(
    () =>
      viewModels.reduce(
        (max, vm) =>
          Math.max(
            max,
            LANE_WIDTH * (Math.max(vm.inputSwimlanes.length, vm.outputSwimlanes.length, 1) + 1)
          ),
        LANE_WIDTH * 2
      ),
    [viewModels]
  )
  // The graph column defaults to the widest row's lanes (plus its left padding) until dragged.
  const { layout, setWidth, resetWidth } = useGitGraphColumns(listWidth, graphWidth + 8)

  const commitRows = useMemo(
    () =>
      viewModels.filter((vm) => vm.kind !== 'incoming-changes' && vm.kind !== 'outgoing-changes'),
    [viewModels]
  )

  // Brings the commit and the details under it into view; the row wins when both don't fit.
  const scrollToCommit = useCallback((id: string) => {
    const list = listRef.current
    list?.querySelector('[data-git-graph-details]')?.scrollIntoView({ block: 'nearest' })
    list
      ?.querySelector(`[data-git-graph-commit="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [])

  const selectCommit = useCallback(
    (id: string) => {
      setSelectedId(id)
      requestAnimationFrame(() => scrollToCommit(id))
    },
    [scrollToCommit]
  )

  const moveSelection = (step: number): void => {
    const index = commitRows.findIndex((vm) => vm.historyItem.id === selectedId)
    const next = commitRows[Math.max(0, Math.min(commitRows.length - 1, index + step))]
    if (next) {
      selectCommit(next.historyItem.id)
    }
  }

  const findNext = (): void => {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return
    }
    const start = commitRows.findIndex((vm) => vm.historyItem.id === selectedId)
    for (let offset = 1; offset <= commitRows.length; offset += 1) {
      const vm = commitRows[(start + offset) % commitRows.length]!
      const item = vm.historyItem
      const haystack = [
        item.subject,
        item.message,
        item.author,
        item.id,
        ...(item.references ?? []).map((ref) => ref.name)
      ]
        .join('\n')
        .toLowerCase()
      if (haystack.includes(needle)) {
        selectCommit(item.id)
        return
      }
    }
  }

  // Load the next page as the list nears its end.
  const { hasMore, loadMore } = history
  const onScroll = (event: React.UIEvent<HTMLDivElement>): void => {
    const el = event.currentTarget
    viewByWorktree.set(worktreeId, { selectedId, scrollTop: el.scrollTop })
    if (hasMore && el.scrollHeight - el.scrollTop - el.clientHeight < GIT_GRAPH_ROW_HEIGHT * 40) {
      loadMore()
    }
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(ALL_REFS_STORAGE_KEY, String(allRefs))
    } catch {
      // Storage unavailable: the choice lasts for this tab only.
    }
  }, [allRefs])

  const [zoom, stepZoom] = useGitGraphZoom()
  const scopeButton = (value: boolean, label: string): React.JSX.Element => (
    <button
      type="button"
      className={cn(
        'h-6 rounded px-2 text-xs whitespace-nowrap',
        allRefs === value
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
      onClick={() => setAllRefs(value)}
    >
      {label}
    </button>
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-1.5">
        <span className="shrink-0 text-sm font-semibold whitespace-nowrap">
          {translate('local.gitGraph.title', 'Git Graph')}
        </span>
        {result?.currentRef && (
          <span className="min-w-0 truncate text-xs whitespace-nowrap text-muted-foreground">
            HEAD: <span className="text-foreground">{result.currentRef.name}</span>
          </span>
        )}
        <div className="flex shrink-0 items-center rounded-md border border-border p-0.5">
          {scopeButton(true, translate('local.gitGraph.allBranches', 'All branches'))}
          {scopeButton(false, translate('local.gitGraph.currentBranch', 'Current branch'))}
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <div className="flex h-6 min-w-0 items-center gap-1 rounded-md border border-border px-1.5">
            <Search className="size-3 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !isImeOwnedKeyboardEvent(event)) {
                  event.preventDefault()
                  findNext()
                }
              }}
              placeholder={translate('local.gitGraph.find', 'Find commit (Enter: next)')}
              className="w-32 min-w-0 lg:w-56 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {history.items.length}
            {history.hasMore ? '+' : ''} commits
          </span>
          <div className="flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={translate('local.gitGraph.smaller', 'Smaller text')}
              disabled={zoom <= ZOOM_STEPS[0]}
              onClick={() => stepZoom(-1)}
            >
              <Minus className="size-3.5" />
            </Button>
            <span className="w-9 text-center text-xs tabular-nums text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={translate('local.gitGraph.larger', 'Larger text')}
              disabled={zoom >= (ZOOM_STEPS.at(-1) ?? DEFAULT_ZOOM)}
              onClick={() => stepZoom(1)}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={translate('local.gitGraph.refresh', 'Refresh')}
            onClick={history.refresh}
          >
            <RefreshCw className={cn('size-3.5', history.loading && 'animate-spin')} />
          </Button>
        </div>
      </div>
      {allRefs && result && result.allRefs !== true && (
        <div className="shrink-0 border-b border-border px-3 py-1 text-xs text-muted-foreground">
          {translate(
            'local.gitGraph.olderHost',
            "This workspace's machine runs an older Orca, so only the current branch shows until it updates."
          )}
        </div>
      )}
      <div className="flex min-h-0 flex-1" style={{ zoom }}>
        <div ref={columnRef} className="flex min-w-0 flex-1 flex-col">
          <GitGraphHeaderRow layout={layout} onResize={setWidth} onReset={resetWidth} />
          <div
            ref={listRef}
            role="grid"
            tabIndex={0}
            className="min-h-0 flex-1 overflow-y-auto outline-none scrollbar-sleek"
            onScroll={onScroll}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                moveSelection(event.key === 'ArrowDown' ? 1 : -1)
              } else if (event.key === 'Escape') {
                setSelectedId(null)
              }
            }}
          >
            {history.error && (
              <div className="px-3 py-2 text-xs text-destructive">{history.error}</div>
            )}
            {!history.error && history.loading && viewModels.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Loading graph…</div>
            )}
            {viewModels.map((vm) => {
              const item = vm.historyItem
              const row = (
                <GitGraphRow
                  viewModel={vm}
                  layout={layout}
                  selected={item.id === selectedId}
                  currentRefId={result?.currentRef?.id}
                  onSelect={() =>
                    item.id === selectedId ? setSelectedId(null) : selectCommit(item.id)
                  }
                  onOpen={() => selectCommit(item.id)}
                />
              )
              const isBoundary = vm.kind === 'incoming-changes' || vm.kind === 'outgoing-changes'
              if (isBoundary) {
                return <React.Fragment key={`${vm.kind}:${item.id}`}>{row}</React.Fragment>
              }
              const details = item.id === selectedId && history.worktreePath && (
                <div
                  data-git-graph-details
                  className="flex bg-muted/30"
                  aria-label="Commit details"
                >
                  <GitGraphLaneContinuation viewModel={vm} width={layout.graph} />
                  <GitGraphCommitDetails
                    worktreeId={worktreeId}
                    worktreePath={history.worktreePath}
                    ownerTarget={ownerTarget}
                    item={item}
                    onSelectCommit={selectCommit}
                    onClose={() => setSelectedId(null)}
                  />
                </div>
              )
              return (
                <React.Fragment key={`${vm.kind}:${item.id}`}>
                  <ContextMenu>
                    <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
                    <GitHistoryCommitContextMenu item={item} onAction={handleCommitAction} />
                  </ContextMenu>
                  {details}
                </React.Fragment>
              )
            })}
            {history.hasMore && (
              <div className="px-3 py-2">
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={history.loading}
                  onClick={history.loadMore}
                >
                  {translate('local.gitGraph.loadMore', 'Load more commits')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
