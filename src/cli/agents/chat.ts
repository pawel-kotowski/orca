import type { CommandHandler } from '../dispatch/dispatch'
import { resolve } from 'node:path'
import { getPresentStringFlag, getRequiredStringFlag } from '../arguments/flags'
import { readCliChatLaunch } from './chat-launch-profile-flags'
import { printResult } from '../output/command-result-output'
import { RuntimeClientError } from '../runtime/connection/types'
import { readInjectedAgentSessionId } from '../../shared/agent-session/lifecycle/launch/agent-session-caller-env'

type ChatRenameResult = { name: string | null; applied: boolean }

/** `--session <chat session id>`, or `--worker <structworker_…>` for a chat worker. */
function chatTarget(
  flags: Map<string, string | boolean>,
  client: { isRemote: boolean }
): { sessionId: string } | { worker: string } {
  const worker = getPresentStringFlag(flags, 'worker')
  return worker ? { worker } : { sessionId: chatSession(flags, client) }
}

function chatSession(flags: Map<string, string | boolean>, client: { isRemote: boolean }): string {
  const sessionId =
    getPresentStringFlag(flags, 'session') ??
    (client.isRemote ? undefined : readInjectedAgentSessionId())
  if (!sessionId) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Missing required --session <chat session id>.'
    )
  }
  return sessionId.replace(/^orca_session_id:/, '')
}

type ChatFacts = {
  state: 'working' | 'idle' | 'stopped'
  usageLimit: { resetsAt: number | null } | null
  claudeConfigDir: string | null
  providerSessionId: string | null
}

export const CHAT_HANDLERS: Record<string, CommandHandler> = {
  'chat send': async ({ flags, client, json }) => {
    const result = await client.call<{
      outcome: string
      clientMessageId: string
    }>('agentSession.sendText', {
      ...chatTarget(flags, client),
      text: getRequiredStringFlag(flags, 'text'),
      ...(flags.get('queue') === true ? { queue: true } : {})
    })
    printResult(result, json, (value) => `Message ${value.outcome}.`)
  },
  'chat compact': async ({ flags, client, json }) => {
    const result = await client.call<{ state: string }>('agentSession.compactNow', {
      ...chatTarget(flags, client)
    })
    printResult(result, json, (value) => `Compact ${value.state}.`)
  },
  'chat stop': async ({ flags, client, json }) => {
    const result = await client.call<{ stopped: boolean }>('agentSession.stopTurn', {
      ...chatTarget(flags, client)
    })
    printResult(result, json, () => 'Stopped the running turn.')
  },
  'chat close': async ({ flags, client, json }) => {
    const result = await client.call<unknown>('agentSession.close', {
      sessionId: chatSession(flags, client)
    })
    printResult(result, json, () => 'Closed the chat.')
  },
  'chat show': async ({ flags, client, json }) => {
    const result = await client.call<ChatFacts>('agentSession.launchFacts', {
      ...chatTarget(flags, client)
    })
    printResult(result, json, (value) =>
      [
        `state: ${value.state}`,
        `usageLimit: ${value.usageLimit ? `reached${value.usageLimit.resetsAt ? `, resets ${new Date(value.usageLimit.resetsAt).toISOString()}` : ''}` : 'no'}`,
        `login: ${value.claudeConfigDir ?? 'unknown'}`,
        `providerSessionId: ${value.providerSessionId ?? 'none yet'}`
      ].join('\n')
    )
  },
  'chat profile': async ({ flags, client, cwd, json }) => {
    const { chatLaunchProfile } = readCliChatLaunch(flags, cwd)
    const result = await client.call<{ outcome: 'next_start' | 'after_work' }>(
      'agentSession.setLaunchProfile',
      {
        ...chatTarget(flags, client),
        profile: chatLaunchProfile ?? {}
      }
    )
    printResult(result, json, (value) =>
      value.outcome === 'after_work'
        ? 'Takes the new profile when its running turn ends and its agent next starts.'
        : 'Its agent starts with the new profile with its next message.'
    )
  },
  'chat login': async ({ flags, client, cwd, json }) => {
    const result = await client.call<{ outcome: 'next_start' | 'after_work' }>(
      'agentSession.setLaunchProfile',
      {
        ...chatTarget(flags, client),
        claudeConfigDir: resolve(cwd, getRequiredStringFlag(flags, 'claude-config-dir'))
      }
    )
    printResult(result, json, (value) =>
      value.outcome === 'after_work'
        ? 'Moves to that login when its running turn ends and its agent next starts.'
        : 'Its agent starts on that login with its next message.'
    )
  },
  'chat rename': async ({ flags, client, json }) => {
    const name = getRequiredStringFlag(flags, 'name')
    // An empty --session must not fall back to this chat; the injected id is local-only.
    const sessionId =
      getPresentStringFlag(flags, 'session') ??
      (client.isRemote ? undefined : readInjectedAgentSessionId())
    if (!sessionId) {
      throw new RuntimeClientError(
        'invalid_argument',
        client.isRemote
          ? 'Missing required --session: on a paired host, name the chat by its session id.'
          : 'Missing required --session: this is not running inside a chat, so name the chat by its session id.'
      )
    }
    const result = await client
      .call<ChatRenameResult>('agentSession.rename', { sessionId, name })
      .catch((error: unknown) => {
        throw explainRenameRefusal(error, sessionId)
      })
    if (!result.result.applied) {
      throw new RuntimeClientError('invalid_argument', 'Not renamed: the name has no visible text.')
    }
    printResult(result, json, (value) => `Renamed chat to "${value.name}".`)
  }
}

// The host answers with bare wire codes; say what they mean for this command.
function explainRenameRefusal(error: unknown, sessionId: string): unknown {
  if (!(error instanceof RuntimeClientError)) {
    return error
  }
  if (error.message === 'agent_session_identity_required') {
    return new RuntimeClientError(
      'agent_session_identity_required',
      `No chat with session id ${sessionId} on this host.`
    )
  }
  if (
    error.message === 'structured_agent_session_unsupported' ||
    error.code === 'method_not_found'
  ) {
    return new RuntimeClientError(
      'incompatible_runtime',
      'This Orca host cannot rename chats from the CLI. Update Orca on that host, or check that it has chats turned on.'
    )
  }
  return error
}
