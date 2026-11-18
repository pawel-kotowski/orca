import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { activityThreadStatusId } from '../threads/activity-thread-presentation'
import type { AgentPaneThread } from '../threads/activity-thread-types'

export type ClearCompletedActivityPlan = {
  /** Panes whose activity gets a cleared-at cutoff stamped. */
  cutoffPatch: Record<string, number | null>
  /** Exact prior cutoff values (or null when absent) so undo restores byte-for-byte. */
  restorePatch: Record<string, number | null>
  clearedThreadCount: number
}

/** Finished outcomes are clearable only without fresh live work/monitoring/attention. */
export function isClearableActivityThread(thread: AgentPaneThread): boolean {
  const id = activityThreadStatusId(thread)
  // A failed main agent can still own running subagents; retain that live thread.
  if (thread.currentAgentState) {
    return false
  }
  return id === 'done' || id === 'failed' || id === 'interrupted' || id === 'unconfirmed'
}

export function planClearCompletedActivity(
  threads: readonly AgentPaneThread[],
  state: {
    activityClearedAtByPaneKey: Record<string, number>
  },
  now: number = Date.now()
): ClearCompletedActivityPlan {
  const cutoffPatch: Record<string, number | null> = {}
  const restorePatch: Record<string, number | null> = {}
  let clearedThreadCount = 0
  for (const thread of threads) {
    if (!isClearableActivityThread(thread)) {
      continue
    }
    clearedThreadCount += 1
    const previousCutoff = state.activityClearedAtByPaneKey[thread.paneKey] ?? null
    // Why now (local): a clear is "done with it until something new happens". Stamping only the
    // card's latest event time could equal the saved cutoff, so the store saw no change, nothing was
    // persisted, and the card came back at the next restart (Paweł, 2026-11-09: "this continues to
    // appear in inbox").
    cutoffPatch[thread.paneKey] = Math.max(previousCutoff ?? 0, thread.latestTimestamp, now)
    restorePatch[thread.paneKey] = previousCutoff
  }
  return { cutoffPatch, restorePatch, clearedThreadCount }
}

/** Clear one completed thread immediately; bulk clearing owns the undo toast. */
export function clearActivityThread(thread: AgentPaneThread): boolean {
  const state = useAppStore.getState()
  const plan = planClearCompletedActivity([thread], state)
  if (plan.clearedThreadCount === 0) {
    return false
  }
  state.applyActivityClearedAt(plan.cutoffPatch)
  return true
}

/**
 * A running agent's reach-out has been taken in: stamp a clear newer than it, so its card goes back
 * to Working (activity-inbox-facts.ts). The agent's live status and resume identity stay untouched.
 */
export function dismissActivityReachOut(thread: AgentPaneThread): void {
  const state = useAppStore.getState()
  const previous = state.activityClearedAtByPaneKey[thread.paneKey] ?? 0
  state.applyActivityClearedAt({ [thread.paneKey]: Math.max(previous, Date.now()) })
}

/**
 * Bring a card back from Standing by to the Inbox (Paweł, 2026-11-09: "add option to bring
 * session back to inbox from standing by, maybe by clicking status icon"): lift its clear and
 * mark it unread, so it rings again and the auto-move timer, which only moves seen cards, leaves
 * it there until you look.
 */
export function restoreActivityThreadToInbox(thread: AgentPaneThread): void {
  const state = useAppStore.getState()
  state.applyActivityClearedAt({ [thread.paneKey]: null })
  state.unacknowledgeAgents([thread.paneKey])
}

/** Persist per-pane cutoffs; undo restores only cutoffs this action still owns. */
export function clearCompletedActivity(threads: readonly AgentPaneThread[]): boolean {
  const state = useAppStore.getState()
  const plan = planClearCompletedActivity(threads, state)
  if (plan.clearedThreadCount === 0) {
    return false
  }
  state.applyActivityClearedAt(plan.cutoffPatch)
  toast(
    translate(
      'auto.components.activity.clearCompleted.cleared',
      'Cleared {{count}} completed agents',
      { count: plan.clearedThreadCount, defaultValue_one: 'Cleared {{count}} completed agent' }
    ),
    {
      action: {
        label: translate('auto.components.activity.clearCompleted.undo', 'Undo'),
        onClick: () => {
          const current = useAppStore.getState()
          const restorePatch: Record<string, number | null> = {}
          for (const paneKey of Object.keys(plan.restorePatch)) {
            if (current.activityClearedAtByPaneKey[paneKey] === plan.cutoffPatch[paneKey]) {
              restorePatch[paneKey] = plan.restorePatch[paneKey] ?? null
            }
          }
          current.applyActivityClearedAt(restorePatch)
        }
      }
    }
  )
  return true
}
