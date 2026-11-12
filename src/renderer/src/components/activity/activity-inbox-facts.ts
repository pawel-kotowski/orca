import { createContext, useContext, useMemo } from 'react'
import { useAppStore } from '@/store'
import type { AgentReachOut } from '../../../../shared/agent-status/contracts/agent-reach-out'
import { isRunningActivityState } from './activity-event-state'
import type { ActivityWorkers } from './activity-workers'
import type { AgentPaneThread } from './activity-thread-types'

/**
 * What decides a card's section besides its own state (Paweł, 2026-11-12: an agent with tasks or
 * subagents running "should generaly not show up in inbox unless it has to inform about sth or ask
 * user question"). A coordinator whose workers still run is working, whatever its own last turn
 * said; an agent that reached out (Claude's PushNotification) is news until its card is cleared.
 */
export type ActivityInboxFacts = {
  /** Reach-outs sent after the card was last cleared: the card sits in the Inbox. */
  reachingOut: ReadonlyMap<string, AgentReachOut>
  /** Reach-outs sent after the card was last seen: the card rings. */
  unseenReachOuts: ReadonlySet<string>
  /** Coordinators with a worker still running. */
  busyCoordinators: ReadonlySet<string>
  /**
   * Cards you sent back to the Inbox (Standing by's Inbox button) or marked unread, until you read
   * them: a worker's card then stands on its own (Paweł, 2026-11-12: the button did nothing on a
   * box's Slack-task cards, workers of a workspace with no agent, which placement kept standing by).
   */
  sentBack: ReadonlySet<string>
}

export const NO_ACTIVITY_INBOX_FACTS: ActivityInboxFacts = {
  reachingOut: new Map(),
  unseenReachOuts: new Set(),
  busyCoordinators: new Set(),
  sentBack: new Set()
}

/** The agent's latest reach-out, live row first. */
export function activityThreadReachOut(thread: AgentPaneThread): AgentReachOut | undefined {
  return (
    thread.currentAgentEntry?.reachOut ??
    thread.paneEntry?.reachOut ??
    thread.latestEvent?.entry.reachOut
  )
}

export function buildActivityInboxFacts(
  threads: readonly AgentPaneThread[],
  workers: ActivityWorkers,
  clearedAtByPaneKey: Readonly<Record<string, number>>,
  acknowledgedAtByPaneKey: Readonly<Record<string, number>>,
  manuallyUnreadTurnsByPaneKey: Readonly<Record<string, number>> = {}
): ActivityInboxFacts {
  const reachingOut = new Map<string, AgentReachOut>()
  const unseenReachOuts = new Set<string>()
  for (const thread of threads) {
    const reachOut = activityThreadReachOut(thread)
    // Why the host's clock against this machine's: a clear or a look is a person's act, minutes
    // apart from the agent's message; clock skew between machines is far smaller.
    if (!reachOut || reachOut.at <= (clearedAtByPaneKey[thread.paneKey] ?? 0)) {
      continue
    }
    reachingOut.set(thread.paneKey, reachOut)
    if (reachOut.at > (acknowledgedAtByPaneKey[thread.paneKey] ?? 0)) {
      unseenReachOuts.add(thread.paneKey)
    }
  }
  const busyCoordinators = new Set<string>()
  for (const [parent, parentWorkers] of workers.workersByParent) {
    if (parentWorkers.some((worker) => isRunningActivityState(worker.currentAgentState))) {
      busyCoordinators.add(parent)
    }
  }
  const sentBack = new Set<string>()
  for (const thread of threads) {
    if (manuallyUnreadTurnsByPaneKey[thread.paneKey] !== undefined) {
      sentBack.add(thread.paneKey)
    }
  }
  if (reachingOut.size === 0 && busyCoordinators.size === 0 && sentBack.size === 0) {
    return NO_ACTIVITY_INBOX_FACTS
  }
  return { reachingOut, unseenReachOuts, busyCoordinators, sentBack }
}

export function useActivityInboxFacts(
  threads: readonly AgentPaneThread[],
  workers: ActivityWorkers
): ActivityInboxFacts {
  const clearedAt = useAppStore((state) => state.activityClearedAtByPaneKey)
  const acknowledgedAt = useAppStore((state) => state.acknowledgedAgentsByPaneKey)
  const manuallyUnread = useAppStore((state) => state.manuallyUnreadTurnsByPaneKey)
  return useMemo(
    () => buildActivityInboxFacts(threads, workers, clearedAt, acknowledgedAt, manuallyUnread),
    [threads, workers, clearedAt, acknowledgedAt, manuallyUnread]
  )
}

export const ActivityInboxFactsContext = createContext<ActivityInboxFacts>(NO_ACTIVITY_INBOX_FACTS)

export function useActivityInboxFactsContext(): ActivityInboxFacts {
  return useContext(ActivityInboxFactsContext)
}
