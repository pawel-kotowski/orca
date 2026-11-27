// A chat's own launch profile (`orca agent launch --surface chat --claude-arg …`), as Claude takes it.
import { readFile } from 'node:fs/promises'
import type { ChatLaunchProfile } from '../../../../shared/agent-launch/contracts/chat-launch-profile'
import type { ClaudeAccountRecipe } from '../../../../shared/agent-session/lifecycle/accounts/agent-session-acquired-account'
import { claudeConfigDirEnvPatch } from './claude-config-dir-pin'
import {
  CLAUDE_SHORT_FLAGS,
  CLAUDE_TRANSPORT_OWNED_FLAGS,
  claudeStructuredLaunchArgs
} from './claude-structured-launch-args'

/** Owned flags a profile may still name: the SDK takes them as lists, so they merge. */
const TOOL_LIST_FLAGS = new Set(['allowedTools', 'disallowedTools'])

export type ClaudeChatLaunchProfileParts = {
  extraArgs: Record<string, string | null>
  additionalDirectories: string[]
  allowedTools: string[]
  disallowedTools: string[]
  env: Record<string, string>
  appendSystemPrompt: string | null
  claudeConfigDir: string | null
}

const EMPTY: ClaudeChatLaunchProfileParts = {
  extraArgs: {},
  additionalDirectories: [],
  allowedTools: [],
  disallowedTools: [],
  env: {},
  appendSystemPrompt: null,
  claudeConfigDir: null
}

function flagName(arg: string): string | null {
  if (!arg.startsWith('-')) {
    return null
  }
  const name = arg.split('=')[0]!
  // A short flag names its long one (`-r` is --resume), as the launch parser reads it.
  const bare = name.startsWith('--') ? name.slice(2) : (CLAUDE_SHORT_FLAGS[name] ?? name.slice(1))
  return bare || null
}

/** Why a profile's arguments cannot start a chat, or null. Orca's transport owns the session,
 *  permission and system-prompt flags; a profile says those with its own fields. */
export function claudeChatProfileArgsRefusal(args: readonly string[]): string | null {
  for (const arg of args) {
    if (/^-[^-]/.test(arg) && !CLAUDE_SHORT_FLAGS[arg.split('=')[0]!]) {
      return `${arg} is a short flag the chat launch does not read: write its long form.`
    }
    const flag = flagName(arg)
    if (flag && CLAUDE_TRANSPORT_OWNED_FLAGS.has(flag) && !TOOL_LIST_FLAGS.has(flag)) {
      return `--${flag} is set by Orca for a chat: use --permission-mode, --resume or --append-system-prompt-file instead.`
    }
  }
  try {
    claudeStructuredLaunchArgs(withoutToolLists(args).rest)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return null
}

/** `A,B C` as Claude reads a tool list: split at commas and spaces, but not inside a rule's
 *  parentheses (`Bash(git log:*)` is one rule). */
export function splitToolRules(value: string): string[] {
  const rules: string[] = []
  let depth = 0
  let current = ''
  for (const char of value) {
    if (char === '(') {
      depth++
    } else if (char === ')') {
      depth = Math.max(0, depth - 1)
    }
    if (depth === 0 && (char === ',' || /\s/.test(char))) {
      if (current) {
        rules.push(current)
      }
      current = ''
      continue
    }
    current += char
  }
  return current ? [...rules, current] : rules
}

function withoutToolLists(args: readonly string[]): {
  rest: string[]
  lists: { allowedTools: string[]; disallowedTools: string[] }
} {
  const rest: string[] = []
  const lists = {
    allowedTools: [] as string[],
    disallowedTools: [] as string[]
  }
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    const flag = flagName(arg)
    if (flag !== 'allowedTools' && flag !== 'disallowedTools') {
      rest.push(arg)
      continue
    }
    const values = arg.includes('=') ? [arg.slice(arg.indexOf('=') + 1)] : []
    while (args[index + 1] !== undefined && !args[index + 1]!.startsWith('-')) {
      values.push(args[++index]!)
    }
    lists[flag].push(...values.flatMap(splitToolRules))
  }
  return { rest, lists }
}

/** The profile's parts for one start; its system prompt file is read now, so a rewrite applies. */
export async function claudeChatLaunchProfileParts(
  profile: ChatLaunchProfile | null | undefined,
  readText: (path: string) => Promise<string> = (path) => readFile(path, 'utf8')
): Promise<ClaudeChatLaunchProfileParts> {
  if (!profile) {
    return EMPTY
  }
  const { rest, lists } = withoutToolLists(profile.args ?? [])
  const parsed = claudeStructuredLaunchArgs(rest)
  const prompt = profile.appendSystemPromptFile
    ? (await readText(profile.appendSystemPromptFile)).trim()
    : ''
  return {
    extraArgs: parsed.extraArgs,
    additionalDirectories: parsed.additionalDirectories,
    ...lists,
    env: { ...profile.env },
    appendSystemPrompt: prompt || null,
    claudeConfigDir: profile.claudeConfigDir ?? null
  }
}

/** The profile's variables, each `${NAME}` in a value read from the agent's own environment, so
 *  `PATH` can be extended rather than replaced. */
export function expandChatProfileEnv(
  env: Readonly<Record<string, string>>,
  base: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [
      key,
      value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => base[name] ?? '')
    ])
  )
}

/** The profile's login in place of the workspace's account: its folder, pinned in `env`. */
export function claudeChatProfileAccount(
  env: Record<string, string>,
  claudeConfigDir: string | null
): ClaudeAccountRecipe | null {
  if (!claudeConfigDir) {
    return null
  }
  delete env.CLAUDE_CONFIG_DIR
  Object.assign(env, claudeConfigDirEnvPatch(claudeConfigDir, { env }))
  return {
    route: 'system',
    home: claudeConfigDir,
    configDir: env.CLAUDE_CONFIG_DIR ?? null
  }
}

/** Orca's own instructions first, then the profile's file. */
export function withProfileSystemPrompt<T extends { systemPrompt?: unknown }>(
  options: T,
  appendSystemPrompt: string | null
): T {
  if (!appendSystemPrompt) {
    return options
  }
  const current = options.systemPrompt
  const own =
    typeof current === 'object' && current !== null && 'append' in current
      ? String(current.append ?? '')
      : ''
  return {
    ...options,
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: [own, appendSystemPrompt].filter(Boolean).join('\n\n')
    }
  }
}

/** The profile's directories, tool lists and prompt file over a launch's own options. */
export function claudeChatProfileOptions<T extends { systemPrompt?: unknown }>(
  discovery: { additionalDirectories: readonly string[] },
  own: T,
  profile: ClaudeChatLaunchProfileParts
): T & { additionalDirectories: string[]; allowedTools?: string[]; disallowedTools?: string[] } {
  return {
    additionalDirectories: [...discovery.additionalDirectories, ...profile.additionalDirectories],
    ...(profile.allowedTools.length > 0 ? { allowedTools: profile.allowedTools } : {}),
    ...(profile.disallowedTools.length > 0 ? { disallowedTools: profile.disallowedTools } : {}),
    ...withProfileSystemPrompt(own, profile.appendSystemPrompt)
  }
}
