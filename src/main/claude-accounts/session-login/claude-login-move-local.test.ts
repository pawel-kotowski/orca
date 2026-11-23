import { describe, expect, it } from 'vitest'
import { ClaudeLoginMover, type ClaudeLoginMoveDeps } from './claude-login-move'
import type { ClaudePickedLogin } from './claude-picked-logins'
import {
  holdTerminalInputForLoginMove,
  isTerminalInputPaused
} from '../../runtime/terminal/input/terminal-input-admission'

const ROBOTEC = '/home/p/.claude'
const PERSONAL = '/home/p/.claude-logins/personal'
const transcript = `${ROBOTEC}/projects/-repo/s1.jsonl`

function harness(
  start: {
    live?: string | null
    turnRunning?: boolean
    foreground?: 'claude' | 'shell' | 'other'
    session?: boolean
  } = {}
) {
  let now = 0
  const wakes: (() => void)[] = []
  const state = {
    live: start.live === undefined ? ROBOTEC : start.live,
    foreground: start.foreground ?? (start.live === null ? 'shell' : 'claude'),
    turnRunning: start.turnRunning ?? false,
    atLimit: false,
    readable: true,
    paneOfProcess: 'tab:leaf',
    starts: true,
    typed: [] as string[],
    stopped: 0,
    trusted: [] as string[],
    held: 0,
    typedWhileHeld: false,
    picks: {} as Record<string, ClaudePickedLogin>
  }
  const deps: ClaudeLoginMoveDeps = {
    logins: async () =>
      [ROBOTEC, PERSONAL].map((configDir) => ({
        configDir,
        accountId: null,
        email: configDir,
        organizationName: null
      })),
    terminal: (handle) =>
      handle === 'term_1'
        ? {
            ptyId: 'pty',
            paneKey: 'tab:leaf',
            session:
              start.session === false
                ? null
                : { id: 's1', transcriptPath: transcript, cwd: '/repo' },
            turnRunning: state.turnRunning,
            backgroundWork: false
          }
        : null,
    foreground: async () => state.foreground as never,
    waitsAtLimit: async () => state.atLimit,
    process: async (id) => (id === 's1' && state.live ? { pid: 7, configDir: state.live } : null),
    paneKeyOfProcess: async () => state.paneOfProcess,
    argv: async () => ['claude', '--model', 'opus'],
    stop: async () => {
      state.stopped += 1
      state.live = null
      state.foreground = 'shell'
      return true
    },
    conversation: async () => ({ exists: true, readable: state.readable }),
    trust: async (configDir, folder) => void state.trusted.push(`${configDir} ${folder}`),
    resumeLine: async (args) => ({
      line: `resume ${args.session.id} in ${args.configDir} ${args.argv?.join(' ') ?? ''}`.trim(),
      folder: '/repo'
    }),
    type: async (_handle, _pty, line) => {
      state.typed.push(line)
      state.typedWhileHeld = state.held === 1
      if (state.starts) {
        state.live = line.includes(PERSONAL) ? PERSONAL : ROBOTEC
        state.foreground = 'claude'
      }
      return true
    },
    holdInput: () => {
      state.held += 1
      return () => void (state.held -= 1)
    },
    picks: {
      all: () => state.picks,
      set: (id, pick) => void (state.picks = { ...state.picks, [id]: pick }),
      settle: (id) => {
        const { pendingTerminal: _pending, ...rest } = state.picks[id]!
        state.picks = { ...state.picks, [id]: rest }
      },
      restore: (id, previous) => {
        const { [id]: _dropped, ...rest } = state.picks
        state.picks = previous ? { ...rest, [id]: previous } : rest
      }
    },
    // The poll's sleep waits for a tick of the test; a restart's own sleeps pass at once.
    sleep: (ms) => {
      now += ms
      return ms === 1_000 && state.held === 0
        ? new Promise((resolve) => wakes.push(resolve))
        : Promise.resolve()
    },
    now: () => now,
    log: () => undefined
  }
  const mover = new ClaudeLoginMover(deps)
  const tick = async (times = 1): Promise<void> => {
    for (let i = 0; i < times; i += 1) {
      wakes.splice(0).forEach((wake) => wake())
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  const move = (configDir: string) =>
    mover.move({ terminal: 'term_1', configDir, transcriptPath: transcript })
  return { state, deps, mover, move, tick }
}

describe('moving a chat to another login of its host (local)', () => {
  it('restarts an idle Claude in its terminal, its folder trusted and other input held', async () => {
    const h = harness()
    expect(await h.move(PERSONAL)).toEqual({ outcome: 'moved' })
    expect(h.state).toMatchObject({
      stopped: 1,
      live: PERSONAL,
      typed: [`resume s1 in ${PERSONAL} claude --model opus`],
      trusted: [`${PERSONAL} /repo`],
      typedWhileHeld: true,
      held: 0
    })
    // Remembered for limit-move and for a host restart.
    expect(h.state.picks.s1).toMatchObject({ configDir: PERSONAL })
    expect(await h.move(ROBOTEC)).toEqual({ outcome: 'moved' })
    expect(h.state.picks.s1).toMatchObject({ configDir: ROBOTEC })
  })

  it('waits for the running turn, and for a message queued at its end', async () => {
    const h = harness({ turnRunning: true })
    expect(await h.move(PERSONAL)).toEqual({ outcome: 'queued' })
    expect(h.mover.movingTo('s1')).toBe(PERSONAL)
    await h.tick(3)
    expect(h.state.stopped).toBe(0)
    h.state.turnRunning = false
    await h.tick()
    h.state.turnRunning = true
    await h.tick(2)
    expect(h.state.stopped).toBe(0)
    h.state.turnRunning = false
    await h.tick(3)
    expect(h.state).toMatchObject({ stopped: 1, live: PERSONAL })
    expect(h.mover.movingTo('s1')).toBeNull()
  })

  it('picking the login it runs on calls a waiting move off', async () => {
    const h = harness({ turnRunning: true })
    await h.move(PERSONAL)
    expect(await h.move(ROBOTEC)).toEqual({ outcome: 'unchanged' })
    h.state.turnRunning = false
    await h.tick(4)
    expect(h.state.stopped).toBe(0)
    expect(h.mover.movingTo('s1')).toBeNull()
  })

  it('a waiting move survives a host restart', async () => {
    const h = harness({ turnRunning: true })
    await h.move(PERSONAL)
    h.mover.dispose()
    h.state.turnRunning = false
    const next = new ClaudeLoginMover(h.deps)
    next.resume()
    await h.tick(4)
    expect(h.state).toMatchObject({ stopped: 1, live: PERSONAL })
  })

  it('does not wait for a Claude that asks what to do at its usage limit', async () => {
    const h = harness({ turnRunning: true })
    h.state.atLimit = true
    expect(await h.move(PERSONAL)).toEqual({ outcome: 'moved' })
  })

  it('starts Claude in a pane that came back as a plain shell, with a stale working row', async () => {
    const h = harness({ live: null, turnRunning: true, session: false })
    expect(await h.move(PERSONAL)).toEqual({ outcome: 'moved' })
    expect(h.state).toMatchObject({
      stopped: 0,
      typed: [`resume s1 in ${PERSONAL}`],
      live: PERSONAL
    })
  })

  it('a Claude that ended starts with the flags of its last move', async () => {
    const h = harness()
    await h.move(PERSONAL)
    h.state.live = null
    h.state.foreground = 'shell'
    await h.move(ROBOTEC)
    expect(h.state.typed.at(-1)).toBe(`resume s1 in ${ROBOTEC} claude --model opus`)
  })

  it('stops nothing it cannot move', async () => {
    const other = harness()
    other.state.paneOfProcess = 'tab:other'
    expect(await other.move(PERSONAL)).toEqual({ outcome: 'refused', reason: 'running_elsewhere' })
    expect(other.state.picks).toEqual({})
    const shell = harness({ foreground: 'shell' })
    expect(await shell.move(PERSONAL)).toEqual({ outcome: 'refused', reason: 'running_elsewhere' })
    const vim = harness({ live: null, foreground: 'other' })
    expect(await vim.move(PERSONAL)).toEqual({ outcome: 'refused', reason: 'terminal_busy' })
    const apart = harness()
    apart.state.readable = false
    expect(await apart.move(PERSONAL)).toEqual({ outcome: 'refused', reason: 'not_shared' })
    expect(await apart.move('/home/p/.claude-logins/gone')).toEqual({
      outcome: 'refused',
      reason: 'unknown_login'
    })
    expect(
      await apart.mover.move({ terminal: 'term_x', configDir: PERSONAL, transcriptPath: null })
    ).toEqual({ outcome: 'refused', reason: 'not_local' })
    for (const h of [other, shell, vim, apart]) {
      expect(h.state).toMatchObject({ stopped: 0, typed: [], held: 0 })
    }
  })

  it('says when Claude did not come up, and lets input through again', async () => {
    const h = harness()
    h.state.starts = false
    expect(await h.move(PERSONAL)).toEqual({ outcome: 'refused', reason: 'start_failed' })
    expect(h.state.held).toBe(0)
  })

  it("holds everyone's input but the restart's own line", () => {
    const runtime = { getDriver: () => ({ kind: 'idle' }) as never }
    const release = holdTerminalInputForLoginMove('pty-held')
    for (const source of ['desktop', 'programmatic', 'mobile', 'legacy'] as const) {
      expect(isTerminalInputPaused(runtime, 'pty-held', source)).toBe(true)
    }
    expect(isTerminalInputPaused(runtime, 'pty-held', 'login-move')).toBe(false)
    expect(isTerminalInputPaused(runtime, 'pty-other', 'mobile')).toBe(false)
    release()
    expect(isTerminalInputPaused(runtime, 'pty-held', 'mobile')).toBe(false)
  })
})
