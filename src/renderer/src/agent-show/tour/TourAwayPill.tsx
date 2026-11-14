import { GripVertical, Presentation, X } from 'lucide-react'
import { useAppStore } from '@/store/index'
import { findWorktreeById } from '@/store/github/refresh/worktree-refresh'
import { revealWorkspaceSurface } from '@/lib/workspace/activation/workspace-surface-reveal'
import { endTour, type PlayingTour } from './tour-player'
import type { DockDragHandle } from './use-tour-dock-drag'

/** A tour whose workspace is not on screen: one click goes back to it, where its strip waits. */
export function TourAwayPill({
  tour,
  handle
}: {
  tour: PlayingTour
  /** Drags the dock by the pill's grip. */
  handle: DockDragHandle
}): React.JSX.Element {
  const workspace = useAppStore(
    (state) => findWorktreeById(state, tour.context.worktreeId)?.displayName ?? 'its workspace'
  )
  const label = `Tour paused in ${workspace}: step ${tour.index + 1} of ${tour.steps.length}`
  return (
    <div
      data-orca-tour-pill=""
      className="pointer-events-auto flex h-[22px] max-w-full items-center gap-1 rounded-full border border-border bg-card pl-0.5 pr-0.5 text-xs text-muted-foreground shadow-sm"
    >
      <span
        {...handle}
        title="Drag to move; double-click to put it back"
        className="flex h-full shrink-0 cursor-grab select-none items-center active:cursor-grabbing"
      >
        <GripVertical className="size-3 text-muted-foreground/70" />
      </span>
      <button
        type="button"
        title={`Back to ${workspace}`}
        onClick={() => revealWorkspaceSurface(useAppStore.getState(), tour.context.worktreeId)}
        className="flex min-w-0 items-center gap-1.5 hover:text-foreground"
      >
        <Presentation className="size-3 shrink-0 text-[var(--ai-action-accent)]" />
        <span className="truncate">{label}</span>
      </button>
      <button
        type="button"
        aria-label="End tour"
        title="End tour"
        onClick={() => endTour(tour.context)}
        className="flex size-[18px] shrink-0 items-center justify-center rounded-full hover:bg-accent hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}
