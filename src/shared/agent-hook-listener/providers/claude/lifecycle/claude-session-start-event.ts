import type { ParsedAgentStatusPayload } from '../../../../agent-status/contracts/agent-status-types'
import type { HookListenerState } from '../../../listener-state'
import { CLAUDE_NEW_SESSION_START_SOURCES } from './claude-session-start-sources'
import { setClaudeMainAgentTurnState } from './claude-roster-state'
import { buildClaudeCachedLeadStatusPayload } from './claude-lifecycle-events'
import { buildClaudeStatusPayload } from './claude-status-build'

export function normalizeClaudeSessionStart(
  state: HookListenerState,
  promptText: string,
  paneKey: string,
  hookPayload: Record<string, unknown>,
  eventAgentId: string | undefined,
  leadModel: string | undefined
): ParsedAgentStatusPayload | null {
  const eventName = 'SessionStart'
  // SessionStart supplies resume identity before prompts; mark idle/sessionBoundary to avoid phantom work/completion notifications (STA-3386).
  const sessionStartSource = hookPayload['source']
  if (eventAgentId === undefined && sessionStartSource === 'compact') {
    return restateClaudeLeadCompacted(state, paneKey, hookPayload)
  }
  if (eventAgentId !== undefined || !CLAUDE_NEW_SESSION_START_SOURCES.has(sessionStartSource)) {
    // Only known idle sources qualify; compact restarts and child SessionStart cannot settle a live lead.
    return null
  }
  // New sessions must not inherit old child/task/cron gates.
  state.claudeSubagentRosterByPaneKey.delete(paneKey)
  state.claudeRunningNonAgentTasksByPaneKey.delete(paneKey)
  state.claudeActiveSessionCronPaneKeys.delete(paneKey)
  state.claudeLaunchedBackgroundTasksByPaneKey.delete(paneKey)
  // New sessions start a new main-agent clock.
  setClaudeMainAgentTurnState(state, paneKey, {
    state: 'done',
    stateStartedAt: Date.now(),
    model: leadModel
  })
  return buildClaudeStatusPayload(state, eventName, promptText, paneKey, hookPayload, {
    stateName: 'done',
    updateToolSnapshot: true,
    sessionBoundary: true
  })
}

/**
 * Claude compacted the conversation between turns (its idle compaction, or /compact): the card
 * stays where it was and says Compacted until the next turn (Paweł, 2026-11-16: an idle
 * compaction at 20:55 put an 8 pm chat back in the Inbox; "should stay where it was with stamp
 * compacted that dissapears when conversation is continued"). The restatement keeps the lead's
 * clock; a compaction inside a turn (auto) says nothing, its turn goes on.
 */
function restateClaudeLeadCompacted(
  state: HookListenerState,
  paneKey: string,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  const lead = state.claudeLeadStateByPaneKey.get(paneKey)
  if (lead?.state !== 'done' || lead.waitingAgentId !== undefined) {
    return null
  }
  state.claudeLeadStateByPaneKey.set(paneKey, { ...lead, compactedAt: Date.now() })
  return buildClaudeCachedLeadStatusPayload(state, 'SessionStart', paneKey, hookPayload)
}
