import type { AgentPaneThread } from './activity-thread-types'

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

export function byRecentPrompt(a: AgentPaneThread, b: AgentPaneThread): number {
  return activityThreadPromptAt(b) - activityThreadPromptAt(a)
}
