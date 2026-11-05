import type {
  AgentStatusEntry,
  AgentType
} from '../../../../shared/agent-status/contracts/agent-status-types'
import type { SleepingAgentSessionRecord } from '../../../../shared/agent-session/lifecycle/agent-session-resume'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import { isNativeChatSupportedAgent } from '../../../../shared/native-chat/native-chat-agent-support'
import { nativeChatAvailabilityAgent } from '../../../../shared/native-chat/native-chat-availability'

export type NativeChatPaneResolutionInput = {
  /** Composite `${tabId}:${leafId}` key of the active leaf. */
  paneKey: string
  /** Launch metadata supplies the label until live status reports an agent. */
  launchAgent?: TuiAgent | null
  agentStatusEntry?: AgentStatusEntry
  ptyId: string | null
  /** Title/foreground fallback; launch metadata and hook status take precedence. */
  resolvedAgent?: TuiAgent | null
  /**
   * The pane's sleeping session record. Why: on startup main replays an idle agent's saved session
   * as a session-only update, which moves it here and drops the live status; without this the chat
   * found no session and came up empty until a view toggle.
   */
  sleepingSession?: Pick<SleepingAgentSessionRecord, 'agent' | 'providerSession'>
}

export type NativeChatPaneResolution = {
  agent: AgentType
  sessionId: string | null
  /** Prefer hook paths; recent Claude Code paths can diverge from session ids. */
  transcriptPath: string | null
  ptyId: string | null
  paneKey: string
}

/** Resolve agent evidence even before its provider session arrives; return null without an agent. */
export function resolveNativeChatSession(
  input: NativeChatPaneResolutionInput
): NativeChatPaneResolution | null {
  const sleeping = input.sleepingSession
  const agent = nativeChatAvailabilityAgent({
    // The sleeping record names the agent only when nothing about the pane does.
    detectedAgent:
      input.agentStatusEntry?.agentType ??
      (input.launchAgent || input.resolvedAgent ? undefined : sleeping?.agent),
    launchAgent: input.launchAgent,
    resolvedAgent: input.resolvedAgent
  })
  if (!agent || !isNativeChatSupportedAgent(agent)) {
    return null
  }
  // The live status's session wins; the sleeping one counts only for the same agent.
  const session =
    input.agentStatusEntry?.providerSession ??
    (sleeping && sleeping.agent === agent ? sleeping.providerSession : undefined)
  return {
    agent,
    sessionId: session?.id ?? null,
    transcriptPath: session?.transcriptPath ?? null,
    ptyId: input.ptyId,
    paneKey: input.paneKey
  }
}
