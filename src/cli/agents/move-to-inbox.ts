import { readFileSync } from 'node:fs'
import type { RuntimeClient } from '../runtime/client'
import type { CommandHandler } from '../dispatch/dispatch'
import { getRequiredStringFlag } from '../arguments/flags'
import { RuntimeClientError } from '../runtime/connection/types'
import { readInjectedAgentSessionId } from '../../shared/agent-session/lifecycle/launch/agent-session-caller-env'
import { ORCA_MOVE_TO_INBOX_PATH } from '../../shared/agent-status/contracts/agent-reach-out'

type HookEndpoint = { port: string; token: string }

// Why the endpoint file first: Orca rewrites it with a new token whenever its hook server
// restarts, while the terminal's environment keeps the one from when the terminal started.
function readHookEndpoint(env: NodeJS.ProcessEnv): HookEndpoint | null {
  const values: Record<string, string> = {}
  try {
    const file = env.ORCA_AGENT_HOOK_ENDPOINT?.trim()
    for (const line of file ? readFileSync(file, 'utf8').split('\n') : []) {
      const eq = line.indexOf('=')
      if (eq > 0) {
        values[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
      }
    }
  } catch {
    // Unreadable file: the environment's values below.
  }
  const port = values.ORCA_AGENT_HOOK_PORT || env.ORCA_AGENT_HOOK_PORT?.trim()
  const token = values.ORCA_AGENT_HOOK_TOKEN || env.ORCA_AGENT_HOOK_TOKEN?.trim()
  return port && token ? { port, token } : null
}

function reportMoved(json: boolean, result: Record<string, string>): void {
  console.log(
    json
      ? JSON.stringify({ ok: true, result }, null, 2)
      : "Moved this agent's card to the user's Inbox."
  )
}

async function moveChatToInbox(
  client: Pick<RuntimeClient, 'call'>,
  sessionId: string,
  message: string
): Promise<void> {
  const { result } = await client
    .call<{ moved: boolean }>('agentSession.moveToInbox', { sessionId, message })
    .catch((error: unknown) => {
      if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
        throw new RuntimeClientError(
          'incompatible_runtime',
          "This Orca is too old to move a chat's card to the Inbox."
        )
      }
      throw error
    })
  if (!result.moved) {
    throw new RuntimeClientError('invalid_argument', 'Not moved: the message has no visible text.')
  }
}

export const MOVE_TO_INBOX_HANDLERS: Record<string, CommandHandler> = {
  'move-to-inbox': async ({ flags, client, json }) => {
    const message = getRequiredStringFlag(flags, 'message')
    // A chat's agent has no pane, and a terminal it opened may inherit another agent's.
    const sessionId = readInjectedAgentSessionId()
    if (sessionId) {
      await moveChatToInbox(client, sessionId, message)
      reportMoved(json, { sessionId, message })
      return
    }
    const paneKey = process.env.ORCA_PANE_KEY?.trim()
    const endpoint = readHookEndpoint(process.env)
    if (!paneKey || !endpoint) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Not inside an agent Orca started (no chat session id, and ORCA_PANE_KEY or the hook endpoint is missing), so there is no card to move.'
      )
    }
    const response = await fetch(`http://127.0.0.1:${endpoint.port}${ORCA_MOVE_TO_INBOX_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-orca-agent-hook-token': endpoint.token },
      body: JSON.stringify({ paneKey, message })
    }).catch((error: unknown) => {
      throw new RuntimeClientError(
        'runtime_unavailable',
        `Could not reach Orca on this machine: ${error instanceof Error ? error.message : String(error)}`
      )
    })
    if (response.status === 404) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Orca has no agent status for this terminal yet, or this Orca is too old to move cards to the Inbox.'
      )
    }
    if (!response.ok) {
      throw new RuntimeClientError(
        'runtime_unavailable',
        `Orca refused the request (HTTP ${response.status}).`
      )
    }
    reportMoved(json, { paneKey, message })
  }
}
