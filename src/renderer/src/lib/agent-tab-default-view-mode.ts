import type { Tab } from '../../../shared/workspace-layout/tab-groups/tab-types'
import type { TuiAgent } from '../../../shared/agent-launch/catalog/tui-agent'
import { cliAgentsOpenInChat } from '../../../shared/native-chat/settings/native-chat-appearance-settings'
import { isNativeChatAgentAvailable } from '../../../shared/native-chat/native-chat-availability'
import { isNativeChatTranscriptLocalReadable } from '../../../shared/native-chat/transcript/messages/native-chat-transcript-readability'
import { getConnectionIdFromState } from '@/lib/workspace/ownership/connection-owner-resolution'
import type { AppState } from '@/store/types'

/**
 * The view a new agent terminal tab opens in when its caller did not choose one: its own
 * terminal-backed Chat UI when the user keeps "Open CLI agents in Chat UI" on and chat can read
 * this agent here, else the terminal (undefined keeps the implicit default).
 */
export function defaultAgentTabViewMode(
  state: AppState,
  worktreeId: string,
  agent: TuiAgent | undefined
): Tab['viewMode'] | undefined {
  if (!agent || !cliAgentsOpenInChat(state.settings)) {
    return undefined
  }
  const readable = isNativeChatTranscriptLocalReadable(getConnectionIdFromState(state, worktreeId))
  return isNativeChatAgentAvailable(agent, readable) ? 'chat' : undefined
}

/**
 * A launch's requested view after the user's default: main and paired clients mark every
 * terminal-surface launch 'terminal' (the surface, not a view choice), so only 'chat' is kept as
 * asked and 'terminal' or nothing follows "Open CLI agents in Chat UI".
 */
export function resolveAgentTabViewMode(
  state: AppState,
  worktreeId: string,
  agent: TuiAgent | undefined,
  requested: Tab['viewMode'] | undefined
): Tab['viewMode'] | undefined {
  if (requested === 'chat') {
    return requested
  }
  return defaultAgentTabViewMode(state, worktreeId, agent) ?? requested
}

/**
 * The view a tab being created opens in: the caller's choice, else "Open CLI agents in Chat UI"
 * for a new agent launch; a tab adopting a live or mirrored PTY keeps the view it already had.
 */
export function newTerminalTabViewMode(
  state: AppState,
  worktreeId: string,
  options:
    | {
        viewMode?: Tab['viewMode']
        initialPtyId?: unknown
        mirroredHostTab?: unknown
        launchAgent?: TuiAgent
      }
    | undefined
): Tab['viewMode'] | undefined {
  if (options?.viewMode) {
    return options.viewMode
  }
  return options?.initialPtyId || options?.mirroredHostTab
    ? undefined
    : defaultAgentTabViewMode(state, worktreeId, options?.launchAgent)
}
