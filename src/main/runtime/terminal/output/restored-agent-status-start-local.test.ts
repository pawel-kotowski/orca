import { afterEach, describe, expect, it, vi } from 'vitest'
import { settledWriteStub } from '../../../providers/settled-pty-write-stub'
import { seedTerminalRestoreRecordsFromSpawnResult } from '../../../ipc/pty/pane/agent-session-owners'
import { agentHookServer } from '../../../agent-hooks/server/agent-hook-server'
import '../../orca-runtime-tests/runtime-test-module-registration.spec'
import { OrcaRuntimeService } from '../../orca-runtime'
import {
  bindSinglePtyRun,
  setInMemoryOrchestrationMessages,
  store,
  syncSinglePty
} from '../../orca-runtime-tests/orca-runtime-test-fixtures.spec'
import { InMemoryOrchestrationMessages } from '../../orchestration/mailbox/terminal-pointer/in-memory-orchestration-messages.spec'

// Local (glass build): kept in the CI-discovered .test.ts lane after upstream removed
// orchestration-reattach-wake.test.ts (#39580).

type RestoredReport = Awaited<ReturnType<typeof agentHookServer.readRestoredAgentStatus>>

async function reattachQuietCoordinator(report: RestoredReport): Promise<OrcaRuntimeService> {
  const runtime = new OrcaRuntimeService(store)
  vi.spyOn(agentHookServer, 'readRestoredAgentStatus').mockResolvedValue(report)
  const db = new InMemoryOrchestrationMessages()
  const write = vi.fn().mockReturnValue(true)
  setInMemoryOrchestrationMessages(runtime, db)
  runtime.setPtyController({
    write,
    writeWithSettlement: settledWriteStub(write),
    kill: vi.fn(),
    getForegroundProcess: async () => 'codex'
  })
  syncSinglePty(runtime)
  const [terminal] = (await runtime.listTerminals()).terminals
  bindSinglePtyRun(db, terminal.handle)
  // The restarted runtime has seen no status from the surviving session.
  seedTerminalRestoreRecordsFromSpawnResult(runtime, { id: 'pty-1', isReattach: true })
  await vi.advanceTimersByTimeAsync(5_000)
  db.close()
  return runtime
}

function restoredStatusStartedAt(runtime: OrcaRuntimeService): number | null | undefined {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test reads the runtime's PTY record directly.
  const records = (
    runtime as unknown as {
      ptysById: Map<string, { lastAgentStatusStartedAtEpochMs: number | null }>
    }
  ).ptysById
  return records.get('pty-1')?.lastAgentStatusStartedAtEpochMs
}

describe('restored agent status start time', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Why: dating the restored turn at the restart made clients treat an old finished turn as
  // news, so cards cleared from the Inbox came back after every restart (2026-11-10).
  it('dates a restored report at its own start, not at the restart', async () => {
    vi.useFakeTimers()
    const mainStartedAt = Date.now() - 3_600_000
    const runtime = await reattachQuietCoordinator({
      state: 'done',
      stateStartedAt: mainStartedAt - 60_000,
      mainAgent: { state: 'done', stateStartedAt: mainStartedAt }
    })
    expect(restoredStatusStartedAt(runtime)).toBe(mainStartedAt)
  })

  it('dates a restored permission wait at the row start', async () => {
    vi.useFakeTimers()
    const startedAt = Date.now() - 600_000
    const runtime = await reattachQuietCoordinator({
      state: 'waiting',
      stateStartedAt: startedAt,
      mainAgent: { state: 'working', stateStartedAt: startedAt - 1_000 }
    })
    expect(restoredStatusStartedAt(runtime)).toBe(startedAt)
  })
})
