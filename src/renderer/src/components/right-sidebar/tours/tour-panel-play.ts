import { useAppStore } from '@/store/index'
import { revealWorkspaceSurface } from '@/lib/workspace/activation/workspace-surface-reveal'
import { dispatchAgentShow } from '@/agent-show/agent-show-dispatcher'
import { playingTours, stepTour, type PlayingTour } from '@/agent-show/tour/tour-player'
import { pickTourOwnerTab } from './tour-panel-owner'
import type { ListedTour, TourGroup } from './use-repo-tours'

/**
 * Plays a listed tour from `stepIndex` for the chat it belongs to, in its own workspace (the
 * dispatcher switches there). Resolves with what kept it from playing, or null when it plays.
 */
export async function playListedTour(
  group: Pick<TourGroup, 'worktreeId' | 'worktreePath' | 'label'>,
  tour: ListedTour,
  stepIndex: number
): Promise<string | null> {
  if (tour.problems.length > 0) {
    return `${tour.relativePath} cannot play: ${tour.problems[0]}${tour.problems.length > 1 ? ` (and ${tour.problems.length - 1} more)` : ''}`
  }
  const state = useAppStore.getState()
  const owner = pickTourOwnerTab(
    state.unifiedTabsByWorktree[group.worktreeId] ?? [],
    playingTours()
      .filter((playing) => playing.context.worktreeId === group.worktreeId)
      .flatMap((playing) => playing.context.ownerTabId ?? [])
  )
  if (!owner) {
    return `A tour plays for an agent chat. Open one in ${group.label}, then play the tour again.`
  }
  const result = await dispatchAgentShow(
    {
      kind: 'tour',
      action: 'start',
      tour: { title: tour.title, file: tour.file, steps: tour.steps, commit: tour.commit },
      step: stepIndex + 1,
      play: false,
      check: false
    },
    {
      worktreeId: group.worktreeId,
      worktreePath: group.worktreePath,
      ownerTabId: owner,
      focus: true
    }
  )
  return result.ok ? null : result.message
}

/** Brings a playing or paused tour back: its workspace on screen and its step staged again. */
export async function resumeTour(tour: PlayingTour): Promise<void> {
  revealWorkspaceSurface(useAppStore.getState(), tour.context.worktreeId)
  await stepTour(tour.context, 'step', tour.index + 1)
}
