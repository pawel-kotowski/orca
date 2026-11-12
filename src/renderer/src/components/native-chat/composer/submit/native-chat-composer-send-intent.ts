import type { StructuredAgentSessionSendRequest } from '../../session/structured/delivery/structured-agent-session-send-slot'

/** How one send goes: `alternate` does the other thing than the follow-up setting; `sendNow`
 *  delivers a terminal Claude's message while it works, as Ctrl+Enter does in its terminal. */
export type NativeChatComposerSendIntent = Pick<StructuredAgentSessionSendRequest, 'alternate'> & {
  sendNow?: true
}
