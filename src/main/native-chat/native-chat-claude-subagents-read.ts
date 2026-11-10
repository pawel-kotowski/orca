import { resolveNativeChatTranscriptAgent } from '../../shared/native-chat/native-chat-agent-support'
import type { NativeChatReadSubagentsResult } from '../../shared/native-chat/native-chat-subagent-transcripts'
import type { AgentType } from '../../shared/agent-status/contracts/agent-status-types'
import { readClaudeSubagentTranscripts } from './claude-subagent-transcripts'
import { resolveSessionFilePath } from './session-file-resolver'
import { parseSshTranscriptPath } from './ssh-transcript-path'

const NONE: NativeChatReadSubagentsResult = { subagents: [] }

/**
 * A Claude chat's own subagents, for local IPC and the runtime RPC alike. The transcript path is
 * the host's (hook evidence wins over the client's), else found by session id. SSH and WSL
 * transcripts are not read here.
 */
export async function readNativeChatClaudeSubagents(
  args: unknown,
  hostPath: (sessionId: string, requested: string | undefined) => string | undefined
): Promise<NativeChatReadSubagentsResult> {
  if (!args || typeof args !== 'object') {
    return NONE
  }
  const { agent, sessionId, transcriptPath } = args as Record<string, unknown>
  if (typeof agent !== 'string' || typeof sessionId !== 'string' || !sessionId) {
    return NONE
  }
  if (resolveNativeChatTranscriptAgent(agent) !== 'claude') {
    return NONE
  }
  const requested = typeof transcriptPath === 'string' ? transcriptPath : undefined
  const path =
    hostPath(sessionId, requested) ??
    (await resolveSessionFilePath(agent as AgentType, sessionId, {
      transcriptPath: requested
    }).catch(() => null))
  if (!path || parseSshTranscriptPath(path) || path.startsWith('\\\\')) {
    return NONE
  }
  return { subagents: await readClaudeSubagentTranscripts(path) }
}
