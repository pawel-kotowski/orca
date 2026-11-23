import type { SleepingAgentLaunchConfig } from '../../../shared/agent-session/lifecycle/agent-session-resume'
import { findClaudeExecutableIndex } from '../../../shared/agent-launch/startup/agent-resume-launch-command'
import {
  clearEnvCommand,
  commandSeparator,
  isPosixStartupShell,
  quoteStartupArg,
  tokenizeStartupCommand,
  type AgentStartupShell
} from '../../../shared/agent-launch/startup/tui-agent-startup-shell'

/** Flags of `claude` that take one value; any other word that is not a flag is the first prompt. */
const VALUE_FLAGS = new Set([
  '--model',
  '--effort',
  '--settings',
  '--append-system-prompt-file',
  '--append-system-prompt',
  '--system-prompt',
  '--system-prompt-file',
  '--add-dir',
  '--plugin-dir',
  '--permission-mode',
  '--mcp-config',
  '--fallback-model',
  '--max-turns',
  '--agents',
  '--agent',
  '--allowedTools',
  '--disallowedTools',
  '--allowed-tools',
  '--disallowed-tools',
  '--setting-sources',
  '--name',
  '-n',
  '--betas',
  '--debug-file'
])
/** Replaced by the session's own id. */
const SESSION_FLAGS = new Set(['--resume', '-r', '--session-id'])
const DROPPED_FLAGS = new Set(['--continue', '-c', '--fork-session'])

/** The flags a Claude was started with, without its first prompt and what named its session. */
export function claudeLaunchFlags(args: readonly string[]): string[] {
  const kept: string[] = []
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!
    const next = args[i + 1]
    const name = arg.split('=', 1)[0]!
    if (SESSION_FLAGS.has(name)) {
      i += arg.includes('=') || next === undefined || next.startsWith('-') ? 0 : 1
    } else if (arg.startsWith('-') && !DROPPED_FLAGS.has(arg)) {
      kept.push(arg)
      if (!arg.includes('=') && VALUE_FLAGS.has(arg) && next !== undefined) {
        kept.push(next)
        i += 1
      }
    }
  }
  return kept
}

/** The flags Orca recorded for a pane's Claude, when no running process can say. */
export function claudeRecordedFlags(
  recipe: SleepingAgentLaunchConfig,
  shell: AgentStartupShell
): string[] {
  const command = recipe.agentCommand?.trim()
  if (command) {
    const parsed = tokenizeStartupCommand(command, shell)
    const claude = parsed.ok ? findClaudeExecutableIndex(parsed.tokens, shell) : -1
    if (parsed.ok && claude >= 0) {
      return claudeLaunchFlags(parsed.tokens.slice(claude + 1))
    }
  }
  const parsed = tokenizeStartupCommand(recipe.agentArgs ?? '', shell)
  return parsed.ok ? claudeLaunchFlags(parsed.tokens) : []
}

/** Set by the shell a login was last started in; the next login decides them afresh. */
const LOGIN_ENV = [
  'CLAUDE_CONFIG_DIR',
  'ORCA_CLAUDE_INJECTED_CONFIG_DIR',
  'ENABLE_CLAUDEAI_MCP_SERVERS'
]

/** The line that runs a session on a login, typed into the pane's own shell. */
export function claudeResumeLine(args: {
  sessionId: string
  /** No transcript exists yet, so there is nothing to resume: start the id. */
  newSession: boolean
  flags: readonly string[]
  env: Readonly<Record<string, string>>
  /** undefined: the host's own login, which no CLAUDE_CONFIG_DIR names. */
  configDirEnv: string | undefined
  /** Set when the shell stands in another folder than the session's. */
  cwd: string | null
  shell: AgentStartupShell
}): string {
  const { shell } = args
  const quote = (value: string): string => quoteStartupArg(value, shell)
  const claude = [
    'claude',
    ...args.flags.map(quote),
    args.newSession ? '--session-id' : '--resume',
    quote(args.sessionId)
  ].join(' ')
  const { CLAUDE_CONFIG_DIR: _configDir, ...launchEnv } = args.env
  void _configDir
  const env = Object.entries({
    ...launchEnv,
    ...(args.configDirEnv ? { CLAUDE_CONFIG_DIR: args.configDirEnv } : {})
  })
  if (isPosixStartupShell(shell)) {
    const assigned = env.map(([name, value]) => quote(`${name}=${value}`))
    const run = [`env`, ...LOGIN_ENV.map((name) => `-u ${name}`), ...assigned, claude].join(' ')
    return args.cwd ? `cd ${quote(args.cwd)} && ${run}` : run
  }
  const assigned = env.map(([name, value]) =>
    shell === 'powershell' ? `$env:${name}=${quote(value)}` : `set ${quote(`${name}=${value}`)}`
  )
  const enter = args.cwd
    ? [
        shell === 'powershell'
          ? `Set-Location -LiteralPath ${quote(args.cwd)}`
          : `cd /d ${quote(args.cwd)}`
      ]
    : []
  return [...enter, clearEnvCommand(LOGIN_ENV, shell), ...assigned, claude].join(
    commandSeparator(shell)
  )
}
