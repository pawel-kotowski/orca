import type { AgentSessionBackgroundTask } from '../../../../shared/agent-session/agent-session-background-task-wire'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { NativeChatSubagentTranscript } from '../../../../shared/native-chat/native-chat-subagent-transcripts'
import { claudeSubagentRoster } from '../../../../shared/native-chat/transcript/native-chat-claude-subagent-merge'
import { runningTranscriptBackgroundShells } from '../../../../shared/native-chat/transcript/native-chat-transcript-background-shells'

const NO_TASKS: readonly AgentSessionBackgroundTask[] = []

/**
 * What a terminal-backed Claude chat runs in the background, in the structured chats' task
 * vocabulary: its running subagents (kind `agent`, named by the Agent call's description, so
 * "Show agent" finds them by id) and its shells and watches. Nothing while Claude is not running
 * in the pane, since its background work ends with it. None can be stopped from the chat: Claude
 * Code offers no external stop for its tasks.
 */
export function terminalChatBackgroundTasks(
  messages: readonly NativeChatMessage[],
  subagents: readonly NativeChatSubagentTranscript[],
  agentLive: boolean,
  now: number
): readonly AgentSessionBackgroundTask[] {
  if (!agentLive) {
    return NO_TASKS
  }
  const agents: AgentSessionBackgroundTask[] = claudeSubagentRoster(messages, subagents, true)
    .filter(({ block }) => block.state === 'working')
    .map(({ block, spawnedAt }) => {
      const startedAt = block.startedAt ?? spawnedAt
      return {
        id: block.id,
        kind: 'agent',
        description: block.label,
        state: 'working',
        ...(startedAt !== null ? { startedAt } : {}),
        stoppable: false
      }
    })
  const shells = runningTranscriptBackgroundShells(messages, now)
  return agents.length === 0 && shells.length === 0 ? NO_TASKS : [...agents, ...shells]
}

export type SettledBackgroundTasks = {
  running: readonly AgentSessionBackgroundTask[]
  settled: readonly AgentSessionBackgroundTask[]
}

export const NO_SETTLED_BACKGROUND_TASKS: SettledBackgroundTasks = {
  running: NO_TASKS,
  settled: NO_TASKS
}

/**
 * Work that ended while other work still runs stays listed as done, as the structured strip's
 * settled rows do, so a finished subagent or shell does not just vanish; once nothing runs the
 * strip closes and the settled rows go with it.
 */
export function settleTerminalChatBackgroundTasks(
  held: SettledBackgroundTasks,
  running: readonly AgentSessionBackgroundTask[]
): SettledBackgroundTasks {
  if (running.length === 0) {
    return { running, settled: NO_TASKS }
  }
  const live = new Set(running.map((task) => task.id))
  const ended = held.running
    .filter((task) => !live.has(task.id))
    .map((task): AgentSessionBackgroundTask => ({ ...task, state: 'done' }))
  const kept = held.settled.filter((task) => !live.has(task.id))
  const settled =
    ended.length === 0 && kept.length === held.settled.length ? held.settled : [...kept, ...ended]
  return { running, settled }
}
