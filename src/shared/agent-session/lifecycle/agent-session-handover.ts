// A closed chat whose conversation went on in another chat (`orca agent launch --resume`).

/** A record's `handedOverTo`: closed, its conversation went on in this chat (`--resume`), so it is
 *  history only and never starts its agent again. */
export type AgentSessionHandover = { sessionId: string; at: number }

export function isAgentSessionHandover(value: unknown): value is AgentSessionHandover {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sessionId' in value &&
    typeof value.sessionId === 'string' &&
    value.sessionId.length > 0 &&
    value.sessionId.length <= 512 &&
    'at' in value &&
    typeof value.at === 'number' &&
    Number.isSafeInteger(value.at)
  )
}
