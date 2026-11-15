import { useSyncExternalStore } from 'react'
import type { AgentPaneThread } from './activity-thread-types'
import { activityThreadPromptAt } from './activity-thread-prompt-time'

/**
 * When you last sent a message from an Orca chat, by the terminal it went to. A worker's turn that
 * your message started is your news, though a worker's finish otherwise is not (Paweł, 2026-11-16:
 * a box's Slack-task agent answered his "from scratch?" and the reply sat under Standing by).
 * Kept in memory: it only needs to outlive the turn it started.
 */
let sentAtByPtyId: ReadonlyMap<string, number> = new Map()
const listeners = new Set<() => void>()

export function noteYourChatMessage(ptyId: string, at = Date.now()): void {
  const next = new Map(sentAtByPtyId)
  next.set(ptyId, at)
  sentAtByPtyId = next
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useYourChatMessageAtByPtyId(): ReadonlyMap<string, number> {
  return useSyncExternalStore(subscribe, () => sentAtByPtyId)
}

// Why a minute: the turn's start comes from the agent's host clock, the send from this machine's.
const HOST_CLOCK_SLACK_MS = 60_000

/**
 * Cards whose current turn began with your message: sent no earlier than a minute before the turn
 * opened, and not cleared since.
 */
export function activityThreadsAnsweringYou(
  threads: readonly AgentPaneThread[],
  sentAtByPty: ReadonlyMap<string, number>,
  ptyIdOfPane: (paneKey: string) => string | undefined,
  clearedAtByPaneKey: Readonly<Record<string, number>>
): Set<string> {
  const answering = new Set<string>()
  if (sentAtByPty.size === 0) {
    return answering
  }
  for (const thread of threads) {
    const ptyId = ptyIdOfPane(thread.paneKey)
    const sentAt = ptyId ? sentAtByPty.get(ptyId) : undefined
    if (
      sentAt !== undefined &&
      sentAt >= activityThreadPromptAt(thread) - HOST_CLOCK_SLACK_MS &&
      sentAt > (clearedAtByPaneKey[thread.paneKey] ?? 0)
    ) {
      answering.add(thread.paneKey)
    }
  }
  return answering
}
