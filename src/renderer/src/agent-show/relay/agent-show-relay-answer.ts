import type {
  AgentShowRelayRequestEvent,
  AgentShowRelayResultParams
} from '../../../../shared/agent-show/agent-show-client-relay'
import { useAppStore } from '@/store/index'
import { getRuntimeTargetForWorktreeOwner } from '@/lib/files/access/file-owner-runtime-target'
import { getRuntimeEnvironmentRevision } from '@/runtime/rpc/environment-revisions/runtime-environment-revision'
import { dispatchAgentShow } from '../agent-show-dispatcher'
import { waitForAppState } from '../code/code-view-visibility'
import { relayedOwnerTab, relayedShowContext } from './agent-show-relay-context'

const RESULT_TIMEOUT_MS = 15_000
// Why wait: an agent in a box tab made a moment ago can show before its tab reaches this window.
const OWNER_TAB_WAIT_MS = 4_000

type Answer = Omit<AgentShowRelayResultParams, 'requestId'>

async function answerFor(
  environmentId: string,
  event: AgentShowRelayRequestEvent
): Promise<Answer> {
  if (event.kind === 'snap') {
    return { shot: await window.api.agentShow.captureWindow() }
  }
  const { worktreeId, ownerTabId } = event.context
  const ownerTarget = getRuntimeTargetForWorktreeOwner(useAppStore.getState(), worktreeId)
  if (
    ownerTabId &&
    ownerTarget?.kind === 'environment' &&
    ownerTarget.environmentId === environmentId
  ) {
    await waitForAppState(
      (state) => relayedOwnerTab(ownerTabId, state.unifiedTabsByWorktree[worktreeId]) ?? null,
      OWNER_TAB_WAIT_MS
    )
  }
  const context = relayedShowContext(environmentId, event.context, {
    ownerTarget,
    tabs: useAppStore.getState().unifiedTabsByWorktree[worktreeId]
  })
  if (!context) {
    return { declined: true }
  }
  // Why the same dispatcher: a box's workspace shows exactly as a local one, files read through
  // its runtime by the worktree's owner.
  return { result: await dispatchAgentShow(event.request, context) }
}

/** Show what a windowless server (`orca serve` on a box) relayed, and send it the result. */
export async function answerAgentShowRelayRequest(
  environmentId: string,
  event: AgentShowRelayRequestEvent
): Promise<void> {
  const expectedPairingRevision = getRuntimeEnvironmentRevision(environmentId)
  const answer = await answerFor(environmentId, event).catch((error: unknown): Answer => ({
    error: (error instanceof Error ? error.message : String(error)).slice(0, 2_000)
  }))
  try {
    await window.api.runtimeEnvironments.call({
      selector: environmentId,
      method: 'agentShow.relayResult',
      params: { requestId: event.requestId, ...answer },
      expectedEnvironmentPairingRevision: expectedPairingRevision,
      timeoutMs: RESULT_TIMEOUT_MS
    })
  } catch (error) {
    // The server stops waiting on its own deadline.
    console.warn('[agent-show-relay] failed to answer', environmentId, error)
  }
}
