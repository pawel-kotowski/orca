import type { AgentSessionRecord } from '../../../shared/agent-session/lifecycle/agent-session-record'
import type { StructuredAgentId } from '../../../shared/agent-session/lifecycle/provider-handles/agent-session-provider-handle'
import { CLI_CONVERSATION_ADOPTING_AGENTS } from '../../../shared/agent-session/view/structured-agent-cli-conversation-adoption'
import { recordConversationKey } from './structured-conversation-key'

/** The provider conversation of a chat whose terminal writers the host can tell. */
export function chatConversation(
  record: AgentSessionRecord
): { agent: StructuredAgentId; id: string } | null {
  const head = record.providerHandleChain.at(-1)
  const key = head ? recordConversationKey(record, head) : null
  return key?.id &&
    Object.values(CLI_CONVERSATION_ADOPTING_AGENTS).some((agents: readonly string[]) =>
      agents.includes(record.provider)
    )
    ? { agent: record.provider, id: key.id }
    : null
}
