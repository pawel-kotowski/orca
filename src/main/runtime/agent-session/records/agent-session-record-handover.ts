import type { AgentSessionRecord } from '../../../../shared/agent-session/lifecycle/agent-session-record'

/** `hand-over`: the closed chat's conversation goes on in `to`, and its name says so, in one write.
 *  `hand-back`: undone, only while it still points at `from` (that chat's create failed). */
export function handOverAgentSessionRecord(
  record: AgentSessionRecord,
  command:
    | { kind: 'hand-over'; to: string; name: string; now: number }
    | { kind: 'hand-back'; from: string; name: string | null; now: number }
): AgentSessionRecord {
  if (command.kind === 'hand-over') {
    return {
      ...record,
      handedOverTo: { sessionId: command.to, at: command.now },
      conversationName: command.name,
      updatedAt: command.now
    }
  }
  if (record.handedOverTo?.sessionId !== command.from) {
    return record
  }
  const { handedOverTo: _gone, conversationName: _named, ...rest } = record
  return {
    ...rest,
    ...(command.name !== null ? { conversationName: command.name } : {}),
    updatedAt: command.now
  }
}
