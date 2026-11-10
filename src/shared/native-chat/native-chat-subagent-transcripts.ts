import type { NativeChatMessage } from './native-chat-types'

/** One of a Claude session's own subagents, read from its transcript beside the session's. */
export type NativeChatSubagentTranscript = {
  agentId: string
  /** The parent's spawning tool call (`Agent`/`Task`), from the subagent's meta file. */
  toolUseId: string | null
  /** The subagent that spawned this one; null when the session's own agent did. */
  parentAgentId: string | null
  description: string | null
  agentType: string | null
  /** Claude's own record that the subagent ended; null when the meta file has none. */
  finished: boolean | null
  startedAt: number | null
  /** Clock of its newest row. */
  updatedAt: number | null
  /** Its rows, each with `agentId` set, ordered by their own clocks. */
  messages: NativeChatMessage[]
}

export type NativeChatReadSubagentsArgs = {
  agent: string
  sessionId: string
  transcriptPath?: string
}

export type NativeChatReadSubagentsResult = {
  subagents: NativeChatSubagentTranscript[]
}
