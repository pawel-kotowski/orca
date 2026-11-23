import { appendFile, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getAppEnvironment } from '../../../shared/app-lifecycle/app-environment'
import { normalizeRuntimePathForComparison } from '../../../shared/file-access/cross-platform-path'
import { claudeConfigDirFromTranscriptPath } from '../../../shared/agent-accounts/claude/claude-session-login'
import type {
  ClaudeHostLogins,
  ClaudeLoginMoveResult
} from '../../../shared/agent-accounts/claude/claude-host-logins'
import {
  grantClaudeWorkspaceTrust,
  resolveLocalClaudeTrustConfig
} from '../../claude/configuration/claude-folder-trust-file'
import { holdTerminalInputForLoginMove } from '../../runtime/terminal/input/terminal-input-admission'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'
import { claudeSessionRecordDirs } from '../../ipc/pty/host-env/live-claude-session-holder'
import { claudeConfigDirEnv, readClaudeHostLogins } from './claude-host-logins-read'
import { ClaudeLoginMover } from './claude-login-move'
import { CLAUDE_PICKED_LOGINS_FILE, ClaudePickedLogins } from './claude-picked-logins'
import { claudeLaunchFlags, claudeRecordedFlags, claudeResumeLine } from './claude-resume-line'
import {
  findClaudeSessionProcess,
  isProcessAlive,
  readProcessArgv,
  readProcessPaneKey
} from './claude-session-process'

type MoveRuntime = Pick<
  OrcaRuntimeService,
  | 'readClaudeMoveTerminal'
  | 'readClaudeMoveForeground'
  | 'readClaudeMoveLaunch'
  | 'readTerminal'
  | 'sendTerminal'
  | 'getAgentProviderSessionRows'
>

/** Claude's prompt at its usage limit: its footer, or the menu it asks with (also limit-move's). */
const LIMIT_PROMPT = /Usage limit reached\s*·\s*limit resets|Stop and wait for limit to reset/i
const SCREEN_TAIL = 12
const STOP_WAIT_MS = 20_000

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms).unref?.())
}

function moveLog(): (line: string) => void {
  const dir = join(getAppEnvironment().getPath('userData'), 'logs')
  return (line) => {
    console.info(`[claude-login-move] ${line}`)
    void mkdir(dir, { recursive: true })
      .then(() =>
        appendFile(join(dir, 'claude-login-move.log'), `${new Date().toISOString()} ${line}\n`)
      )
      .catch(() => {})
  }
}

/** `claude` may be a script its runtime runs: its flags follow the script. */
function flagsOfArgv(argv: readonly string[]): string[] {
  return claudeLaunchFlags(argv.slice(/[\\/]cli\.(c|m)?js$/.test(argv[1] ?? '') ? 2 : 1))
}

async function stopProcess(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    return !isProcessAlive(pid)
  }
  const deadline = Date.now() + STOP_WAIT_MS
  while (isProcessAlive(pid) && Date.now() < deadline) {
    await sleep(250)
  }
  return !isProcessAlive(pid)
}

function createMover(runtime: MoveRuntime): ClaudeLoginMover {
  const userData = getAppEnvironment().getPath('userData')
  const rows = (): ReturnType<MoveRuntime['getAgentProviderSessionRows']> =>
    runtime.getAgentProviderSessionRows()
  return new ClaudeLoginMover({
    logins: (preferred) => readClaudeHostLogins({ rows }, preferred),
    terminal: (handle) => {
      try {
        return runtime.readClaudeMoveTerminal(handle)
      } catch {
        return null
      }
    },
    foreground: (handle) => runtime.readClaudeMoveForeground(handle),
    waitsAtLimit: async (handle) => {
      const { tail } = await runtime.readTerminal(handle, { screen: true, limit: SCREEN_TAIL })
      return LIMIT_PROMPT.test(tail.join('\n'))
    },
    process: async (sessionId) => {
      const dirs = new Set(await claudeSessionRecordDirs(userData))
      for (const login of await readClaudeHostLogins({ rows })) {
        dirs.add(join(login.configDir, 'sessions'))
      }
      return findClaudeSessionProcess(sessionId, [...dirs])
    },
    paneKeyOfProcess: readProcessPaneKey,
    argv: readProcessArgv,
    stop: stopProcess,
    conversation: async (transcriptPath, configDir) => {
      const from = claudeConfigDirFromTranscriptPath(transcriptPath)
      const there = from ? join(configDir, transcriptPath.slice(from.length)) : null
      const exists = await stat(transcriptPath).then(
        () => true,
        () => false
      )
      const readable =
        there !== null &&
        (await stat(there).then(
          () => true,
          () => false
        ))
      return { exists, readable }
    },
    trust: async (configDir, folder) => {
      const target = resolveLocalClaudeTrustConfig({
        workspacePath: folder,
        env: { ...process.env, CLAUDE_CONFIG_DIR: claudeConfigDirEnv(configDir) },
        claudeAuth: null,
        wslDistro: null
      })
      if (target) {
        await grantClaudeWorkspaceTrust(target, folder)
      }
    },
    resumeLine: async ({ handle, session, configDir, newSession, argv }) => {
      const launch = await runtime.readClaudeMoveLaunch(handle)
      if (!launch) {
        return null
      }
      const cwd = session.cwd && existsSync(session.cwd) ? session.cwd : null
      const elsewhere =
        cwd &&
        normalizeRuntimePathForComparison(cwd) !== normalizeRuntimePathForComparison(launch.path)
      return {
        folder: cwd ?? launch.path,
        line: claudeResumeLine({
          sessionId: session.id,
          newSession,
          flags: argv ? flagsOfArgv(argv) : claudeRecordedFlags(launch.recipe, launch.shell),
          env: launch.recipe.agentEnv ?? {},
          configDirEnv: claudeConfigDirEnv(configDir, homedir()),
          cwd: elsewhere ? cwd : null,
          shell: launch.shell
        })
      }
    },
    type: async (handle, _ptyId, line) => {
      const sent = await runtime.sendTerminal(
        handle,
        { text: line, enter: true },
        { inputKind: 'driving', inputSource: 'login-move' }
      )
      return sent.accepted
    },
    holdInput: holdTerminalInputForLoginMove,
    picks: new ClaudePickedLogins(join(userData, CLAUDE_PICKED_LOGINS_FILE)),
    sleep,
    now: Date.now,
    log: moveLog()
  })
}

const movers = new WeakMap<object, ClaudeLoginMover>()

function moverOf(runtime: MoveRuntime): ClaudeLoginMover {
  let mover = movers.get(runtime)
  if (!mover) {
    mover = createMover(runtime)
    movers.set(runtime, mover)
  }
  return mover
}

/** Picks up the moves that waited for a turn when this host restarted. */
export function installClaudeLoginMoves(runtime: MoveRuntime): () => void {
  const mover = moverOf(runtime)
  mover.resume()
  return () => mover.dispose()
}

/** The logins a chat can move to on this host, and where its move stands. */
export async function readClaudeLoginsForChat(
  runtime: MoveRuntime,
  args: { terminal?: string; transcriptPath?: string }
): Promise<ClaudeHostLogins> {
  const current = claudeConfigDirFromTranscriptPath(args.transcriptPath ?? null)
  const terminal = args.terminal
    ? await Promise.resolve(args.terminal)
        .then((handle) => runtime.readClaudeMoveTerminal(handle))
        .catch(() => null)
    : null
  return {
    logins: await readClaudeHostLogins(
      { rows: () => runtime.getAgentProviderSessionRows() },
      current
    ),
    movingTo: terminal?.session ? moverOf(runtime).movingTo(terminal.session.id) : null,
    backgroundWork: terminal?.backgroundWork ?? false
  }
}

export function moveChatClaudeLogin(
  runtime: MoveRuntime,
  args: { terminal: string; configDir: string; transcriptPath?: string }
): Promise<ClaudeLoginMoveResult> {
  return moverOf(runtime).move({ ...args, transcriptPath: args.transcriptPath ?? null })
}
