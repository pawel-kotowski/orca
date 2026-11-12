import type { AgentSessionBackgroundTask } from '../../../../shared/agent-session/agent-session-background-task-wire'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { NativeChatSubagentTranscript } from '../../../../shared/native-chat/native-chat-subagent-transcripts'
import { claudeSubagentRoster } from '../../../../shared/native-chat/transcript/native-chat-claude-subagent-merge'
import {
  runningTranscriptBackgroundShells,
  type TranscriptBackgroundShell
} from '../../../../shared/native-chat/transcript/native-chat-transcript-background-shells'

const NO_TASKS: readonly TranscriptBackgroundShell[] = []

/**
 * What a terminal-backed Claude chat runs in the background, in the structured chats' task
 * vocabulary: its running subagents (kind `agent`, named by the Agent call's description, with the
 * roster id the transcript reveals them by) and its shells and watches (with their full command). Nothing while Claude is not running
 * in the pane, since its background work ends with it. None can be stopped from the chat: Claude
 * Code offers no external stop for its tasks.
 */
export function terminalChatBackgroundTasks(
  messages: readonly NativeChatMessage[],
  subagents: readonly NativeChatSubagentTranscript[],
  agentLive: boolean,
  now: number
): readonly TranscriptBackgroundShell[] {
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
