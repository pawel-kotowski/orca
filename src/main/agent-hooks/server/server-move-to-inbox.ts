import { isRecord } from '../../../shared/agent-status/child-work/agent-status-child-work-value-guards'
import { normalizeAgentReachOutField } from '../../../shared/agent-status/contracts/agent-reach-out'
import { AgentHookServerCodexQuestionSkip } from './server-codex-question-skip'
import { isValidPaneKey } from './server-status-identity'
import type { EnrichedAgentHookEventPayload } from './server-types'

/**
 * `orca move-to-inbox`: an agent asks to be in the user's Inbox (agent-reach-out.ts). The command
 * posts its pane and message here; the pane's current row is restated with the reach-out, and the
 * listener keeps it so every later status of that agent carries it too.
 */
export abstract class AgentHookServerMoveToInbox extends AgentHookServerCodexQuestionSkip {
  /** Whether the pane had an agent status to carry the reach-out. */
  protected moveToInbox(body: unknown): boolean {
    if (!isRecord(body) || typeof body.paneKey !== 'string') {
      return false
    }
    const paneKey = this.resolvePaneKeyAlias(body.paneKey)
    const reachOut = normalizeAgentReachOutField({ message: body.message, at: Date.now() })
    if (!isValidPaneKey(paneKey) || !reachOut) {
      return false
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the server stores only enriched rows here, as inferQuestionAnswered already assumes.
    const existing = this.state.lastStatusByPaneKey.get(paneKey) as
      | EnrichedAgentHookEventPayload
      | undefined
    if (!existing) {
      return false
    }
    this.state.reachOutByPaneKey.set(paneKey, reachOut)
    // Carry only the row's identity, as Orca's other restatements do.
    const restated = this.applyRestatedStatus({
      paneKey,
      tabId: existing.tabId,
      worktreeId: existing.worktreeId,
      connectionId: existing.connectionId,
      providerSession: existing.providerSession,
      launchToken: existing.launchToken,
      hostTurnRevision: existing.hostTurnRevision,
      source: existing.source,
      payload: { ...existing.payload, reachOut }
    })
    return restated !== undefined
  }
}
