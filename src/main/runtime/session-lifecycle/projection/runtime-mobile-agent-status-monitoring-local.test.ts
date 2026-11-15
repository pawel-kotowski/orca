// A Claude agent whose turn ended while its own background shell runs is `working` + `monitoring`
// on its host. What the host publishes for that terminal (paired clients mirror it) must say so too.
// Paweł, 2026-11-16: an agent on the devbox waiting on a 13-day simulation run was missing from
// Working; `orca worktree ps` said monitoring while the published terminal status said done.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'
import type { AgentStatusIpcPayload } from '../../../../shared/agent-status/contracts/agent-status-ipc-payload'
import { makePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'

vi.mock('electron', () => ({
  BrowserWindow: { fromId: vi.fn(() => null) },
  webContents: { fromId: vi.fn(() => null) },
  ipcMain: { on: vi.fn(), removeListener: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp') }
}))

const LEAF_ID = '22222222-2222-4222-8222-222222222222'
const TAB_ID = 'monitoring-tab'
const WORKTREE_ID = 'wt-monitoring'
const PANE_KEY = makePaneKey(TAB_ID, LEAF_ID)
const PTY_ID = 'pty-monitoring'
const T0 = 1_700_000_000_000
const MINUTE = 60_000
const PROVIDER_SESSION = {
  key: 'session_id' as const,
  id: 'ba8d68c6-c189-4fbf-926c-a6226a69d39e',
  transcriptPath: '/transcripts/ba8d68c6.jsonl'
}
// Claude's idle title: the lead is done, which is true; only the hooks know the shell still runs.
const CLAUDE_IDLE_TITLE = '\x1b]0;✳ Land agent PR stack\x07'

function monitoringStopRow(receivedAt: number): AgentStatusIpcPayload {
  return {
    paneKey: PANE_KEY,
    state: 'working',
    workingMode: 'monitoring',
    mainAgent: { state: 'done', stateStartedAt: receivedAt },
    prompt: 'run s10 on the final stack',
    agentType: 'claude',
    connectionId: null,
    receivedAt,
    stateStartedAt: T0 - 90 * MINUTE,
    tabId: TAB_ID,
    worktreeId: WORKTREE_ID,
    providerSession: PROVIDER_SESSION
  }
}

async function createRuntime(rows: AgentStatusIpcPayload[]): Promise<OrcaRuntimeService> {
  const runtime = new OrcaRuntimeService(null, undefined, {
    getAgentStatusSnapshot: () => rows
  })
  const internals = runtime as unknown as {
    resolveTerminalWorkspaceLaunchScope: (selector: string) => Promise<unknown>
  }
  vi.spyOn(internals, 'resolveTerminalWorkspaceLaunchScope').mockResolvedValue({
    id: WORKTREE_ID,
    path: '/repo/app',
    connectionId: null,
    repo: null,
    folderWorkspace: null
  })
  runtime.setPtyController({
    spawn: vi.fn().mockResolvedValue({ id: PTY_ID }),
    write: () => true,
    kill: () => true,
    getForegroundProcess: async () => null
  })
  await runtime.createTerminal(`id:${WORKTREE_ID}`, {
    tabId: TAB_ID,
    leafId: LEAF_ID,
    launchAgent: 'claude',
    title: 'Terminal'
  })
  return runtime
}

async function publishedStatus(
  runtime: OrcaRuntimeService
): Promise<Record<string, unknown> | undefined> {
  const result = await runtime.listMobileSessionTabs(`id:${WORKTREE_ID}`)
  const tab = result.tabs[0]
  return tab?.type === 'terminal'
    ? (tab.agentStatus as unknown as Record<string, unknown> | undefined)
    : undefined
}

describe('mobile session tabs: an agent held open by its own background work', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays monitoring under the idle title Claude paints just after its Stop hook', async () => {
    const runtime = await createRuntime([monitoringStopRow(T0)])
    vi.setSystemTime(T0 + 1_500)
    runtime.onPtyData(PTY_ID, CLAUDE_IDLE_TITLE, T0 + 1_500)

    vi.setSystemTime(T0 + 2_000)
    expect(await publishedStatus(runtime)).toEqual(
      expect.objectContaining({ state: 'working', workingMode: 'monitoring' })
    )
  })

  it('stays monitoring after half an hour without a hook', async () => {
    const runtime = await createRuntime([monitoringStopRow(T0)])
    vi.setSystemTime(T0 + 1_500)
    runtime.onPtyData(PTY_ID, CLAUDE_IDLE_TITLE, T0 + 1_500)

    vi.setSystemTime(T0 + 40 * MINUTE)
    expect(await publishedStatus(runtime)).toEqual(
      expect.objectContaining({ state: 'working', workingMode: 'monitoring' })
    )
  })

  it('ends with the monitoring window', async () => {
    const runtime = await createRuntime([monitoringStopRow(T0)])
    vi.setSystemTime(T0 + 1_500)
    runtime.onPtyData(PTY_ID, CLAUDE_IDLE_TITLE, T0 + 1_500)

    vi.setSystemTime(T0 + 25 * 60 * MINUTE)
    expect(await publishedStatus(runtime)).not.toEqual(
      expect.objectContaining({ state: 'working' })
    )
  })

  it('ends when the agent exits to its shell', async () => {
    const runtime = await createRuntime([monitoringStopRow(T0)])
    vi.setSystemTime(T0 + 5 * MINUTE)
    runtime.onPtyData(PTY_ID, '\x1b]0;zsh\x07', T0 + 5 * MINUTE)

    vi.setSystemTime(T0 + 6 * MINUTE)
    expect(await publishedStatus(runtime)).not.toEqual(
      expect.objectContaining({ state: 'working' })
    )
  })
})
