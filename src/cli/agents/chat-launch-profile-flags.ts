// `orca agent launch`'s chat profile flags: a chat's own arguments, environment, system prompt
// file, login, permission mode and the conversation it resumes.
import { resolve } from 'node:path'
import {
  ChatLaunchProfileSchema,
  isEmptyChatLaunchProfile,
  type ChatLaunchProfile
} from '../../shared/agent-launch/contracts/chat-launch-profile'
import {
  AGENT_CHAT_PERMISSION_MODES,
  AGENT_CHAT_PERMISSION_MODE_OPTION_ID
} from '../../shared/agent-launch/permissions/agent-chat-permission-mode'
import {
  getOptionalJsonFlag,
  getOptionalStringFlag,
  getRepeatedStringFlag
} from '../arguments/flags'
import { RuntimeClientError } from '../runtime/connection/types'

type Flags = Map<string, string | boolean>

export type CliChatLaunch = {
  chatLaunchProfile?: ChatLaunchProfile
  resumeFrom?: { providerSessionId: string }
  chatOptions?: Record<string, string>
}

function parseProfileJson(flags: Flags): Record<string, unknown> {
  const raw = getOptionalJsonFlag(flags, 'chat-profile')
  if (raw === undefined) {
    return {}
  }
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return { ...value }
    }
  } catch {
    // Reported below.
  }
  throw new RuntimeClientError('invalid_argument', '--chat-profile must be a JSON object.')
}

function parseEnv(flags: Flags): Record<string, string> {
  const env: Record<string, string> = {}
  for (const entry of getRepeatedStringFlag(flags, 'env')) {
    const at = entry.indexOf('=')
    if (at <= 0) {
      throw new RuntimeClientError('invalid_argument', `--env takes KEY=VALUE, got "${entry}".`)
    }
    env[entry.slice(0, at)] = entry.slice(at + 1)
  }
  return env
}

export function readCliChatLaunch(flags: Flags, cwd: string): CliChatLaunch {
  const json = parseProfileJson(flags)
  const env = {
    ...(typeof json.env === 'object' ? json.env : {}),
    ...parseEnv(flags)
  }
  const configDir = getOptionalStringFlag(flags, 'claude-config-dir')
  const promptFile = getOptionalStringFlag(flags, 'append-system-prompt-file')
  const parsed = ChatLaunchProfileSchema.safeParse({
    ...json,
    ...(Object.keys(env).length > 0 ? { env } : {}),
    ...(configDir ? { claudeConfigDir: resolve(cwd, configDir) } : {}),
    ...(promptFile ? { appendSystemPromptFile: resolve(cwd, promptFile) } : {})
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new RuntimeClientError(
      'invalid_argument',
      `Invalid chat profile${issue?.path.length ? ` (${issue.path.join('.')})` : ''}: ${issue?.message ?? 'malformed'}`
    )
  }
  const resume = getOptionalStringFlag(flags, 'resume')
  const mode = getOptionalStringFlag(flags, 'permission-mode')
  const known = AGENT_CHAT_PERMISSION_MODES.find((candidate) => candidate === mode)
  if (mode !== undefined && !known) {
    throw new RuntimeClientError(
      'invalid_argument',
      `--permission-mode must be one of: ${AGENT_CHAT_PERMISSION_MODES.join(', ')}`
    )
  }
  return {
    ...(isEmptyChatLaunchProfile(parsed.data) ? {} : { chatLaunchProfile: parsed.data }),
    ...(resume ? { resumeFrom: { providerSessionId: resume } } : {}),
    ...(known ? { chatOptions: { [AGENT_CHAT_PERMISSION_MODE_OPTION_ID]: known } } : {})
  }
}

export function hasCliChatLaunch(launch: CliChatLaunch): boolean {
  return Boolean(launch.chatLaunchProfile || launch.resumeFrom || launch.chatOptions)
}
