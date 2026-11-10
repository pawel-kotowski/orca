import { useEffect, useSyncExternalStore } from 'react'
import { useAgentPaneThreads } from './use-agent-pane-threads'
import type { AgentPaneThread } from './activity-thread-types'
import type { ActivityWorkers } from './activity-workers'

/**
 * Orca workers for chats (Paweł, 2026-11-10: "I need to see both native harness subagents and
 * orca subagents in given chat"). A chat shows the workers its agent dispatched, as the activity
 * card folds them. The activity list builds that map only while it is on screen, so one publisher
 * builds it for chats, and only while a chat that asks for it is mounted.
 */
type Feed = {
  workers: ActivityWorkers | null
  threadsByPaneKey: ReadonlyMap<string, AgentPaneThread>
}

const EMPTY_FEED: Feed = { workers: null, threadsByPaneKey: new Map() }
let feed: Feed = EMPTY_FEED
let readers = 0
const feedListeners = new Set<() => void>()
const readerListeners = new Set<() => void>()

function notify(listeners: Set<() => void>): void {
  for (const listener of listeners) {
    listener()
  }
}

function subscribeFeed(listener: () => void): () => void {
  feedListeners.add(listener)
  return () => feedListeners.delete(listener)
}

function subscribeReaders(listener: () => void): () => void {
  readerListeners.add(listener)
  return () => readerListeners.delete(listener)
}

function ActiveWorkersFeed(): null {
  const { allThreads, workers } = useAgentPaneThreads({
    query: '',
    readFilter: 'all',
    groupBy: 'none',
    selectedPaneKey: null
  })
  useEffect(() => {
    feed = {
      workers,
      threadsByPaneKey: new Map(allThreads.map((thread) => [thread.paneKey, thread]))
    }
    notify(feedListeners)
  }, [allThreads, workers])
  useEffect(
    () => () => {
      feed = EMPTY_FEED
      notify(feedListeners)
    },
    []
  )
  return null
}

/** Mounted once in the app shell; builds the worker map only while some chat reads it. */
export function ActivityWorkersFeedPublisher(): React.JSX.Element | null {
  const active = useSyncExternalStore(
    subscribeReaders,
    () => readers > 0,
    () => false
  )
  return active ? <ActiveWorkersFeed /> : null
}

/** The chat's own thread, the workers it dispatched (live ones first), and, for a worker, the
 *  coordinator that dispatched it. */
export function useCoordinatorWorkers(paneKey: string | null): {
  coordinator: AgentPaneThread | null
  workers: readonly AgentPaneThread[]
  parent: AgentPaneThread | null
} {
  useEffect(() => {
    if (!paneKey) {
      return
    }
    readers += 1
    notify(readerListeners)
    return () => {
      readers -= 1
      notify(readerListeners)
    }
  }, [paneKey])
  const current = useSyncExternalStore(
    subscribeFeed,
    () => feed,
    () => EMPTY_FEED
  )
  if (!paneKey) {
    return { coordinator: null, workers: [], parent: null }
  }
  return {
    coordinator: current.threadsByPaneKey.get(paneKey) ?? null,
    workers: current.workers?.workersByParent.get(paneKey) ?? [],
    parent: current.workers?.parentByWorker.get(paneKey) ?? null
  }
}
