// `orca agent launch`'s chat profile flags: a chat's own arguments, environment, system prompt
// file, login, permission mode and the conversation it resumes.
import { isAbsolute, resolve } from 'node:path'
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
  resumeFrom?: { providerSessionId: string; takeOverClosedChat?: true }
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

/** A path as the host that runs the chat reads it: relative ones resolve against this directory only
 *  when this CLI runs on that host (--environment names another machine, whose files these are not). */
export function hostPath(value: string, cwd: string, remote: boolean, flag: string): string {
  if (isAbsolute(value)) {
    return value
  }
  if (remote) {
    throw new RuntimeClientError(
      'invalid_argument',
      `--${flag} must be an absolute path on the Orca host that runs the chat.`
    )
  }
  return resolve(cwd, value)
}

export function readCliChatLaunch(flags: Flags, cwd: string, remote = false): CliChatLaunch {
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
    ...(configDir
      ? { claudeConfigDir: hostPath(configDir, cwd, remote, 'claude-config-dir') }
      : {}),
    ...(promptFile
      ? {
          appendSystemPromptFile: hostPath(promptFile, cwd, remote, 'append-system-prompt-file')
        }
      : {})
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
    // A closed chat that holds it hands it over: same session id, so its cache still matches.
    ...(resume
      ? { resumeFrom: { providerSessionId: resume, takeOverClosedChat: true as const } }
      : {}),
    ...(known ? { chatOptions: { [AGENT_CHAT_PERMISSION_MODE_OPTION_ID]: known } } : {})
  }
}

export function hasCliChatLaunch(launch: CliChatLaunch): boolean {
  return Boolean(launch.chatLaunchProfile || launch.resumeFrom || launch.chatOptions)
}

const REDACTED = '<redacted>'

function redactProfileEnv(profile: unknown): unknown {
  if (typeof profile !== 'object' || profile === null || !('env' in profile)) {
    return profile
  }
  const env = profile.env
  return typeof env === 'object' && env !== null
    ? { ...profile, env: Object.fromEntries(Object.keys(env).map((key) => [key, REDACTED])) }
    : profile
}

/** A launch's arguments and params as an error shows them: a chat profile's environment values
 *  (tokens, paths of secrets) are named, never printed. */
export function redactChatLaunchArgs(args: readonly string[]): string[] {
  const redactEnv = (entry: string): string =>
    entry.includes('=') ? `${entry.slice(0, entry.indexOf('='))}=${REDACTED}` : entry
  const redactProfile = (json: string): string => {
    try {
      return JSON.stringify(redactProfileEnv(JSON.parse(json)))
    } catch {
      return REDACTED
    }
  }
  return args.map((arg, index) => {
    const flag = args[index - 1]
    if (flag === '--env') {
      return redactEnv(arg)
    }
    if (flag === '--chat-profile') {
      return redactProfile(arg)
    }
    // The same flags written with their value after `=`.
    if (arg.startsWith('--env=')) {
      return `--env=${redactEnv(arg.slice('--env='.length))}`
    }
    if (arg.startsWith('--chat-profile=')) {
      return `--chat-profile=${redactProfile(arg.slice('--chat-profile='.length))}`
    }
    return arg
  })
}

export function redactChatLaunchParams(params: unknown): unknown {
  if (typeof params !== 'object' || params === null || !('chatLaunchProfile' in params)) {
    return params
  }
  return { ...params, chatLaunchProfile: redactProfileEnv(params.chatLaunchProfile) }
}
