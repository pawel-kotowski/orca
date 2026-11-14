import { readInjectedAgentSessionId } from '../../shared/agent-session/lifecycle/agent-session-caller-env'
import { structuredAgentSessionTabId } from '../../shared/agent-session/view/structured-agent-session-projection'

// Why: a chat-mode agent has no ORCA_TAB_ID; its tab is derived from its injected session id.
export function showOwnerTabId(
  env: Readonly<Record<string, string | undefined>> = process.env
): string | null {
  const tabId = env.ORCA_TAB_ID?.trim()
  if (tabId) {
    return tabId
  }
  const sessionId = readInjectedAgentSessionId(env)
  return sessionId ? structuredAgentSessionTabId(sessionId) : null
}
