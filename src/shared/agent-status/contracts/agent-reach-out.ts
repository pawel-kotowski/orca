import type { AgentSubagentSnapshot } from './agent-status-subagent-snapshot'
import { isRecord } from '../child-work/agent-status-child-work-value-guards'

/**
 * An agent moving itself into the user's Inbox (Paweł, 2026-11-12: an agent with tasks or
 * subagents running "should generaly not show up in inbox unless it has to inform about sth or ask
 * user question"; the agent decides when, not code rules). The agent runs `orca move-to-inbox
 * --message …` in its terminal; the host records the message and when it came, and the Activity
 * view lists the card in the Inbox until the user clears it. Claude Code's own PushNotification
 * was the first signal and was dropped: it stays quiet while the user is in the terminal and agents
 * read its refusal as a failure ("maybe this wasnt the right tool for the job").
 */
export type AgentReachOut = {
  /** What the agent wants the user to see, one line. */
  message: string
  /** When the agent asked (the host's clock). */
  at: number
}

/** The hook server path `orca move-to-inbox` posts to, as the agent's own pane. */
export const ORCA_MOVE_TO_INBOX_PATH = '/orca/move-to-inbox'

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

/** The reach-out a status row keeps: the row's own, else the last one (rows that say nothing). */
export function carryAgentReachOut(
  next: { reachOut?: AgentReachOut },
  existing: { reachOut?: AgentReachOut } | undefined
): AgentReachOut | undefined {
  return next.reachOut ?? existing?.reachOut
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
