import type { AgentSubagentSnapshot } from './agent-status-subagent-snapshot'
import { isRecord } from '../child-work/agent-status-child-work-value-guards'

/**
 * An agent reaching out to the person while it keeps working (Paweł, 2026-11-12: an agent with
 * tasks or subagents running "should generaly not show up in inbox unless it has to inform about
 * sth or ask user question"). The agent decides when: Claude Code's own PushNotification tool is
 * the signal, so the host records its message and when it was sent, and the Activity view lists
 * the card in the Inbox until the person clears it.
 */
export type AgentReachOut = {
  /** What the agent wanted the person to know, one line. */
  message: string
  /** When the agent sent it (the host's clock). */
  at: number
}

/** The tool a Claude main agent calls to tell the person something worth coming back for. */
export const CLAUDE_REACH_OUT_TOOL_NAME = 'PushNotification'

export const AGENT_REACH_OUT_MESSAGE_MAX_LENGTH = 500

/** Drop a malformed reach-out alone; the rest of the status stays valid. */
export function normalizeAgentReachOutField(value: unknown): AgentReachOut | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const obj = value
  if (typeof obj.message !== 'string' || typeof obj.at !== 'number' || !Number.isFinite(obj.at)) {
    return undefined
  }
  const message = obj.message
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AGENT_REACH_OUT_MESSAGE_MAX_LENGTH)
  return message.length > 0 ? { message, at: obj.at } : undefined
}

/** The reach-out a Claude main agent's hook event carries, if it is one. Subagents never reach out. */
export function readClaudeReachOut(
  eventName: unknown,
  hookPayload: Record<string, unknown>,
  now: number
): AgentReachOut | undefined {
  if (eventName !== 'PreToolUse' || hookPayload.tool_name !== CLAUDE_REACH_OUT_TOOL_NAME) {
    return undefined
  }
  // Why: a subagent's hook names its agent_id; its news is its parent's to tell.
  if (typeof hookPayload.agent_id === 'string' && hookPayload.agent_id.length > 0) {
    return undefined
  }
  const input = hookPayload.tool_input
  const message = isRecord(input) ? input.message : undefined
  return normalizeAgentReachOutField({ message, at: now })
}

type ReachOutCarrier = {
  reachOut?: AgentReachOut
  toolName?: string
  toolInput?: string
  updatedAt: number
}

/**
 * The reach-out a status row keeps. A host that records reach-outs sends one on every row; a host
 * on an older build only names the tool, so its first row that does is taken as one (the message
 * when its preview has it). Rows that say nothing keep the last.
 */
export function carryAgentReachOut(
  next: ReachOutCarrier,
  existing: ReachOutCarrier | undefined
): AgentReachOut | undefined {
  if (next.reachOut) {
    return next.reachOut
  }
  if (
    next.toolName === CLAUDE_REACH_OUT_TOOL_NAME &&
    existing?.toolName !== CLAUDE_REACH_OUT_TOOL_NAME
  ) {
    return normalizeAgentReachOutField({
      message: next.toolInput ?? 'Wants your attention',
      at: next.updatedAt
    })
  }
  return existing?.reachOut
}

/** The fields an inferred status row keeps from the row it replaces: idle children and the reach-out. */
export function carriedChildAndReachOutFields(row: {
  subagents?: AgentSubagentSnapshot[]
  reachOut?: AgentReachOut
}): { subagents?: AgentSubagentSnapshot[]; reachOut?: AgentReachOut } {
  return {
    ...(row.subagents ? { subagents: row.subagents } : {}),
    ...(row.reachOut ? { reachOut: row.reachOut } : {})
  }
}
