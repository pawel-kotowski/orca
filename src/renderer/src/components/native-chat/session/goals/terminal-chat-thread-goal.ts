import type { AgentJournalThreadGoal } from '../../../../../../shared/agent-session/journal/agent-session-journal-types'
import type { NativeChatMessage } from '../../../../../../shared/native-chat/native-chat-types'

/** The goal a terminal-backed chat's agent pursues now, from the newest goal report in its
 *  transcript; null when it has none, or the last one was cleared or met. Time spent counts from
 *  when it was set to the newest row, since Claude's terminal records no running total. */
export function terminalChatThreadGoal(
  messages: readonly NativeChatMessage[]
): AgentJournalThreadGoal | null {
  const report = messages.findLast((message) => message.threadGoal !== undefined)?.threadGoal
  if (report?.state !== 'set' || report.goal.status === 'complete') {
    return null
  }
  const setAt = report.goal.createdAt
  const lastAt = messages.findLast((message) => message.timestamp !== null)?.timestamp ?? setAt
  const updatedAt = Math.max(setAt, lastAt)
  return {
    ...report.goal,
    timeUsedSeconds: Math.max(0, Math.floor((updatedAt - setAt) / 1000)),
    updatedAt
  }
}
