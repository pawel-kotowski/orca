// Local (glass build): the Git Graph toolbar's controls over which branches it draws and how:
// the branch picker, the Left lanes menu, the "Merges into" toggles (Paweł, 2026-11-17: "a way to
// quickly highlight all merges to development and to main") and Stack names (Paweł: "a way to
// hide all branch names if more than one belong in one position").
import React, { useCallback, useEffect, useState } from 'react'
import { GitMerge, Layers } from 'lucide-react'
import { cn } from '@/lib/class-names'
import { graphColor } from '@/components/right-sidebar/source-control/sync/git-history-graph-svg'
import type {
  GitHistoryGraphColorId,
  GitHistoryItemRef,
  GitHistoryRefs
} from '../../../../../shared/git/history/git-history-types'
import { GitGraphBranchSelect } from './git-graph-branch-select'
import { GitGraphLaneOrder } from './git-graph-lane-order'

const STACK_STORAGE_KEY = 'orca.gitGraph.stackNames'

/** Several names on one commit show as one, with "+N" (on until turned off). */
export function useGitGraphStackNames(): [boolean, () => void] {
  const [stack, setStack] = useState(() => {
    try {
      return window.localStorage.getItem(STACK_STORAGE_KEY) !== 'false'
    } catch {
      return true
    }
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(STACK_STORAGE_KEY, String(stack))
    } catch {
      // Storage unavailable: the choice lasts for this tab only.
    }
  }, [stack])
  const toggle = useCallback(() => setStack((current) => !current), [])
  return [stack, toggle]
}

function Toggle({
  on,
  title,
  onClick,
  children
}: {
  on: boolean
  title: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs whitespace-nowrap',
        on
          ? 'border-ring bg-accent text-accent-foreground'
          : 'border-border text-muted-foreground hover:text-foreground'
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function GitGraphShapeControls({
  refs,
  refsFilter,
  onRefsFilter,
  headRefId,
  pinned,
  customPinned,
  onPinned,
  onResetPinned,
  branchNames,
  colourOf,
  mergeTargets,
  mergeCounts,
  onToggleMerge,
  stackNames,
  onToggleStackNames
}: {
  refs: readonly GitHistoryItemRef[]
  refsFilter: GitHistoryRefs
  onRefsFilter: (next: GitHistoryRefs) => void
  headRefId?: string
  pinned: string[]
  customPinned: boolean
  onPinned: (names: string[]) => void
  onResetPinned: () => void
  branchNames: string[]
  colourOf: (name: string) => GitHistoryGraphColorId
  mergeTargets: string[]
  /** Loaded merges into each pinned branch. */
  mergeCounts: Map<string, number>
  onToggleMerge: (branch: string) => void
  stackNames: boolean
  onToggleStackNames: () => void
}): React.JSX.Element {
  return (
    <>
      <GitGraphBranchSelect
        refs={refs}
        value={refsFilter}
        pinned={pinned}
        headRefId={headRefId}
        onChange={onRefsFilter}
      />
      <GitGraphLaneOrder
        pinned={pinned}
        custom={customPinned}
        branches={branchNames}
        colourOf={colourOf}
        onChange={onPinned}
        onReset={onResetPinned}
      />
      {pinned.length > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <GitMerge className="size-3.5" />
          Merges into
          {pinned.map((branch) => (
            <Toggle
              key={branch}
              on={mergeTargets.includes(branch)}
              title={`Highlight every merge into ${branch}: merge commits and pull requests squashed onto it. n and Shift+N step through them`}
              onClick={() => onToggleMerge(branch)}
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ background: graphColor(colourOf(branch)) }}
              />
              {branch}
              <span className="tabular-nums opacity-70">{mergeCounts.get(branch) ?? 0}</span>
            </Toggle>
          ))}
        </span>
      )}
      <Toggle
        on={stackNames}
        title="Several branch names on one commit show as one name and +N"
        onClick={onToggleStackNames}
      >
        <Layers className="size-3.5" />
        Stack names
      </Toggle>
    </>
  )
}
