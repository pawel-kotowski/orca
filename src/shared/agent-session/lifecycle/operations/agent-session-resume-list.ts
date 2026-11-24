import type { ClaudeProjectSession } from '../../../native-chat/claude-project-session-types'

/** A conversation the chat's folder holds; `chat` names the Orca chat that already owns it. */
export type AgentSessionResumeListEntry = ClaudeProjectSession & {
  chat?: { sessionId: string; workspaceId: string }
}

export type AgentSessionResumeList =
  | { status: 'ok'; cwd: string; sessions: AgentSessionResumeListEntry[] }
  | { status: 'unsupported' }
