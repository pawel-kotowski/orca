import type { CommandHandler } from '../dispatch/dispatch'
import { printResult } from '../output/command-result-output'
import type { RuntimeClient } from '../runtime/client'
import type { GlobalSettings } from '../../shared/settings/global-settings-types'
import type { AgentDefaultSurface } from '../../shared/native-chat/settings/native-chat-appearance-settings'
import {
  normalizeAgentDefaultSurface,
  normalizeNativeChatProviderChoices
} from '../../shared/native-chat/settings/native-chat-providers'

type SurfaceSettings = Pick<GlobalSettings, 'agentDefaultSurface' | 'nativeChatProviders'>

type AgentSurfaceResult = {
  /** What a new agent opens as: Settings → Agents → Open agents as. */
  agentDefaultSurface: AgentDefaultSurface
  /** Agents set to their own surface on their Settings → Agents row; they ignore the default. */
  agentOverrides: Record<string, AgentDefaultSurface>
}

function toResult(settings: Partial<SurfaceSettings>): AgentSurfaceResult {
  const overrides = Object.entries(normalizeNativeChatProviderChoices(settings.nativeChatProviders))
  return {
    agentDefaultSurface: normalizeAgentDefaultSurface(settings.agentDefaultSurface),
    agentOverrides: Object.fromEntries(
      overrides.map(([agent, chat]) => [agent, chat ? 'chat' : 'terminal'])
    )
  }
}

function formatSurface(result: AgentSurfaceResult): string {
  const name = (surface: AgentDefaultSurface): string =>
    surface === 'chat' ? 'chat (structured chat UI)' : 'terminal (agent CLI in a terminal)'
  const overrides = Object.entries(result.agentOverrides)
  return [
    `New agents open as: ${name(result.agentDefaultSurface)}`,
    ...(overrides.length > 0
      ? [
          'Agents with their own choice (Settings → Agents → Installed):',
          ...overrides.map(([agent, surface]) => `  ${agent}: ${surface}`)
        ]
      : [])
  ].join('\n')
}

async function readSurface(client: RuntimeClient) {
  const response = await client.call<{ settings: Partial<SurfaceSettings> }>('settings.get')
  return { ...response, result: toResult(response.result.settings) }
}

function setSurface(surface: AgentDefaultSurface): CommandHandler {
  return async ({ client, json }) => {
    await client.call('settings.update', { agentDefaultSurface: surface }, { timeoutMs: 10_000 })
    printResult(await readSurface(client), json, formatSurface)
  }
}

export const AGENT_SURFACE_HANDLERS: Record<string, CommandHandler> = {
  'agent surface status': async ({ client, json }) => {
    printResult(await readSurface(client), json, formatSurface)
  },
  'agent surface chat': setSurface('chat'),
  'agent surface terminal': setSurface('terminal')
}
