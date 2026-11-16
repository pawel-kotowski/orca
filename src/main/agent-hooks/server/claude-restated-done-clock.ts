import type { AgentHookEventPayload } from '../../../shared/agent-hook-listener/listener-event'
import type { EnrichedAgentHookEventPayload } from './server-types'

/** Claude events that only restate the main agent's state: a child's end, a teammate going idle,
 *  a compaction. They begin no turn of the main agent's own. */
const CLAUDE_RESTATING_EVENTS: ReadonlySet<string> = new Set([
  'SubagentStop',
  'StopFailure',
  'TeammateIdle',
  'SessionStart',
  'PreCompact',
  'PostCompact'
])

/**
 * A finished Claude pane restated by a child's end or a compaction keeps the main agent's own done
 * clock, even when the row before it was not `done`: a new clock is a new finish, which puts the
 * card back in the Inbox as unread (Paweł, 2026-11-16: Claude's idle compaction at 20:55 ends its
 * one-shot summary agent with SubagentStop, and an 8 pm chat came back to the Inbox as "12m").
 * Work held open by children (`working` before) ending is news, so it still starts a new clock.
 */
export function claudeRestatedDoneStartedAt(
  previous: EnrichedAgentHookEventPayload | undefined,
  payload: AgentHookEventPayload
): number | undefined {
  const mainAgent = payload.payload.mainAgent
  if (
    payload.payload.agentType !== 'claude' ||
    payload.payload.state !== 'done' ||
    mainAgent?.state !== 'done' ||
    !CLAUDE_RESTATING_EVENTS.has(payload.hookEventName ?? '') ||
    (payload.hookEventName === 'SessionStart' && payload.payload.compactedAt === undefined) ||
    previous?.payload.state === 'working'
  ) {
    return undefined
  }
  return mainAgent.stateStartedAt
}
