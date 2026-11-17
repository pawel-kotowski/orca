// Local (glass build): the Git Graph tab — every branch's history as a full-size graph. Three ways
// to read it (Detailed: full messages and branch names, rows as tall as they need; Compact: one
// line per commit; Branches: only tips, merges and fork points), one-click jumps to HEAD, main and
// development, and a followed branch that fades every commit off its line. A clicked commit's
// details open under its row, and their files open as diffs beside the graph.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useWorktreeGitOwnerTarget } from '@/components/right-sidebar/source-control/sync/worktree-git-owner-target'
import { useGitHistoryCommitActions } from '@/components/right-sidebar/source-control/sync/use-git-history-commit-actions'
import { GitHistoryCommitContextMenu } from '@/components/right-sidebar/source-control/sync/git-history-commit-context-menu'
import {
  buildDefaultGitHistoryColorMap,
  buildGitHistoryViewModels,
  getGitHistoryItemColor,
  type GitHistoryItemViewModel
} from '../../../../../shared/git/history/git-history-graph'
import { useClassicGitGraphHistory } from './use-git-graph-history-local'
import { GIT_GRAPH_ROW_HEIGHT, GitGraphHeaderRow } from './git-graph-row'
import { useGitGraphColumns } from './git-graph-columns'
import { GitGraphCommitDetails } from './git-graph-commit-details'
import { GitGraphLaneFill } from './git-graph-tall-row'
import { GitGraphCommitRow } from './git-graph-commit-row'
import { gitGraphLaneNames } from './git-graph-lane-names'
import { outlineGitGraphItems } from './git-graph-outline'
import { useGitGraphJump } from './use-git-graph-jump'
import { GitGraphToolbar, useGitGraphDensity, useGitGraphZoom } from './git-graph-toolbar'
import { useGitGraphKeys } from './use-git-graph-keys'

// Matches SWIMLANE_WIDTH in git-history-graph-svg.tsx: one lane's width in px.
const LANE_WIDTH = 11
const ALL_REFS_STORAGE_KEY = 'orca.gitGraph.allRefs'

// Selection and scroll survive the tab remounting (a split beside it moves its group).
const viewByWorktree = new Map<string, { selectedId: string | null; scrollTop: number }>()

function readAllRefsPreference(): boolean {
  try {
    return window.localStorage.getItem(ALL_REFS_STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

/** Runs after React has drawn the next state (a view switch re-renders every row first). */
function afterPaint(run: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(run))
}

export function GitGraphView({ worktreeId }: { worktreeId: string }): React.JSX.Element {
  const [allRefs, setAllRefs] = useState(readAllRefsPreference)
  const [density, setDensity] = useGitGraphDensity()
  const [zoom, stepZoom] = useGitGraphZoom()
  const history = useClassicGitGraphHistory(worktreeId, allRefs)
  const ownerTarget = useWorktreeGitOwnerTarget(worktreeId)
  const [selectedId, setSelectedId] = useState<string | null>(
    () => viewByWorktree.get(worktreeId)?.selectedId ?? null
  )
  useEffect(() => {
    const saved = viewByWorktree.get(worktreeId)
    viewByWorktree.set(worktreeId, { scrollTop: saved?.scrollTop ?? 0, selectedId })
  }, [selectedId, worktreeId])
  const [query, setQuery] = useState('')
  const [focusedBranch, setFocusedBranch] = useState<string | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
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
  useEffect(() => {
    try {
      window.localStorage.setItem(ALL_REFS_STORAGE_KEY, String(allRefs))
    } catch {
      // Storage unavailable: the choice lasts for this tab only.
    }
  }, [allRefs])
  const { handleCommitAction } = useGitHistoryCommitActions({
    activeWorktreeId: worktreeId,
    worktreePath: history.worktreePath,
    activeRepoTarget: ownerTarget,
    resolveSplitTargetGroupId: () => undefined
  })

  const result = history.result
  const laneNames = useMemo(() => gitGraphLaneNames(history.items), [history.items])
  // The Branches view rewrites parents; details, actions and "+N commits" read the real commit.
  const itemById = useMemo(
    () => new Map(history.items.map((item) => [item.id, item])),
    [history.items]
  )
  const outline = useMemo(
    () =>
      density === 'branches'
        ? outlineGitGraphItems(history.items, result?.currentRef?.revision)
        : null,
    [density, history.items, result?.currentRef?.revision]
  )
  const shownItems = outline?.items ?? history.items
  const viewModels = useMemo(() => {
    if (!result) {
      return []
    }
    return buildGitHistoryViewModels(
      shownItems,
      buildDefaultGitHistoryColorMap(result),
      result.currentRef,
      result.remoteRef,
      result.baseRef,
      // With every branch drawn, upstream commits are rows of their own; no summary rows.
      allRefs || outline ? false : result.hasIncomingChanges,
      allRefs || outline ? false : result.hasOutgoingChanges,
      result.mergeBase
    )
  }, [allRefs, outline, result, shownItems])

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
  const shownIds = useMemo(() => new Set(commitRows.map((vm) => vm.historyItem.id)), [commitRows])

  // Brings the commit and the details under it into view; the row wins when both don't fit.
  const scrollToCommit = useCallback((id: string, block: ScrollLogicalPosition = 'nearest') => {
    const list = listRef.current
    list?.querySelector('[data-git-graph-details]')?.scrollIntoView({ block: 'nearest' })
    list?.querySelector(`[data-git-graph-commit="${CSS.escape(id)}"]`)?.scrollIntoView({ block })
  }, [])

  // A commit folded away in the Branches view is shown in the Detailed one.
  const ensureShown = useCallback(
    (id: string): boolean => {
      if (shownIds.has(id) || density !== 'branches') {
        return false
      }
      setDensity('detailed')
      return true
    },
    [density, setDensity, shownIds]
  )

  const selectCommit = useCallback(
    (id: string) => {
      const switched = ensureShown(id)
      setSelectedId(id)
      ;(switched ? afterPaint : requestAnimationFrame)(() => scrollToCommit(id))
    },
    [ensureShown, scrollToCommit]
  )

  const flashTimer = useRef<number | undefined>(undefined)
  const reveal = useCallback(
    (id: string) => {
      const switched = ensureShown(id)
      setFlashId(id)
      window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => setFlashId(null), 1600)
      ;(switched ? afterPaint : requestAnimationFrame)(() => {
        scrollToCommit(id, 'center')
        listRef.current?.focus({ preventScroll: true })
      })
    },
    [ensureShown, scrollToCommit]
  )
  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  const jumps = useGitGraphJump({
    worktreeId,
    worktreePath: history.worktreePath,
    ownerTarget,
    result,
    items: history.items,
    hasMore: history.hasMore,
    loading: history.loading,
    loadMore: history.loadMore,
    allRefs,
    setAllRefs,
    reveal
  })

  const moveSelection = (step: number): void => {
    const index = commitRows.findIndex((vm) => vm.historyItem.id === selectedId)
    const next = commitRows[Math.max(0, Math.min(commitRows.length - 1, index + step))]
    if (next) {
      selectCommit(next.historyItem.id)
    }
  }

  // Find searches every loaded commit, folded or not, from the selected one on.
  const findNext = (): void => {
    const needle = query.trim().toLowerCase()
    const items = history.items
    if (!needle || items.length === 0) {
      return
    }
    const start = items.findIndex((item) => item.id === selectedId)
    for (let offset = 1; offset <= items.length; offset += 1) {
      const item = items[(start + offset) % items.length]!
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

  const followBranch = useCallback((name: string) => {
    setFocusedBranch((current) => (current === name ? null : name))
  }, [])

  const onKeyDown = useGitGraphKeys({
    density,
    setDensity,
    jumps,
    moveSelection,
    onEscape: () => {
      if (focusedBranch) {
        setFocusedBranch(null)
      } else {
        setSelectedId(null)
      }
    }
  })

  // Load the next page as the list nears its end.
  const { hasMore, loadMore } = history
  const onScroll = (event: React.UIEvent<HTMLDivElement>): void => {
    const el = event.currentTarget
    viewByWorktree.set(worktreeId, { selectedId, scrollTop: el.scrollTop })
    if (hasMore && el.scrollHeight - el.scrollTop - el.clientHeight < GIT_GRAPH_ROW_HEIGHT * 40) {
      loadMore()
    }
  }

  const renderRow = (vm: GitHistoryItemViewModel): React.JSX.Element => {
    const id = vm.historyItem.id
    return (
      <GitGraphCommitRow
        viewModel={vm}
        layout={layout}
        density={density}
        selected={id === selectedId}
        flashing={flashId === id}
        focusedBranch={focusedBranch}
        laneNames={laneNames}
        currentRefId={result?.currentRef?.id}
        foldedByEdge={outline?.foldedByEdge}
        onSelect={() => (id === selectedId ? setSelectedId(null) : selectCommit(id))}
        onOpen={() => selectCommit(id)}
        onFocusBranch={followBranch}
        onShowCommits={() => {
          // The real first parent is the newest of the commits the Branches view folded.
          const first = itemById.get(id)?.parentIds[0]
          setDensity('detailed')
          if (first) {
            afterPaint(() => reveal(first))
          }
        }}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <GitGraphToolbar
        allRefs={allRefs}
        onAllRefs={setAllRefs}
        density={density}
        onDensity={setDensity}
        zoom={zoom}
        onZoom={stepZoom}
        loading={history.loading}
        onRefresh={history.refresh}
        head={jumps.head}
        main={jumps.main}
        develop={jumps.develop}
        refs={jumps.refs}
        onJump={jumps.jump}
        pendingJump={jumps.pending}
        notice={jumps.notice}
        onClearNotice={jumps.clearNotice}
        focusedBranch={focusedBranch}
        onClearFocus={() => setFocusedBranch(null)}
        query={query}
        onQuery={setQuery}
        onFindNext={findNext}
        commitCount={history.items.length}
        hasMore={history.hasMore}
      />
      {allRefs && result && result.refs !== 'all' && (
        <div className="shrink-0 border-b border-border px-3 py-1 text-xs text-muted-foreground">
          {translate(
            'local.gitGraph.olderHost',
            "This workspace's machine runs an older Orca, so only the current branch shows until it updates."
          )}
        </div>
      )}
      <div className="flex min-h-0 flex-1" style={{ zoom }}>
        <div ref={columnRef} className="flex min-w-0 flex-1 flex-col">
          <GitGraphHeaderRow
            layout={layout}
            onResize={setWidth}
            onReset={resetWidth}
            descriptionLabel={density === 'branches' ? 'Branches and merges' : undefined}
          />
          <div
            ref={listRef}
            role="grid"
            tabIndex={0}
            className="min-h-0 flex-1 overflow-y-auto outline-none scrollbar-sleek"
            onScroll={onScroll}
            onKeyDown={onKeyDown}
          >
            {history.error && (
              <div className="px-3 py-2 text-xs text-destructive">{history.error}</div>
            )}
            {!history.error && history.loading && viewModels.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Loading graph…</div>
            )}
            {viewModels.map((vm) => {
              const item = vm.historyItem
              const row = renderRow(vm)
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
                  {/* overflow-hidden: lanes past a narrowed graph column are clipped instead of
                      drawing over the details (Paweł, 2026-11-15: "files overlap with lines"). */}
                  <GitGraphLaneFill
                    lanes={vm.outputSwimlanes}
                    className="shrink-0 self-stretch"
                    style={{ width: layout.graph }}
                  />
                  <GitGraphCommitDetails
                    worktreeId={worktreeId}
                    worktreePath={history.worktreePath}
                    ownerTarget={ownerTarget}
                    item={itemById.get(item.id) ?? item}
                    onSelectCommit={selectCommit}
                    onClose={() => setSelectedId(null)}
                    laneColor={getGitHistoryItemColor(vm)}
                  />
                </div>
              )
              return (
                <React.Fragment key={`${vm.kind}:${item.id}`}>
                  <ContextMenu>
                    <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
                    <GitHistoryCommitContextMenu
                      item={itemById.get(item.id) ?? item}
                      onAction={handleCommitAction}
                    />
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
