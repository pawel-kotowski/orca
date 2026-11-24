import {
  isAgentTurnOutcome,
  type AgentTurnOutcome
} from '../../../agent-status/lifecycle/agent-turn-outcome'

export type AgentSessionLastTurn = {
  state: 'open' | 'settled'
  outcome?: AgentTurnOutcome
  at: number
  prompt?: string
  reply?: string
  turnStartedAt?: number
  compactedAt?: number
}

export const AGENT_SESSION_TURN_PREVIEW_CHARS = 280

/** Optional metadata must never make the conversation itself unreadable. */
export function isAgentSessionLastTurn(value: unknown): value is AgentSessionLastTurn {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return (
    'state' in value &&
    (value.state === 'open' || value.state === 'settled') &&
    'at' in value &&
    typeof value.at === 'number' &&
    Number.isSafeInteger(value.at) &&
    value.at >= 0 &&
    (!('outcome' in value) || value.outcome === undefined || isAgentTurnOutcome(value.outcome)) &&
    (!('turnStartedAt' in value) || isTime(value.turnStartedAt)) &&
    (!('compactedAt' in value) || isTime(value.compactedAt)) &&
    (!('prompt' in value) || isPreview(value.prompt)) &&
    (!('reply' in value) || isPreview(value.reply))
  )
}

function isTime(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}

function isPreview(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'string' && value.length <= AGENT_SESSION_TURN_PREVIEW_CHARS)
  )
}
