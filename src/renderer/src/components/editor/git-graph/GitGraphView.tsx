// Local (glass build): the Git Graph tab — every branch's history as a full-size graph. Three ways
// to read it (Detailed: full messages and branch names, rows as tall as they need; Compact: one
// line per commit; Branches: only tips, merges and fork points, each opening the commits it stands
// for). Lanes are coloured and placed by branch, pinned branches (main, development) leftmost; a
// picker chooses which branches are drawn; one-click jumps go to HEAD, main and development; in
// Detailed and Compact a followed branch fades every commit off its line. A clicked commit's
// details open under its row, and their files open as diffs beside the graph.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useWorktreeById } from '@/store/workspaces/selection/use-selected-worktree'
import { useWorktreeGitOwnerTarget } from '@/components/right-sidebar/source-control/sync/worktree-git-owner-target'
import { useGitHistoryCommitActions } from '@/components/right-sidebar/source-control/sync/use-git-history-commit-actions'
import type { GitHistoryRefs } from '../../../../../shared/git/history/git-history-types'
import { useClassicGitGraphHistory } from './use-git-graph-history-local'
import { GIT_GRAPH_ROW_HEIGHT, GitGraphHeaderRow } from './git-graph-row'
import { useGitGraphColumns } from './git-graph-columns'
import { useGitGraphJump, useGitGraphRefList } from './use-git-graph-jump'
import { GitGraphToolbar, useGitGraphDensity, useGitGraphZoom } from './git-graph-toolbar'
import { useGitGraphKeys } from './use-git-graph-keys'
import { GitGraphAuthorHuesProvider } from './git-graph-author-color'
import { GitGraphBranchColoursProvider } from './git-graph-branch-colour-context'
import { gitGraphBranchName } from './git-graph-lane-names'
import { useGitGraphPinnedLanes } from './use-git-graph-pinned-lanes'
import { GitGraphShapeControls, useGitGraphStackNames } from './git-graph-shape-controls'
import {
  isGitGraphMergeInto,
  nextGitGraphMark,
  useGitGraphMergeMarks
} from './use-git-graph-merge-marks'
import { findGitGraphCommit } from './git-graph-find'
import { useGitGraphRows } from './use-git-graph-rows'
import { GitGraphList } from './git-graph-list'

// Selection, scroll and the drawn branches survive the tab remounting (a split beside it moves
// its group).
const viewByWorktree = new Map<
  string,
  { selectedId: string | null; scrollTop: number; refs: GitHistoryRefs }
>()

/** Runs after React has drawn the next state (a view switch re-renders every row first). */
function afterPaint(run: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(run))
}

export function GitGraphView({ worktreeId }: { worktreeId: string }): React.JSX.Element {
  const saved = viewByWorktree.get(worktreeId)
  const [refsFilter, setRefsFilter] = useState<GitHistoryRefs>(saved?.refs ?? 'all')
  const [density, setDensity] = useGitGraphDensity()
  const [zoom, stepZoom] = useGitGraphZoom()
  const history = useClassicGitGraphHistory(worktreeId, refsFilter)
  const ownerTarget = useWorktreeGitOwnerTarget(worktreeId)
  const repoKey = useWorktreeById(worktreeId)?.repoId ?? null
  const [selectedId, setSelectedId] = useState<string | null>(saved?.selectedId ?? null)
  const [openCommitId, setOpenCommitId] = useState<string | null>(null)
  useEffect(() => {
    const previous = viewByWorktree.get(worktreeId)
    viewByWorktree.set(worktreeId, {
      scrollTop: previous?.scrollTop ?? 0,
      selectedId,
      refs: refsFilter
    })
  }, [refsFilter, selectedId, worktreeId])
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
  const { handleCommitAction } = useGitHistoryCommitActions({
    activeWorktreeId: worktreeId,
    worktreePath: history.worktreePath,
    activeRepoTarget: ownerTarget,
    resolveSplitTargetGroupId: () => undefined
  })

  const result = history.result
  const refs = useGitGraphRefList({
    worktreeId,
    worktreePath: history.worktreePath,
    ownerTarget,
    historyToken: result?.historyToken,
    items: history.items
  })
  const lanes = useGitGraphPinnedLanes(repoKey, refs)
  // A pinned branch the repo has and the branch picker draws keeps its column before it loads.
  const drawnPinned = useMemo(
    () =>
      lanes.pinned.filter((name) =>
        refs.some(
          (ref) =>
            gitGraphBranchName(ref) === name &&
            (refsFilter === 'all' || (Array.isArray(refsFilter) && refsFilter.includes(ref.id)))
        )
      ),
    [lanes.pinned, refs, refsFilter]
  )
  const model = useGitGraphRows({
    items: history.items,
    result,
    density,
    pinned: lanes.pinned,
    drawnPinned
  })
  const marks = useGitGraphMergeMarks()
  const [stackNames, toggleStackNames] = useGitGraphStackNames()
  const mergeCounts = new Map(
    lanes.pinned.map((branch) => [
      branch,
      model.rows.filter((row) => isGitGraphMergeInto(row, model.laneNames, [branch])).length
    ])
  )
  const { layout, setWidth, resetWidth, toggleColumn } = useGitGraphColumns(
    listWidth,
    model.graphWidth + 8
  )

  // In Branches a selected commit that folded into a row opens that row, at the commit; moving
  // between views keeps the commit you were on. `openCommitId` is only for a row's own commit.
  const branches = density === 'branches'
  const foldedOwner = branches && selectedId ? model.rowOf.get(selectedId) : undefined
  const expandedRow = foldedOwner ?? selectedId
  const openCommit = branches ? (foldedOwner ? selectedId : openCommitId) : null
  const openCommitInRow = (commit: string | null): void => {
    setSelectedId(commit ?? expandedRow)
    setOpenCommitId(commit && !model.rowOf.has(commit) ? commit : null)
  }

  const scrollTo = useCallback((id: string, block: ScrollLogicalPosition = 'nearest') => {
    const list = listRef.current
    list?.querySelector('[data-git-graph-details]')?.scrollIntoView({ block: 'nearest' })
    const target =
      list?.querySelector(`[data-git-graph-commit-line="${CSS.escape(id)}"]`) ??
      list?.querySelector(`[data-git-graph-commit="${CSS.escape(id)}"]`)
    target?.scrollIntoView({ block })
  }, [])

  // Shows a commit: its row's details, or in Branches the row it belongs to, opened at it.
  const selectCommit = useCallback(
    (id: string, block: ScrollLogicalPosition = 'nearest') => {
      setSelectedId(id)
      setOpenCommitId(density === 'branches' ? id : null)
      afterPaint(() => scrollTo(id, block))
    },
    [density, scrollTo]
  )

  const toggleRow = (id: string): void => {
    if (id === expandedRow) {
      setSelectedId(null)
      setOpenCommitId(null)
    } else if (branches) {
      setSelectedId(id)
      setOpenCommitId(null)
    } else {
      selectCommit(id)
    }
  }

  const flashTimer = useRef<number | undefined>(undefined)
  const reveal = useCallback(
    (id: string) => {
      setFlashId(id)
      window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => setFlashId(null), 1600)
      if (density === 'branches' && model.rowOf.has(id)) {
        selectCommit(id, 'center')
        return
      }
      afterPaint(() => {
        scrollTo(id, 'center')
        listRef.current?.focus({ preventScroll: true })
      })
    },
    [density, model.rowOf, scrollTo, selectCommit]
  )
  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  const jumps = useGitGraphJump({
    refs,
    pinned: lanes.pinned,
    result,
    items: history.items,
    hasMore: history.hasMore,
    loading: history.loading,
    loadMore: history.loadMore,
    refsFilter,
    showAllRefs: () => setRefsFilter('all'),
    reveal
  })

  const moveSelection = (step: number): void => {
    const index = model.rows.findIndex((row) => row.historyItem.id === expandedRow)
    const next = model.rows[Math.max(0, Math.min(model.rows.length - 1, index + step))]
    if (next) {
      if (density === 'branches') {
        setSelectedId(next.historyItem.id)
        setOpenCommitId(null)
        afterPaint(() => scrollTo(next.historyItem.id))
      } else {
        selectCommit(next.historyItem.id)
      }
    }
  }

  // Find searches every loaded commit, folded or not, from the selected one on.
  const findNext = (): void => {
    const found = findGitGraphCommit(history.items, query, openCommit ?? selectedId)
    if (found) {
      selectCommit(found)
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
    // n / Shift+N: the next or previous highlighted merge.
    onNextMark: (step) => {
      const target = nextGitGraphMark(model.rows, model.laneNames, marks.targets, expandedRow, step)
      if (target) {
        setSelectedId(target)
        setOpenCommitId(null)
        reveal(target)
      }
    },
    onEscape: () => {
      if (marks.targets.length > 0) {
        marks.clear()
      } else if (focusedBranch) {
        setFocusedBranch(null)
      } else if (openCommit) {
        openCommitInRow(null)
      } else {
        setSelectedId(null)
      }
    }
  })

  // Load the next page as the list nears its end.
  const { hasMore, loadMore } = history
  const onScroll = (event: React.UIEvent<HTMLDivElement>): void => {
    const el = event.currentTarget
    const previous = viewByWorktree.get(worktreeId)
    viewByWorktree.set(worktreeId, {
      selectedId,
      scrollTop: el.scrollTop,
      refs: previous?.refs ?? refsFilter
    })
    if (hasMore && el.scrollHeight - el.scrollTop - el.clientHeight < GIT_GRAPH_ROW_HEIGHT * 40) {
      loadMore()
    }
  }

  const branchNames = [
    ...new Set(refs.map((ref) => gitGraphBranchName(ref)).filter((name) => !!name))
  ] as string[]
  // A host that predates named refs draws only HEAD's history whatever is asked.
  const hostIgnoresRefs = !!result && (result.refs === undefined || result.refs === 'head')

  return (
    // Dark themes: the graph sits on a surface darker than the theme's base, so its text and lane
    // colours stand out (Paweł, 2026-11-17: "contrast still too low make all dark colors darker").
    <div className="h-full min-h-0 bg-background">
      <div className="flex h-full min-h-0 flex-col text-foreground dark:bg-black/30">
        <GitGraphToolbar
          controls={
            <GitGraphShapeControls
              refs={refs}
              refsFilter={refsFilter}
              onRefsFilter={setRefsFilter}
              headRefId={result?.currentRef?.id}
              pinned={lanes.pinned}
              customPinned={lanes.custom}
              onPinned={lanes.setPinned}
              onResetPinned={lanes.reset}
              branchNames={branchNames}
              colourOf={model.colourOf}
              mergeTargets={marks.targets}
              mergeCounts={mergeCounts}
              onToggleMerge={marks.toggle}
              stackNames={stackNames}
              onToggleStackNames={toggleStackNames}
            />
          }
          density={density}
          onDensity={setDensity}
          zoom={zoom}
          onZoom={stepZoom}
          loading={history.loading}
          onRefresh={history.refresh}
          head={jumps.head}
          main={jumps.main}
          develop={jumps.develop}
          refs={refs}
          onJump={jumps.jump}
          pendingJump={jumps.pending}
          notice={jumps.notice}
          onClearNotice={jumps.clearNotice}
          focusedBranch={density === 'branches' ? null : focusedBranch}
          onClearFocus={() => setFocusedBranch(null)}
          query={query}
          onQuery={setQuery}
          onFindNext={findNext}
          commitCount={history.items.length}
          hasMore={history.hasMore}
        />
        {hostIgnoresRefs && (
          <div className="shrink-0 border-b border-border px-3 py-1 text-xs text-muted-foreground">
            {translate(
              'local.gitGraph.olderHost',
              "This workspace's machine runs an older Orca, so only the current branch shows until it updates."
            )}
          </div>
        )}
        <GitGraphAuthorHuesProvider value={model.authorHues}>
          <GitGraphBranchColoursProvider value={model.branchColour}>
            <div className="flex min-h-0 flex-1" style={{ zoom }}>
              <div ref={columnRef} className="flex min-w-0 flex-1 flex-col">
                <GitGraphHeaderRow
                  layout={layout}
                  onResize={setWidth}
                  onReset={resetWidth}
                  onToggleColumn={toggleColumn}
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
                  {!history.error && history.loading && model.rows.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Loading graph…</div>
                  )}
                  <GitGraphList
                    model={model}
                    layout={layout}
                    density={density}
                    worktreeId={worktreeId}
                    worktreePath={history.worktreePath}
                    ownerTarget={ownerTarget}
                    currentRefId={result?.currentRef?.id}
                    selectedId={expandedRow}
                    openCommitId={openCommit}
                    flashId={flashId}
                    focusedBranch={focusedBranch}
                    mergeTargets={marks.targets}
                    stackNames={stackNames}
                    onToggleRow={toggleRow}
                    onSelectCommit={selectCommit}
                    onOpenCommit={openCommitInRow}
                    onCloseCommit={() => setSelectedId(null)}
                    onFocusBranch={followBranch}
                    onCommitAction={handleCommitAction}
                  />
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
          </GitGraphBranchColoursProvider>
        </GitGraphAuthorHuesProvider>
      </div>
    </div>
  )
}
