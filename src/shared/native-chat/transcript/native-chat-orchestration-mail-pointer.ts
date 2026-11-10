import type { AgentMessageSource } from '../../agent-session/agent-session-message-source'

const POINTER = /^\s*You have \d+ (?:new )?orchestration messages?\b[\s\S]*orchestration check/

/**
 * The notice Orca types into a terminal coordinator when mail arrives ("You have 1 orchestration
 * message. Run `orca orchestration check`."). Read back from the transcript it is not the person's
 * words, so the chat draws it as Orca's mail card, as structured chats do (Paweł, 2026-11-10:
 * terminal Chat UI parity). The pointer names no sender; the agent reads the mail with `check`.
 */
export function orchestrationMailPointerSource(text: string): AgentMessageSource | null {
  if (!POINTER.test(text)) {
    return null
  }
  return {
    kind: 'agent',
    senders: [],
    orchestration: { message: 'mail-notice', mailbox: '', dispatchId: null, messages: [] }
  }
}
