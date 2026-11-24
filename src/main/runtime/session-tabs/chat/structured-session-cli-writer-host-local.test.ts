import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  path: '',
  daemon:
    vi.fn<
      () => Promise<{ sessionId: string; incarnationId?: string; isAlive: boolean }[] | null>
    >(),
  installed: true,
  processes: vi.fn(),
  host: null as unknown
}))
vi.mock('../../../../shared/app-lifecycle/app-environment', async (original) => ({
  ...(await original<object>()),
  getAppEnvironment: () => ({ getPath: () => mocks.path })
}))
vi.mock('../../../daemon/providers/lifecycle/daemon-provider-state', async (original) => ({
  ...(await original<object>()),
  getDaemonProvider: () => (mocks.installed ? {} : null),
  listLiveDaemonSessions: mocks.daemon
}))
vi.mock('../../agent-session/ownership/structured-chat-terminal-process', () => ({
  readTerminalProcesses: mocks.processes
}))
vi.mock(
  '../../../native-chat/agent-session-wire/host/structured-agent-session-registry',
  async (original) => ({
    ...(await original<object>()),
    getStructuredAgentSessionHost: () => mocks.host
  })
)

import {
  beginStructuredChatTerminalHold,
  claimStructuredChatTerminalSpawn,
  heldStructuredChats,
  keepStructuredChatHold,
  resetStructuredChatTerminalHoldsForTests,
  structuredChatTerminalHold,
  structuredChatTerminalHoldsUnreadable
} from '../../agent-session/ownership/structured-chat-terminal-holds'
import { OrcaRuntimeWithStructuredSessionCliWriterHost } from './structured-session-cli-writer-host'

const RECORD = {
  sessionId: 'chat',
  provider: 'codex',
  location: { workspaceId: 'w', executionHostId: 'local', kind: 'worktree' },
  providerHandleChain: [
    {
      state: 'bound',
      handle: {
        provider: 'codex',
        kind: 'codex',
        threadId: 'conversation',
        nativeId: 'conversation'
      },
      sequence: 1
    }
  ]
} as never

type Row = { paneKey: string; agentType: string; providerSession: { key: string; id: string } }

function runtime() {
  const woken: string[] = []
  const state = {
    rows: [] as Row[],
    presence: undefined as string | undefined,
    listed: [] as object[] | null,
    ptys: new Map<string, object>(),
    verdicts: new Map<string, object>(),
    paneOf: new Map<string, object>(),
    inputAt: 0
  }
  const host = Object.assign(
    Object.create(OrcaRuntimeWithStructuredSessionCliWriterHost.prototype),
    {
      terminalHoldWatch: null,
      resuming: new Set(),
      ptysById: state.ptys,
      ptyLivenessVerdictByPtyId: state.verdicts,
      ptyController: {
        listProcesses: async () => {
          if (!state.listed) {
            throw new Error('no daemon')
          }
          return state.listed
        }
      },
      terminalRunFacts: { readLastInputAt: () => state.inputAt },
      getAgentProviderSessionRows: () => state.rows,
      getPtyRecordForPaneKey: (key: string) => state.paneOf.get(key) ?? null,
      readHookCliWriterObservationFn: () =>
        state.presence === undefined
          ? null
          : { presence: async () => state.presence, current: () => true, topology: 'pane-owned' },
      createTerminalIdentityReadContext: () => ({}),
      cleanupSubscription: () => {},
      ensureStructuredAgentSessionHost: async () => {},
      redriveStructuredSessionMail: (id: string) => woken.push(`mail ${id}`)
    }
  )
  mocks.host = {
    deps: {
      store: { getConversation: () => RECORD, isSessionUnreadable: () => false }
    },
    wakeReturnedSession: async (id: string) => {
      woken.push(`chat ${id}`)
      return 'done'
    }
  }
  return { host, state, woken }
}

const ROW: Row = {
  paneKey: 'tab:leaf',
  agentType: 'codex',
  providerSession: { key: 'session_id', id: 'conversation' }
}
const RUNNING = { id: 'pty', incarnationId: 'i', rootProcessId: 10 }
const check = (host: { releaseFinishedTerminalHolds(): Promise<void> }) =>
  host.releaseFinishedTerminalHolds()
function processesAre(
  shellAlone: boolean,
  runsConversation: boolean,
  runsAnywhere: boolean | null = runsConversation
): void {
  mocks.processes.mockResolvedValue({
    shellAlone: async () => shellAlone,
    runsBelow: () => runsConversation,
    runsAnywhere: () => runsAnywhere,
    runsAgentBelow: () => runsConversation
  })
}

function begin(token = 'a'): void {
  beginStructuredChatTerminalHold('chat', {
    token,
    id: `id-${token}`,
    agent: 'codex',
    conversationId: 'conversation'
  })
}
function open(token = 'a'): void {
  begin(token)
  const claim = claimStructuredChatTerminalSpawn(token, () => false)!
  claim.admit({ ptyId: 'pty', paneKey: 'tab:leaf' })
  claim.bind({ ptyId: 'pty', incarnationId: 'i', paneKey: 'tab:leaf' })
  claim.settle(false)
}

beforeEach(() => {
  mocks.path = mkdtempSync(join(tmpdir(), 'terminal-holds-'))
  mocks.daemon.mockReset().mockResolvedValue([])
  mocks.processes.mockReset()
  mocks.installed = true
  processesAre(false, false)
  resetStructuredChatTerminalHoldsForTests()
})
afterEach(() => rmSync(mocks.path, { recursive: true, force: true }))

it('H1: Ctrl-Z, a slow probe or a dropped row never frees a terminal that runs something', async () => {
  const { host, state } = runtime()
  open()
  state.listed = [RUNNING]
  processesAre(false, true)
  for (const presence of ['live', 'unverifiable', undefined]) {
    state.presence = presence
    state.rows = presence === undefined ? [] : [ROW]
    await check(host)
    expect(heldStructuredChats()).toEqual(['chat'])
  }
  // The agent quit: its shell is alone.
  processesAre(true, false)
  await check(host)
  expect(heldStructuredChats()).toEqual([])
})

it('H2: a hold ends after a restart with nobody looking, and wakes what waited', async () => {
  open()
  resetStructuredChatTerminalHoldsForTests()
  const { host, state, woken } = runtime()
  vi.useFakeTimers()
  try {
    host.startStructuredChatTerminalHolds()
    // The daemon is not adopted yet: unknown is not gone.
    state.listed = []
    mocks.daemon.mockResolvedValue(null)
    await vi.advanceTimersByTimeAsync(6_000)
    expect(heldStructuredChats()).toEqual(['chat'])
    mocks.daemon.mockResolvedValue([{ sessionId: 'another', isAlive: true }])
    await vi.advanceTimersByTimeAsync(3_000)
    expect(heldStructuredChats()).toEqual([])
    expect(woken).toEqual(['chat chat', 'mail chat'])
  } finally {
    vi.useRealTimers()
  }
})

it('H3: a terminal closed before it was ever seen is gone', async () => {
  const { host, state } = runtime()
  open()
  state.verdicts.set('pty', { verdict: { status: 'exited', incarnationId: 'i' } })
  mocks.daemon.mockResolvedValue(null)
  await check(host)
  expect(heldStructuredChats()).toEqual([])
})

it('H3: an agent that never reported is seen among its terminal processes', async () => {
  const { host, state } = runtime()
  open()
  state.listed = [RUNNING]
  // The shell is at its first prompt, whose finished-command mark retires the launch already.
  state.ptys.set('pty', { launchEvidence: { kind: 'gone' } })
  processesAre(true, false)
  await check(host)
  expect(heldStructuredChats()).toEqual(['chat'])
  processesAre(false, true)
  await check(host)
  expect(heldStructuredChats()).toEqual(['chat'])
  processesAre(true, false)
  await check(host)
  expect(heldStructuredChats()).toEqual([])
})

it('H3: a launch command that came and went unseen is over, by the shell that ran it', async () => {
  const { host, state } = runtime()
  open()
  state.listed = [RUNNING]
  processesAre(true, false)
  const pty = (ranCommand: boolean, tail: string) =>
    state.ptys.set('pty', { commandPaint: { ranCommand }, tailBuffer: [tail], tailPartialLine: '' })
  pty(false, '$ codex resume conversation')
  await check(host)
  // Some other command, before the launch was typed.
  pty(true, '$ ls')
  await check(host)
  expect(heldStructuredChats()).toEqual(['chat'])
  pty(true, '$ codex resume conver\r\nsation: command not found')
  await check(host)
  expect(heldStructuredChats()).toEqual([])
})

it('holds while its terminal is being spawned, though no list has it yet', async () => {
  const { host } = runtime()
  begin()
  const claim = claimStructuredChatTerminalSpawn('a', () => false)!
  claim.admit({ ptyId: 'pty', paneKey: 'tab:leaf' })
  await check(host)
  expect(heldStructuredChats()).toEqual(['chat'])
  // The spawn failed after all, and every daemon says there is no such terminal.
  claim.settle(true)
  await check(host)
  expect(heldStructuredChats()).toEqual([])
})

it('holds between the stop and the start of a restart, also in the same shell', async () => {
  const { host, state } = runtime()
  open()
  const release = keepStructuredChatHold('conversation')
  state.verdicts.set('pty', { verdict: { status: 'exited', incarnationId: 'i' } })
  await check(host)
  expect(heldStructuredChats()).toEqual(['chat'])
  release()
  await check(host)
  expect(heldStructuredChats()).toEqual([])
})

it('a cold-restored shell under the same id is not the terminal that is gone', async () => {
  const { host, state } = runtime()
  open()
  state.listed = [{ ...RUNNING, incarnationId: 'fresh' }]
  mocks.daemon.mockResolvedValue([{ sessionId: 'pty', incarnationId: 'fresh', isAlive: true }])
  await check(host)
  expect(heldStructuredChats()).toEqual([])
})

it('an agent elsewhere on the machine (a detached tmux) keeps the hold', async () => {
  const { host } = runtime()
  open()
  processesAre(false, false, true)
  await check(host)
  expect(heldStructuredChats()).toEqual(['chat'])
  processesAre(false, false, null)
  await check(host)
  expect(heldStructuredChats()).toEqual(['chat'])
})

it('an older terminal whose agent moved on to another conversation does not keep the hold', async () => {
  const { host, state } = runtime()
  open()
  state.listed = [{ id: 'older', incarnationId: 'o', rootProcessId: 77 }]
  state.paneOf.set('older:leaf', { ptyId: 'older', incarnationId: 'o', connected: true })
  // Started on the conversation, then `/clear`ed: its command line still names it.
  const runsAnywhere = vi.fn((_of: object, except: number[]) => !except.includes(77))
  mocks.processes.mockResolvedValue({
    shellAlone: async () => false,
    runsBelow: () => true,
    runsAnywhere,
    runsAgentBelow: () => true
  })
  state.rows = [{ ...ROW, paneKey: 'older:leaf' }]
  await check(host)
  expect(heldStructuredChats()).toEqual(['chat'])
  state.rows = [
    { ...ROW, paneKey: 'older:leaf', providerSession: { key: 'session_id', id: 'another' } }
  ]
  // The row of an agent that ended there says nothing of the one there now.
  await check(host)
  expect(heldStructuredChats()).toEqual(['chat'])
  state.presence = 'live'
  await check(host)
  expect(heldStructuredChats()).toEqual([])
})

it('without a daemon, its own list proves the end of a terminal this Orca asked for', async () => {
  const { host } = runtime()
  mocks.installed = false
  open()
  await check(host)
  expect(heldStructuredChats()).toEqual([])
  open('b')
  resetStructuredChatTerminalHoldsForTests()
  await check(host)
  expect(heldStructuredChats()).toEqual(['chat'])
})

it('one check that fails does not starve the others', async () => {
  const { host, state } = runtime()
  beginStructuredChatTerminalHold('first', {
    token: 'f',
    id: 'f',
    agent: 'codex',
    conversationId: 'other'
  })
  open()
  state.verdicts.set('pty', { verdict: { status: 'exited', incarnationId: 'i' } })
  mocks.host = {
    deps: {
      store: {
        getConversation: (id: string) => {
          if (id === 'first') {
            throw new Error('unreadable')
          }
          return RECORD
        },
        isSessionUnreadable: () => false
      }
    },
    wakeReturnedSession: async () => 'done'
  }
  await check(host)
  expect(heldStructuredChats()).toEqual(['first'])
})

it('a stand-in shell under the same pty id is not the terminal', async () => {
  const { host, state } = runtime()
  open()
  state.listed = [{ ...RUNNING, incarnationId: 'other' }]
  processesAre(true, true)
  mocks.daemon.mockResolvedValue([{ sessionId: 'pty', incarnationId: 'i', isAlive: true }])
  await check(host)
  expect(heldStructuredChats()).toEqual(['chat'])
})

it('a key pressed while its processes were read keeps the hold', async () => {
  const { host, state } = runtime()
  open()
  state.listed = [RUNNING]
  processesAre(true, true, false)
  const table = await mocks.processes()
  mocks.processes.mockImplementation(async () => {
    state.inputAt += 1
    return table
  })
  await check(host)
  expect(heldStructuredChats()).toEqual(['chat'])
})

it('L1: drops the hold of a deleted chat', async () => {
  const { host } = runtime()
  begin()
  mocks.host = {
    deps: { store: { getConversation: () => null, isSessionUnreadable: () => false } }
  }
  await check(host)
  expect(heldStructuredChats()).toEqual([])
})

it('M2: taking back one handover never ends a newer one', async () => {
  const { host, state } = runtime()
  open()
  expect(await host.takeBackStructuredChat(RECORD, 'an older one')).toBe(true)
  expect(structuredChatTerminalHold('chat')?.token).toBe('a')
  // It ended, and another began, while the press was looking at it.
  state.listed = [RUNNING]
  processesAre(true, true, false)
  const table = await mocks.processes()
  mocks.processes.mockImplementation(async () => {
    begin('b')
    return table
  })
  expect(await host.takeBackStructuredChat(RECORD, 'id-a')).toBe(false)
  expect(structuredChatTerminalHold('chat')?.token).toBe('b')
})

it('M4: taking back waits while a restart has not shown its terminal yet', async () => {
  const { host, state } = runtime()
  open()
  mocks.daemon.mockResolvedValue(null)
  expect(await host.takeBackStructuredChat(RECORD)).toBe(false)
  state.listed = null
  expect(await host.takeBackStructuredChat(RECORD)).toBe(false)
  mocks.daemon.mockResolvedValue([])
  state.listed = []
  expect(await host.takeBackStructuredChat(RECORD)).toBe(true)
})

it('M5: a chat that is not held starts as before, beside a pane that runs something else', async () => {
  const { host, state } = runtime()
  state.rows = [ROW]
  state.listed = [RUNNING]
  state.paneOf.set('tab:leaf', { ptyId: 'pty', incarnationId: 'i', connected: true })
  processesAre(false, false)
  await expect(host.assertStructuredChatAcquireAdmissible(RECORD)).resolves.toBeUndefined()
  // Handing it over is refused, as that pane may run the conversation.
  expect(await host.structuredChatRunsInTerminal(RECORD)).toBe(true)
  open()
  await expect(host.assertStructuredChatAcquireAdmissible(RECORD)).rejects.toThrow()
})

function lostHolds(): void {
  writeFileSync(join(mocks.path, 'structured-chat-terminal-holds.json'), '{"chat":{"tok')
}

it('after holds were lost, a chat starts beside a busy terminal no agent runs in', async () => {
  lostHolds()
  const { host, state } = runtime()
  state.rows = [ROW]
  // Another terminal's agent always runs, so the lost holds are never all proven over.
  state.listed = [RUNNING, { id: 'server', incarnationId: 's', rootProcessId: 20 }]
  mocks.daemon.mockResolvedValue([
    { sessionId: 'pty', isAlive: true },
    { sessionId: 'server', isAlive: true }
  ])
  state.paneOf.set('tab:leaf', { ptyId: 'pty', incarnationId: 'i', connected: true })
  const agents = new Set([10, 20])
  let anywhere = false
  mocks.processes.mockResolvedValue({
    shellAlone: async () => false,
    runsBelow: () => false,
    runsAnywhere: () => anywhere,
    runsAgentBelow: (root: number) => agents.has(root)
  })
  await expect(host.assertStructuredChatAcquireAdmissible(RECORD)).rejects.toThrow()
  // A dev server has that terminal now.
  agents.delete(10)
  await expect(host.assertStructuredChatAcquireAdmissible(RECORD)).resolves.toBeUndefined()
  expect(structuredChatTerminalHoldsUnreadable()).toBe(true)
  // A detached tmux still runs the conversation.
  anywhere = true
  await expect(host.assertStructuredChatAcquireAdmissible(RECORD)).rejects.toThrow()
  anywhere = false
  // Every terminal is free of agents: none of the lost holds is needed any more.
  agents.delete(20)
  await expect(host.assertStructuredChatAcquireAdmissible(RECORD)).resolves.toBeUndefined()
  expect(structuredChatTerminalHoldsUnreadable()).toBe(false)
})

it('after holds were lost, a row of a terminal that cannot be read is judged by the processes', async () => {
  lostHolds()
  mocks.installed = false
  const { host, state } = runtime()
  state.rows = [ROW]
  state.listed = [{ id: 'server', incarnationId: 's', rootProcessId: 20 }]
  const processes = (runsAnywhere: boolean | null) =>
    mocks.processes.mockResolvedValue({
      shellAlone: async () => false,
      runsBelow: () => false,
      runsAnywhere: () => runsAnywhere,
      runsAgentBelow: () => true
    })
  processes(null)
  await expect(host.assertStructuredChatAcquireAdmissible(RECORD)).rejects.toThrow()
  processes(false)
  await expect(host.assertStructuredChatAcquireAdmissible(RECORD)).resolves.toBeUndefined()
})

it('lost holds alone keep no watch on the terminals', async () => {
  lostHolds()
  const { host } = runtime()
  vi.useFakeTimers()
  try {
    host.startStructuredChatTerminalHolds()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(mocks.processes).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    vi.useRealTimers()
  }
})

it("a leftover row found by its pane, with no PTY record yet, is its terminal's", async () => {
  lostHolds()
  const { host, state } = runtime()
  state.rows = [ROW]
  state.listed = [
    { ...RUNNING, paneKey: 'tab:leaf' },
    { id: 'server', incarnationId: 's', rootProcessId: 20 }
  ]
  mocks.processes.mockResolvedValue({
    shellAlone: async () => false,
    runsBelow: () => false,
    runsAnywhere: () => false,
    runsAgentBelow: (root: number) => root === 20
  })
  await expect(host.assertStructuredChatAcquireAdmissible(RECORD)).resolves.toBeUndefined()
})

it('an agent on the conversation is seen without any row while holds are lost or unread', async () => {
  lostHolds()
  const { host, state } = runtime()
  state.listed = [RUNNING]
  processesAre(false, true, true)
  await expect(host.assertStructuredChatAcquireAdmissible(RECORD)).rejects.toThrow()
})

it('a hold that is read again during the look is judged as the hold it is', async () => {
  open()
  resetStructuredChatTerminalHoldsForTests()
  const { host, state } = runtime()
  state.listed = [RUNNING]
  const file = join(mocks.path, 'structured-chat-terminal-holds.json')
  renameSync(file, `${file}.kept`)
  mkdirSync(file)
  // Unread for now, and whether the agent runs is not known.
  processesAre(false, false, null)
  await expect(host.assertStructuredChatAcquireAdmissible(RECORD)).rejects.toThrow()
  mocks.processes.mockImplementation(async () => {
    rmSync(file, { recursive: true, force: true })
    renameSync(`${file}.kept`, file)
    mocks.processes.mockReset()
    processesAre(false, false, false)
    return {
      shellAlone: async () => false,
      runsBelow: () => false,
      runsAnywhere: () => false,
      runsAgentBelow: () => false
    }
  })
  await expect(host.assertStructuredChatAcquireAdmissible(RECORD)).rejects.toThrow()
  expect(heldStructuredChats()).toEqual(['chat'])
})
