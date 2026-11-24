import { restartInStructuredChatTerminal } from '../../runtime/agent-session/ownership/structured-chat-terminal-holds'
import { resolve } from 'node:path'
import type {
  ClaudeHostLogin,
  ClaudeLoginMoveRefusal,
  ClaudeLoginMoveResult
} from '../../../shared/agent-accounts/claude/claude-host-logins'
import type { ClaudePickedLogin } from './claude-picked-logins'
import type { ClaudeSessionProcess } from './claude-session-process'

/** The terminal a chat's Claude runs in (or ran in), as its host knows it. */
export type ClaudeMoveTerminal = {
  ptyId: string
  paneKey: string | null
  /** The pane's own conversation; null when the host recorded none. */
  session: { id: string; transcriptPath: string | null; cwd: string | null } | null
  /** The main agent's turn: subagents and background commands do not hold it open. */
  turnRunning: boolean
  backgroundWork: boolean
}

export type ClaudeMoveForeground = 'claude' | 'shell' | 'other'

export type ClaudeLoginMoveDeps = {
  logins: (preferred: string | null) => Promise<ClaudeHostLogin[]>
  terminal: (handle: string) => ClaudeMoveTerminal | null
  foreground: (handle: string) => Promise<ClaudeMoveForeground>
  /** Claude asks what to do at its usage limit; that wait never ends its turn by itself. */
  waitsAtLimit: (handle: string) => Promise<boolean>
  process: (sessionId: string) => Promise<ClaudeSessionProcess | null>
  paneKeyOfProcess: (pid: number) => Promise<string | null>
  argv: (pid: number) => Promise<string[] | null>
  stop: (pid: number) => Promise<boolean>
  /** Whether a folder's login can read the conversation, and whether one was written at all. */
  conversation: (
    transcriptPath: string,
    configDir: string
  ) => Promise<{ exists: boolean; readable: boolean }>
  trust: (configDir: string, folder: string) => Promise<void>
  resumeLine: (args: {
    handle: string
    session: NonNullable<ClaudeMoveTerminal['session']>
    configDir: string
    newSession: boolean
    argv: string[] | null
  }) => Promise<{ line: string; folder: string } | null>
  type: (handle: string, ptyId: string, line: string) => Promise<boolean>
  /** Holds everyone else's input while the pane has no Claude; returns its release. */
  holdInput: (ptyId: string) => () => void
  picks: {
    all: () => Record<string, ClaudePickedLogin>
    set: (sessionId: string, pick: ClaudePickedLogin) => void
    settle: (sessionId: string) => void
    restore: (sessionId: string, previous: ClaudePickedLogin | undefined) => void
  }
  sleep: (ms: number) => Promise<void>
  now: () => number
  log: (line: string) => void
}

const POLL_MS = 1_000
/** How long the shell may take to come back, and Claude to start. */
const SHELL_WAIT_MS = 15_000
const START_WAIT_MS = 30_000
/** A waiting move whose terminal the host still does not have after this long was closed. */
const TERMINAL_GONE_MS = 5 * 60_000

type MoveRequest = {
  terminal: string
  configDir: string
  /** The chat's own session, for a terminal whose host recorded none (a pane back as a shell). */
  transcriptPath: string | null
}

function sameFolder(left: string, right: string): boolean {
  return resolve(left) === resolve(right)
}

function sessionOfTranscript(transcriptPath: string | null): ClaudeMoveTerminal['session'] {
  const name = transcriptPath?.split(/[\\/]/).pop()
  return transcriptPath && name?.endsWith('.jsonl')
    ? { id: name.slice(0, -'.jsonl'.length), transcriptPath, cwd: null }
    : null
}

/**
 * Moves a chat's Claude to another login of its host, in its own terminal: the terminal's handle,
 * its worker dispatch and its scrollback stay. A running turn is waited out; the picked login is
 * remembered, so neither an Orca restart nor a box's limit-move loses it.
 */
export class ClaudeLoginMover {
  private readonly pending = new Set<string>()
  private readonly missing = new Map<string, number>()
  private readonly running = new Map<string, Promise<ClaudeLoginMoveResult>>()
  private polling = false
  private disposed = false

  constructor(private readonly deps: ClaudeLoginMoveDeps) {}

  /** Re-arms the moves that waited for a turn when the host restarted. */
  resume(): void {
    for (const [sessionId, pick] of Object.entries(this.deps.picks.all())) {
      if (pick.pendingTerminal) {
        this.pending.add(sessionId)
      }
    }
    this.poll()
  }

  dispose(): void {
    this.disposed = true
  }

  movingTo(sessionId: string): string | null {
    const pick = this.deps.picks.all()[sessionId]
    return pick && (pick.pendingTerminal || this.running.has(sessionId)) ? pick.configDir : null
  }

  async move(request: MoveRequest): Promise<ClaudeLoginMoveResult> {
    const { deps } = this
    const terminal = deps.terminal(request.terminal)
    if (!terminal) {
      return refused('not_local')
    }
    const session = terminal.session ?? sessionOfTranscript(request.transcriptPath)
    if (!session) {
      return refused('no_session')
    }
    const login = (await deps.logins(request.configDir)).find((entry) =>
      sameFolder(entry.configDir, request.configDir)
    )
    if (!login) {
      return refused('unknown_login')
    }
    // One move of a session at a time: a second pick runs when the first has settled.
    await this.running.get(session.id)?.catch(() => null)
    const previous = deps.picks.all()[session.id]
    const live = await deps.process(session.id)
    const argv = (live && (await deps.argv(live.pid))) ?? previous?.argv
    const pick: ClaudePickedLogin = {
      configDir: login.configDir,
      pickedAt: deps.now(),
      ...(argv ? { argv } : {})
    }
    if (live && sameFolder(live.configDir, login.configDir)) {
      this.pending.delete(session.id)
      deps.picks.set(session.id, pick)
      return { outcome: 'unchanged' }
    }
    if (live && (await this.turnHolds(request.terminal, terminal))) {
      deps.picks.set(session.id, { ...pick, pendingTerminal: request.terminal })
      this.pending.add(session.id)
      this.poll()
      return { outcome: 'queued' }
    }
    this.pending.delete(session.id)
    deps.picks.set(session.id, pick)
    const result = await this.run(session, request.terminal, login.configDir)
    if (result.outcome === 'refused') {
      deps.picks.restore(session.id, previous?.pendingTerminal ? undefined : previous)
    }
    return result
  }

  private async turnHolds(handle: string, terminal: ClaudeMoveTerminal): Promise<boolean> {
    return terminal.turnRunning && !(await this.deps.waitsAtLimit(handle).catch(() => false))
  }

  private run(
    session: NonNullable<ClaudeMoveTerminal['session']>,
    handle: string,
    configDir: string
  ): Promise<ClaudeLoginMoveResult> {
    // Local: between the stop and the resume line a held chat's shell is alone, and not done.
    const releaseHold = restartInStructuredChatTerminal(session.id)
    const move = this.restart(session, handle, configDir)
      .catch((error: unknown): ClaudeLoginMoveResult => {
        this.deps.log(`failed ${session.id} ${String(error)}`)
        return refused('start_failed')
      })
      .then((result) => {
        this.deps.log(
          `${result.outcome}${result.outcome === 'refused' ? ` (${result.reason})` : ''} session=${session.id} terminal=${handle} to=${configDir}`
        )
        return result
      })
      .finally(() => {
        releaseHold()
        this.running.delete(session.id)
      })
    this.running.set(session.id, move)
    return move
  }

  private async restart(
    session: NonNullable<ClaudeMoveTerminal['session']>,
    handle: string,
    configDir: string
  ): Promise<ClaudeLoginMoveResult> {
    const { deps } = this
    const conversation = session.transcriptPath
      ? await deps.conversation(session.transcriptPath, configDir)
      : { exists: true, readable: true }
    if (conversation.exists && !conversation.readable) {
      return refused('not_shared')
    }
    const live = await deps.process(session.id)
    const argv = (live && (await deps.argv(live.pid))) ?? deps.picks.all()[session.id]?.argv ?? null
    const resume = await deps.resumeLine({
      handle,
      session,
      configDir,
      newSession: !conversation.exists,
      argv
    })
    if (!resume) {
      return refused('no_session')
    }
    await deps.trust(configDir, resume.folder).catch(() => undefined)
    // Read last, right before the stop: the awaits above let the pane change.
    const terminal = deps.terminal(handle)
    if (!terminal) {
      return refused('not_local')
    }
    const foreground = await deps.foreground(handle)
    if (live) {
      const pane = await deps.paneKeyOfProcess(live.pid)
      if (foreground !== 'claude' || (pane && terminal.paneKey && pane !== terminal.paneKey)) {
        return refused('running_elsewhere')
      }
    } else if (foreground !== 'shell') {
      return refused('terminal_busy')
    }
    const releaseInput = deps.holdInput(terminal.ptyId)
    try {
      if (live) {
        if (!(await deps.stop(live.pid))) {
          return refused('stop_failed')
        }
        const shellBack = await this.waitFor(
          async () => (await deps.foreground(handle)) === 'shell',
          SHELL_WAIT_MS
        )
        if (!shellBack) {
          return refused('start_failed')
        }
        // The shell draws its prompt.
        await deps.sleep(POLL_MS)
      }
      if (!(await deps.type(handle, terminal.ptyId, resume.line))) {
        return refused('start_failed')
      }
      const started = await this.waitFor(async () => {
        const next = await deps.process(session.id)
        return next !== null && sameFolder(next.configDir, configDir)
      }, START_WAIT_MS)
      return started ? { outcome: 'moved' } : refused('start_failed')
    } finally {
      releaseInput()
    }
  }

  private async waitFor(check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
    const deadline = this.deps.now() + timeoutMs
    while (this.deps.now() < deadline) {
      if (await check()) {
        return true
      }
      await this.deps.sleep(POLL_MS / 2)
    }
    return check()
  }

  private poll(): void {
    if (this.polling || this.pending.size === 0) {
      return
    }
    this.polling = true
    void (async () => {
      // A turn must look ended twice in a row: a message queued for its end starts the next one.
      const ended = new Set<string>()
      while (this.pending.size > 0 && !this.disposed) {
        await this.deps.sleep(POLL_MS)
        for (const sessionId of this.pending) {
          await this.checkPending(sessionId, ended)
        }
      }
    })()
      .catch((error: unknown) => this.deps.log(`poll failed ${String(error)}`))
      .finally(() => {
        this.polling = false
      })
  }

  private async checkPending(sessionId: string, ended: Set<string>): Promise<void> {
    const pick = this.deps.picks.all()[sessionId]
    if (!pick?.pendingTerminal) {
      this.pending.delete(sessionId)
      return
    }
    const handle = pick.pendingTerminal
    const terminal = this.deps.terminal(handle)
    if (!terminal?.session) {
      // After a host restart its terminals reattach one by one; a closed one never comes back.
      const missing = (this.missing.get(sessionId) ?? 0) + 1
      this.missing.set(sessionId, missing)
      if (missing * POLL_MS > TERMINAL_GONE_MS) {
        this.settlePending(sessionId)
      }
      return
    }
    this.missing.delete(sessionId)
    if (terminal.session.id !== sessionId) {
      // The pane went on to another conversation: the move was about the one it left.
      this.settlePending(sessionId)
      return
    }
    if (await this.turnHolds(handle, terminal)) {
      ended.delete(sessionId)
      return
    }
    if (!ended.has(sessionId)) {
      ended.add(sessionId)
      return
    }
    ended.delete(sessionId)
    this.settlePending(sessionId)
    // Not awaited: a restart takes seconds, and the other waiting moves go on.
    void this.run(terminal.session, handle, pick.configDir)
  }

  private settlePending(sessionId: string): void {
    this.pending.delete(sessionId)
    this.missing.delete(sessionId)
    this.deps.picks.settle(sessionId)
  }
}

function refused(reason: ClaudeLoginMoveRefusal): ClaudeLoginMoveResult {
  return { outcome: 'refused', reason }
}
