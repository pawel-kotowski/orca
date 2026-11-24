import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  path: '',
  daemon: vi.fn<() => Promise<string[] | null>>(),
  processes: vi.fn(),
  host: null as unknown
}))
vi.mock('../../../../shared/app-lifecycle/app-environment', async (original) => ({
  ...(await original<object>()),
  getAppEnvironment: () => ({ getPath: () => mocks.path })
}))
vi.mock('../../../daemon/providers/lifecycle/daemon-provider-state', async (original) => ({
  ...(await original<object>()),
  listLiveDaemonPtyIds: mocks.daemon
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
  admitStructuredChatTerminalSpawn,
  beginStructuredChatTerminalHold,
  bindStructuredChatTerminal,
  heldStructuredChats,
  resetStructuredChatTerminalHoldsForTests,
  settleStructuredChatTerminalSpawn,
  structuredChatTerminalHold
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
      ensureStructuredAgentSessionHost: async () => {},
      redriveStructuredSessionMail: (id: string) => woken.push(`mail ${id}`)
    }
  )
  mocks.host = {
    deps: {
      store: { getConversation: () => RECORD, isSessionUnreadable: () => false }
    },
    wakeReturnedSession: async (id: string) => void woken.push(`chat ${id}`)
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
const processesAre = (shellAlone: boolean, runsConversation: boolean) =>
  mocks.processes.mockResolvedValue({ shellAlone, runsConversation })

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
  admitStructuredChatTerminalSpawn(token, { ptyId: 'pty', paneKey: 'tab:leaf' })
  bindStructuredChatTerminal(token, { ptyId: 'pty', incarnationId: 'i', paneKey: 'tab:leaf' })
  settleStructuredChatTerminalSpawn(token)
}

beforeEach(() => {
  mocks.path = mkdtempSync(join(tmpdir(), 'terminal-holds-'))
  mocks.daemon.mockReset().mockResolvedValue([])
  mocks.processes.mockReset()
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
    mocks.daemon.mockResolvedValue(['another'])
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
  state.ptys.set('pty', { commandPaint: { ranCommand: false } })
  await check(host)
  expect(heldStructuredChats()).toEqual(['chat'])
  state.ptys.set('pty', { commandPaint: { ranCommand: true } })
  await check(host)
  expect(heldStructuredChats()).toEqual([])
})

it('holds while its terminal is being spawned, though no list has it yet', async () => {
  const { host } = runtime()
  begin()
  admitStructuredChatTerminalSpawn('a', { ptyId: 'pty', paneKey: 'tab:leaf' })
  await check(host)
  expect(heldStructuredChats()).toEqual(['chat'])
  // The spawn failed after all, and every daemon says there is no such terminal.
  settleStructuredChatTerminalSpawn('a')
  await check(host)
  expect(heldStructuredChats()).toEqual([])
})

it('a stand-in shell under the same pty id is not the terminal', async () => {
  const { host, state } = runtime()
  open()
  state.listed = [{ ...RUNNING, incarnationId: 'other' }]
  processesAre(true, true)
  mocks.daemon.mockResolvedValue(['pty'])
  await check(host)
  expect(heldStructuredChats()).toEqual(['chat'])
})

it('a key pressed while its processes were read keeps the hold', async () => {
  const { host, state } = runtime()
  open()
  state.listed = [RUNNING]
  processesAre(true, false)
  mocks.processes.mockImplementation(async () => {
    state.inputAt += 1
    return { shellAlone: true, runsConversation: true }
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
  mocks.processes.mockImplementation(async () => {
    begin('b')
    return { shellAlone: true, runsConversation: true }
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
