import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AgentHookServer } from './agent-hook-server'
import { buildBody, PANE, postHookEvent } from './testing/server.test-fixtures'
import { resolveAgentRowState } from '../../../shared/agent-status/presentation/agent-row-decay-state'
import type { probeAgentProcessPresence } from '../../../shared/agent-status/process/agent-process-presence-probe'
import SyncDatabase from '../../sqlite/sync-database'
import { lastStatusDatabasePath } from './last-status-store'
import { assemble } from './last-status-saved-rows'

vi.mock('../../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../telemetry/cohort-classifier', () => ({ getCohortAtEmit: () => ({}) }))
const probe = vi.hoisted(() => vi.fn<typeof probeAgentProcessPresence>(async () => 'live'))
vi.mock('../../../shared/agent-status/process/agent-process-presence-probe', () => ({
  probeAgentProcessPresence: probe
}))

const PROCESS = { pid: 4101, platform: 'darwin', startTime: 'birth-4101' }
const servers: AgentHookServer[] = []
const directories: string[] = []

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.stop()
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
  probe.mockReset().mockResolvedValue('live')
})

async function start(userDataPath: string): Promise<AgentHookServer> {
  const server = new AgentHookServer()
  servers.push(server)
  await server.start({ env: 'production', userDataPath })
  return server
}

async function claudeHook(server: AgentHookServer, payload: Record<string, unknown>) {
  const response = await postHookEvent(
    server,
    buildBody({ session_id: 'claude-lead', ...payload }, { agentProcess: JSON.stringify(PROCESS) })
  )
  expect(response.status).toBe(204)
}

/** What the activity card and the workspace card show for the pane. */
function shownState(server: AgentHookServer): string | undefined {
  const row = server.getStatusSnapshotForPane(PANE)[0]
  // The renderer's entry carries the row's receipt as updatedAt.
  return row
    ? resolveAgentRowState(
        {
          state: row.state,
          updatedAt: row.receivedAt,
          evidenceObservedAt: row.evidenceObservedAt,
          restoredUnconfirmed: row.restoredUnconfirmed
        },
        Date.now(),
        true
      )
    : undefined
}

/** Claude mid-turn inside one long foreground tool call: its last hook was PreToolUse. */
async function restartDuringLongToolCall(
  turn: Record<string, unknown>[]
): Promise<AgentHookServer> {
  const directory = mkdtempSync(join(tmpdir(), 'restored-working-lead-'))
  directories.push(directory)
  const first = await start(directory)
  for (const payload of turn) {
    await claudeHook(first, payload)
  }
  await claudeHook(first, {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_use_id: 'long-call',
    tool_input: { command: 'until grep -q done log; do sleep 5; done' }
  })
  expect(shownState(first)).toBe('working')
  first.flushStatusPersistSync()
  first.stop()
  moveSavedRowsToLegacyFile(join(directory, 'agent-hooks', 'last-status.json'))
  return start(directory)
}

/**
 * Hand the saved rows to the next start as the older build's JSON file, which startup imports.
 * Why: under the Bun test runtime the read-only reopen of the WAL database fails with
 * SQLITE_CANTOPEN here (it fails the existing restart tests the same way); Electron is unaffected.
 */
function moveSavedRowsToLegacyFile(lastStatusPath: string): void {
  const databasePath = lastStatusDatabasePath(lastStatusPath)
  const db = new SyncDatabase(databasePath)
  let rows: { key: string; json: string }[]
  try {
    rows = db
      .prepare('SELECT key, value FROM rows ORDER BY seq')
      .all()
      .map((row) => ({ key: String(row.key), json: String(row.value) }))
  } finally {
    db.close()
  }
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${databasePath}${suffix}`, { force: true })
  }
  writeFileSync(lastStatusPath, JSON.stringify(assemble(rows)))
}

// Paweł, 2026-11-16 (Orca restarted at 17:47:50 by an install; his agent had sat in one foreground
// Bash call since 17:43): "why i dont see you in activity cards in working, you are running a script".
describe('an Orca restart while the lead is mid-turn', () => {
  it.each([
    ['a turn the user started', [{ hook_event_name: 'UserPromptSubmit', prompt: 'do the work' }]],
    [
      "a turn a background task's notification started",
      [
        { hook_event_name: 'UserPromptSubmit', prompt: 'start it' },
        {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'sleep 90', run_in_background: true },
          tool_response: { backgroundTaskId: 'bg-1' }
        },
        {
          hook_event_name: 'Stop',
          background_tasks: [{ id: 'bg-1', type: 'shell', status: 'running' }]
        },
        { hook_event_name: 'Stop', background_tasks: [] },
        {
          hook_event_name: 'UserPromptSubmit',
          prompt: '<task-notification><task-id>bg-1</task-id><status>completed</status>'
        }
      ]
    ]
  ])('keeps %s working while its process lives', async (_label, turn) => {
    const restarted = await restartDuringLongToolCall(turn)
    // What the cards showed until the next hook: a restored claim never counts as live.
    expect(restarted.getStatusSnapshotForPane(PANE)[0]).toMatchObject({
      state: 'working',
      restoredUnconfirmed: true
    })
    expect(shownState(restarted)).toBe('idle')

    expect(await restarted.confirmRestoredWorkingStatuses()).toEqual([PANE])
    expect(restarted.getStatusSnapshotForPane(PANE)[0]).toMatchObject({
      state: 'working',
      mainAgent: { state: 'working' }
    })
    expect(shownState(restarted)).toBe('working')

    // Its Stop still ends the turn.
    await claudeHook(restarted, { hook_event_name: 'Stop', background_tasks: [] })
    expect(shownState(restarted)).toBe('done')
  })

  it('leaves the restored claim unconfirmed when the agent process is gone', async () => {
    const restarted = await restartDuringLongToolCall([
      { hook_event_name: 'UserPromptSubmit', prompt: 'do the work' }
    ])
    probe.mockResolvedValue('exited')

    expect(await restarted.confirmRestoredWorkingStatuses()).toEqual([])
    expect(shownState(restarted)).not.toBe('working')
  })
})
