import { createContext, useContext, useMemo } from 'react'
import { activityThreadSection } from './activity-inbox-sections'
import { activityThreadStatusId } from './activity-thread-presentation'
import { isActivityWorkerThread, resolveActivityWorkerParents } from './activity-thread-child-agent'
import type { AgentPaneThread } from './activity-thread-types'

/**
 * Orchestration workers in the activity view (Paweł, 2026-11-09: "i usually don't care about them
 * ending the job so they shouldnt go to inbox, but sometimes i may wanna see what they are
 * doing"). A worker's finish is its coordinator's news: it never rings and never enters the Inbox.
 * It sits folded inside its coordinator's card, wherever either runs; only a worker waiting on
 * you gets a card of its own in the Inbox.
 */
export type ActivityWorkers = {
  /** Worker pane → its coordinator's thread, for workers whose coordinator is listed. */
  parentByWorker: ReadonlyMap<string, AgentPaneThread>
  /** Coordinator pane → its workers, live ones first, then newest. */
  workersByParent: ReadonlyMap<string, readonly AgentPaneThread[]>
}

const EMPTY_WORKERS: ActivityWorkers = { parentByWorker: new Map(), workersByParent: new Map() }

function workerOrder(thread: AgentPaneThread): number {
  return thread.currentAgentState ? 0 : 1
}

export function useActivityWorkers(threads: readonly AgentPaneThread[]): ActivityWorkers {
  return useMemo(() => {
    const parents = resolveActivityWorkerParents(threads)
    if (parents.size === 0) {
      return EMPTY_WORKERS
    }
    const byPaneKey = new Map(threads.map((thread) => [thread.paneKey, thread]))
    const parentByWorker = new Map<string, AgentPaneThread>()
    const workersByParent = new Map<string, AgentPaneThread[]>()
    for (const [workerKey, parentKey] of parents) {
      const worker = byPaneKey.get(workerKey)
      const parent = byPaneKey.get(parentKey)
      if (!worker || !parent) {
        continue
      }
      parentByWorker.set(workerKey, parent)
      const siblings = workersByParent.get(parentKey)
      if (siblings) {
        siblings.push(worker)
      } else {
        workersByParent.set(parentKey, [worker])
      }
    }
    for (const siblings of workersByParent.values()) {
      siblings.sort(
        (a, b) => workerOrder(a) - workerOrder(b) || b.latestTimestamp - a.latestTimestamp
      )
    }
    return { parentByWorker, workersByParent }
  }, [threads])
}

function needsYou(thread: AgentPaneThread): boolean {
  const state = activityThreadStatusId(thread)
  return state === 'waiting' || state === 'permission' || state === 'blocked'
}

/**
 * Where a thread is listed: as a card, folded into its coordinator's card, or (a finished worker
 * whose coordinator is gone, or one listed on its own) under Standing by.
 */
export function activityWorkerPlacement(
  thread: AgentPaneThread,
  workers: ActivityWorkers,
  listWorkersAsCards: boolean
): 'card' | 'nested' | 'standingBy' {
  const nested = workers.parentByWorker.has(thread.paneKey)
  if ((!nested && !isActivityWorkerThread(thread)) || needsYou(thread)) {
    return 'card'
  }
  if (nested && !listWorkersAsCards) {
    return 'nested'
  }
  return activityThreadSection(thread) === 'inbox' ? 'standingBy' : 'card'
}

export const ActivityWorkersContext = createContext<ActivityWorkers>(EMPTY_WORKERS)

export function useActivityWorkersContext(): ActivityWorkers {
  return useContext(ActivityWorkersContext)
}
