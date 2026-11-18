import type { AgentPaneThread } from './threads/activity-thread-types'
import { myPromptAt } from './activity-my-prompt-times'

/**
 * When the person last prompted this agent: its current turn's opening (`turnStartedAt`), else the
 * newest working event, else its latest activity. Working and Standing by sort by it (Paweł,
 * 2026-11-09: "in working and standing by they should be sorted by my recent prompt").
 */
export function activityThreadPromptAt(thread: AgentPaneThread): number {
  const entry = thread.currentAgentEntry ?? thread.paneEntry ?? thread.latestEvent?.entry
  if (entry?.turnStartedAt) {
    return entry.turnStartedAt
  }
  const working = thread.events?.find((event) => event.state === 'working')
  return working?.timestamp ?? thread.latestTimestamp
}

/**
 * When you yourself last prompted this agent: the time its transcript gives your last message (see
 * `activity-my-prompt-times.ts`), else the current turn's opening until its card has read it.
 */
export function activityThreadMyPromptAt(thread: AgentPaneThread): number {
  return myPromptAt(thread.paneKey) ?? activityThreadPromptAt(thread)
}

/** Working and Standing by: newest of your own prompts first, never a turn another source began. */
export function byRecentPrompt(a: AgentPaneThread, b: AgentPaneThread): number {
  return activityThreadMyPromptAt(b) - activityThreadMyPromptAt(a)
}

/** When the current turn began (0 if unknown): the person's latest message to this agent. */
export function activityThreadTurnStartedAt(thread: AgentPaneThread): number {
  const entry = thread.currentAgentEntry ?? thread.paneEntry ?? thread.latestEvent?.entry
  return entry?.turnStartedAt ?? 0
}
