// Local (glass build): the Git Graph tab's two toolbar lines (Paweł, 2026-11-17: "top panel is not
// used well, zoom control takes whole row": zoom and refresh share the second line). The first sets what the graph shows:
// which branches (all until some are unticked), which sit leftmost, how each commit reads (Detailed: full messages and branch names; Compact: one
// line each; Branches: only tips, merges and fork points), text size, refresh. The second moves
// around it: HEAD, main and development one click away (keys h, m, d), any branch by name, the
// branch being followed, and find.
import React, { useCallback, useEffect, useState } from 'react'
import { Crosshair, Minus, Plus, RefreshCw, Search, X } from 'lucide-react'
import { cn } from '@/lib/class-names'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { GitHistoryItemRef } from '../../../../../shared/git/history/git-history-types'
import { GitGraphBranchPicker } from './git-graph-branch-picker'
import type { GitGraphJumpTarget } from './use-git-graph-jump'

export type GitGraphDensity = 'detailed' | 'compact' | 'branches'

// Text size of the graph, list and details (Paweł, 2026-11-09: "git graph font size is too small
// add resize button"); CSS zoom keeps rows, lanes and text in proportion.
const ZOOM_STORAGE_KEY = 'orca.gitGraph.zoom'
export const GIT_GRAPH_ZOOM_STEPS = [0.9, 1, 1.1, 1.15, 1.25, 1.4, 1.6, 1.8]
const DEFAULT_ZOOM = 1.15

function readStored<T>(key: string, accept: (value: string | null) => T): T {
  try {
    return accept(window.localStorage.getItem(key))
  } catch {
    return accept(null)
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: the choice lasts for this tab only.
  }
}

export function useGitGraphZoom(): [number, (direction: 1 | -1) => void] {
  const [zoom, setZoom] = useState(() =>
    readStored(ZOOM_STORAGE_KEY, (value) => {
      const stored = Number(value)
      return GIT_GRAPH_ZOOM_STEPS.includes(stored) ? stored : DEFAULT_ZOOM
    })
  )
  useEffect(() => writeStored(ZOOM_STORAGE_KEY, String(zoom)), [zoom])
  const step = useCallback((direction: 1 | -1) => {
    setZoom((current) => {
      const index = GIT_GRAPH_ZOOM_STEPS.indexOf(current)
      return GIT_GRAPH_ZOOM_STEPS[
        Math.min(GIT_GRAPH_ZOOM_STEPS.length - 1, Math.max(0, index + direction))
      ]!
    })
  }, [])
  return [zoom, step]
}

const DENSITY_STORAGE_KEY = 'orca.gitGraph.density'

export function useGitGraphDensity(): [GitGraphDensity, (next: GitGraphDensity) => void] {
  const [density, setDensity] = useState<GitGraphDensity>(() =>
    readStored(DENSITY_STORAGE_KEY, (value) =>
      value === 'compact' || value === 'branches' ? value : 'detailed'
    )
  )
  const choose = useCallback((next: GitGraphDensity) => {
    setDensity(next)
    writeStored(DENSITY_STORAGE_KEY, next)
  }, [])
  return [density, choose]
}

function Segmented<T extends string | boolean>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string; title?: string }[]
  onChange: (value: T) => void
}): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center rounded-md border border-border p-0.5">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={value === option.value}
          title={option.title}
          className={cn(
            'h-6 rounded px-2 text-xs whitespace-nowrap',
            value === option.value
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function JumpButton({
  target,
  hint,
  keyHint,
  onJump,
  busy
}: {
  target: GitGraphJumpTarget | undefined
  hint?: string
  keyHint: string
  onJump: (target: GitGraphJumpTarget) => void
  busy: boolean
}): React.JSX.Element | null {
  if (!target) {
    return null
  }
  return (
    <button
      type="button"
      title={`Go to ${target.label} (key ${keyHint})`}
      className={cn(
        'inline-flex min-h-6 max-w-full min-w-0 items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-left text-xs hover:border-ring hover:bg-accent',
        busy && 'animate-pulse'
      )}
      onClick={() => onJump(target)}
    >
      {hint && (
        <span className="shrink-0 rounded-sm bg-foreground/10 px-1 text-[9.5px] font-semibold tracking-wide">
          {hint}
        </span>
      )}
      <span className="font-medium break-all">{target.label}</span>
    </button>
  )
}

export function GitGraphToolbar({
  controls,
  density,
  onDensity,
  zoom,
  onZoom,
  loading,
  onRefresh,
  head,
  main,
  develop,
  refs,
  onJump,
  pendingJump,
  notice,
  onClearNotice,
  focusedBranch,
  onClearFocus,
  query,
  onQuery,
  onFindNext,
  commitCount,
  hasMore
}: {
  /** Which branches are drawn and how (GitGraphShapeControls). */
  controls: React.ReactNode
  density: GitGraphDensity
  onDensity: (value: GitGraphDensity) => void
  zoom: number
  onZoom: (direction: 1 | -1) => void
  loading: boolean
  onRefresh: () => void
  head?: GitGraphJumpTarget
  main?: GitGraphJumpTarget
  develop?: GitGraphJumpTarget
  refs: readonly GitHistoryItemRef[]
  onJump: (target: GitGraphJumpTarget) => void
  pendingJump: GitGraphJumpTarget | null
  notice: string | null
  onClearNotice: () => void
  focusedBranch: string | null
  onClearFocus: () => void
  query: string
  onQuery: (value: string) => void
  onFindNext: () => void
  commitCount: number
  hasMore: boolean
}): React.JSX.Element {
  const busy = (target?: GitGraphJumpTarget) =>
    !!target && pendingJump?.revision === target.revision
  return (
    <div className="shrink-0 border-b border-border">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5">
        <span className="shrink-0 text-sm font-semibold whitespace-nowrap">
          {translate('local.gitGraph.title', 'Git Graph')}
        </span>
        <Segmented
          value={density}
          onChange={onDensity}
          options={[
            {
              value: 'detailed',
              label: 'Detailed',
              title: 'Full commit messages and branch names (key v cycles views)'
            },
            { value: 'compact', label: 'Compact', title: 'One line per commit' },
            {
              value: 'branches',
              label: 'Branches',
              title: 'Only branch tips, merges and fork points: the big picture (key b)'
            }
          ]}
        />
        {controls}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 pb-1.5">
        <span className="text-xs text-foreground/70">Go to</span>
        <JumpButton target={head} hint="HEAD" keyHint="h" onJump={onJump} busy={busy(head)} />
        <JumpButton target={main} keyHint="m" onJump={onJump} busy={busy(main)} />
        <JumpButton target={develop} keyHint="d" onJump={onJump} busy={busy(develop)} />
        <GitGraphBranchPicker refs={refs} onJump={onJump} />
        {pendingJump && (
          <span className="text-xs text-muted-foreground">Loading to {pendingJump.label}…</span>
        )}
        {notice && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            {notice}
            <button type="button" aria-label="Dismiss" onClick={onClearNotice}>
              <X className="size-3" />
            </button>
          </span>
        )}
        {focusedBranch && (
          <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-ring bg-accent px-2 py-0.5 text-xs">
            <Crosshair className="size-3 shrink-0" />
            <span className="text-muted-foreground">Following</span>
            <span className="font-medium break-all">{focusedBranch}</span>
            <button
              type="button"
              aria-label="Stop following"
              title="Stop following (Esc)"
              onClick={onClearFocus}
            >
              <X className="size-3" />
            </button>
          </span>
        )}
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <div className="flex h-6 min-w-0 items-center gap-1 rounded-md border border-border px-1.5">
            <Search className="size-3 text-foreground/60" />
            <input
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !isImeOwnedKeyboardEvent(event)) {
                  event.preventDefault()
                  onFindNext()
                }
              }}
              data-git-graph-find
              placeholder={translate('local.gitGraph.find', 'Find commit (Enter: next)')}
              className="w-32 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground lg:w-56"
            />
          </div>
          <span className="text-xs whitespace-nowrap text-foreground/70 tabular-nums">
            {commitCount}
            {hasMore ? '+' : ''} commits
          </span>
          <div className="flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={translate('local.gitGraph.smaller', 'Smaller text')}
              disabled={zoom <= GIT_GRAPH_ZOOM_STEPS[0]!}
              onClick={() => onZoom(-1)}
            >
              <Minus className="size-3.5" />
            </Button>
            <span className="w-9 text-center text-xs tabular-nums text-foreground/70">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={translate('local.gitGraph.larger', 'Larger text')}
              disabled={zoom >= GIT_GRAPH_ZOOM_STEPS.at(-1)!}
              onClick={() => onZoom(1)}
            >
              <Plus className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={translate('local.gitGraph.refresh', 'Refresh')}
              onClick={onRefresh}
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
