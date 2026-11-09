import { createContext, useContext, useMemo } from 'react'
import { useAppStore } from '@/store'
import type { WorktreeLineage } from '../../../../shared/worktree/lineage-types'
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
  /** Panes whose workspace an agent made for its work (orchestration lineage), coordinator listed or not. */
  lineageWorkers: ReadonlySet<string>
}

const EMPTY_WORKERS: ActivityWorkers = {
  parentByWorker: new Map(),
  workersByParent: new Map(),
  lineageWorkers: new Set()
}

function terminalHandleOf(thread: AgentPaneThread): string | undefined {
  return (
    thread.currentAgentEntry?.terminalHandle ??
    thread.latestEvent?.entry.terminalHandle ??
    thread.events?.find((event) => event.entry.terminalHandle)?.entry.terminalHandle
  )
}

/**
 * Workers the agent status does not link (Paweł, 2026-11-09: a devbox worker listed on its own
 * while Projects nested it): its workspace's lineage names the workspace, and often the terminal,
 * that dispatched it, as the Projects list reads it. A workspace someone made by hand in the app
 * (origin 'manual') stays a card of its own unless its lineage names the agent terminal that made it.
 */
export function resolveLineageWorkerParents(
  threads: readonly AgentPaneThread[],
  lineageByWorktreeId: Readonly<Record<string, WorktreeLineage>>,
  linked: ReadonlyMap<string, string>
): { parents: Map<string, string>; workers: Set<string> } {
  const parents = new Map<string, string>()
  const workers = new Set<string>()
  const paneKeyByHandle = new Map<string, string>()
  const threadsByWorktree = new Map<string, AgentPaneThread[]>()
  for (const thread of threads) {
    const handle = terminalHandleOf(thread)
    if (handle && !paneKeyByHandle.has(handle)) {
      paneKeyByHandle.set(handle, thread.paneKey)
    }
    const list = threadsByWorktree.get(thread.worktree.id)
    if (list) {
      list.push(thread)
    } else {
      threadsByWorktree.set(thread.worktree.id, [thread])
    }
  }
  for (const thread of threads) {
    if (linked.has(thread.paneKey)) {
      continue
    }
    const lineage = lineageByWorktreeId[thread.worktree.id]
    if (!lineage || lineage.parentWorktreeId === thread.worktree.id) {
      continue
    }
    const handles = [lineage.coordinatorHandle, lineage.createdByTerminalHandle]
    const byHandle = handles
      .map((handle) => (handle ? paneKeyByHandle.get(handle) : undefined))
      .find((paneKey) => paneKey && paneKey !== thread.paneKey)
    // Why not only 'orchestration': coordinators make workers' workspaces with
    // `orca worktree create --parent` (origin 'cli', no handle). 'manual' is a person in the app.
    if (!byHandle && lineage.origin === 'manual') {
      continue
    }
    workers.add(thread.paneKey)
    // Why the newest agent of the parent workspace: lineage without a handle names only the
    // workspace, and its coordinator is the one still talking there.
    const parent =
      byHandle ??
      (threadsByWorktree.get(lineage.parentWorktreeId) ?? [])
        .filter((candidate) => !linked.has(candidate.paneKey))
        .sort((a, b) => b.latestTimestamp - a.latestTimestamp)[0]?.paneKey
    if (parent) {
      parents.set(thread.paneKey, parent)
    }
  }
  // Why: a parent that is itself a lineage worker of this one would loop; keep both as cards.
  for (const [worker, parent] of parents) {
    if (parents.get(parent) === worker) {
      parents.delete(worker)
      parents.delete(parent)
    }
  }
  return { parents, workers }
}

function workerOrder(thread: AgentPaneThread): number {
  return thread.currentAgentState ? 0 : 1
}

export function useActivityWorkers(threads: readonly AgentPaneThread[]): ActivityWorkers {
  const lineageByWorktreeId = useAppStore((state) => state.worktreeLineageById)
  return useMemo(
    () => buildActivityWorkers(threads, lineageByWorktreeId),
    [threads, lineageByWorktreeId]
  )
}

export function buildActivityWorkers(
  threads: readonly AgentPaneThread[],
  lineageByWorktreeId: Readonly<Record<string, WorktreeLineage>>
): ActivityWorkers {
  const parents = resolveActivityWorkerParents(threads)
  const lineage = resolveLineageWorkerParents(threads, lineageByWorktreeId, parents)
  for (const [worker, parent] of lineage.parents) {
    parents.set(worker, parent)
  }
  if (parents.size === 0 && lineage.workers.size === 0) {
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
  return { parentByWorker, workersByParent, lineageWorkers: lineage.workers }
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
  const worker = isActivityWorkerThread(thread) || workers.lineageWorkers.has(thread.paneKey)
  if ((!nested && !worker) || needsYou(thread)) {
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
