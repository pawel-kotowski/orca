import type { TuiAgent } from '../../../shared/agent-launch/catalog/tui-agent'
import { useAppStore } from '@/store'
import { defaultAgentTabViewMode } from '@/lib/agent-tab-default-view-mode'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { isWebRuntimeSessionActive } from '@/runtime/web-session-tabs-sync/identity/web-runtime-session-environment'
import { expectAgentTabChatView } from '@/runtime/web-session-tabs-sync/expected-agent-tab-view'

/**
 * A workspace just created on a remote host with an agent: its host makes the agent's tab, so
 * note that the first agent tab mirrored for it opens in the view new agents open in here.
 */
export function expectRemoteWorkspaceAgentView(worktreeId: string, agent: TuiAgent | null): void {
  if (!agent) {
    return
  }
  const state = useAppStore.getState()
  if (!isWebRuntimeSessionActive(runtimeEnvironmentIdOrLocalUnlessTwin(state, worktreeId))) {
    return
  }
  if (defaultAgentTabViewMode(state, worktreeId, agent) === 'chat') {
    expectAgentTabChatView(worktreeId)
  }
}
