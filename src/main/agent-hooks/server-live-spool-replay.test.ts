import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentHookServer } from './server'
import { buildBody, PANE, postHookEvent } from './server.test-fixtures'

vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../telemetry/cohort-classifier', () => ({ getCohortAtEmit: () => ({}) }))
vi.mock('../../shared/agent-status/process/agent-process-presence-probe', () => ({
  probeAgentProcessPresence: vi.fn(async () => 'unverifiable')
}))

const servers: AgentHookServer[] = []
const paths: string[] = []
afterEach(() => {
  vi.useRealTimers()
  for (const server of servers.splice(0)) {
    server.stop()
  }
  for (const path of paths.splice(0)) {
    rmSync(path, { recursive: true, force: true })
  }
})

const agentProcess = JSON.stringify({ pid: 4001, platform: process.platform, startTime: 'b-4001' })

async function startServer(): Promise<{ server: AgentHookServer; spoolDir: string }> {
  const userDataPath = mkdtempSync(join(tmpdir(), 'orca-live-spool-'))
  paths.push(userDataPath)
  const server = new AgentHookServer()
  servers.push(server)
  await server.start({ env: 'production', userDataPath })
  const spoolDir = join(userDataPath, 'agent-hooks', 'spool')
  mkdirSync(spoolDir, { recursive: true })
  return { server, spoolDir }
}

async function post(server: AgentHookServer, event: string): Promise<void> {
  const response = await postHookEvent(
    server,
    buildBody(
      { hook_event_name: event, session_id: 'session-a', source: 'startup', prompt: 'do it' },
      { agentProcess }
    )
  )
  expect(response.status).toBe(204)
}

function spoolStop(spoolDir: string, receivedAt: number): void {
  writeFileSync(
    join(spoolDir, 'pane-live.jsonl'),
    `\n${JSON.stringify({
      paneKey: PANE,
      tabId: 'tab-1',
      worktreeId: 'wt-1',
      env: 'production',
      source: 'claude',
      receivedAt,
      agentProcess,
      payload: { hook_event_name: 'Stop', session_id: 'session-a' }
    })}\n`
  )
}

const state = (server: AgentHookServer) => server.getStatusSnapshotForPane(PANE)[0]?.state

describe('a hook spooled while Orca runs', () => {
  it('is replayed without a restart, so a lost Stop ends the turn', async () => {
    const { server, spoolDir } = await startServer()
    await post(server, 'UserPromptSubmit')
    expect(state(server)).toBe('working')
    spoolStop(spoolDir, Date.now() + 1000)
    await vi.waitFor(() => expect(state(server)).toBe('done'), { timeout: 8000, interval: 200 })
  }, 15_000)

  it('never undoes a newer live hook', async () => {
    const { server, spoolDir } = await startServer()
    spoolStop(spoolDir, Date.now() - 10_000)
    await post(server, 'UserPromptSubmit')
    await new Promise((resolve) => setTimeout(resolve, 6000))
    expect(state(server)).toBe('working')
  }, 15_000)
})
