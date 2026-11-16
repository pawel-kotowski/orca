import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AgentHookServer } from '../../agent-hook-server'
import { buildBody, PANE, postHookEvent } from '../server.test-fixtures'
import type { probeAgentProcessPresence } from '../../../../../shared/agent-status/process/agent-process-presence-probe'

vi.mock('../../../../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../../../telemetry/cohort-classifier', () => ({ getCohortAtEmit: () => ({}) }))
const probe = vi.hoisted(() => vi.fn<typeof probeAgentProcessPresence>(async () => 'live'))
vi.mock('../../../../../shared/agent-status/process/agent-process-presence-probe', () => ({
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
})

async function start(): Promise<AgentHookServer> {
  const directory = mkdtempSync(join(tmpdir(), 'claude-idle-compaction-'))
  directories.push(directory)
  const server = new AgentHookServer()
  servers.push(server)
  await server.start({ env: 'production', userDataPath: directory })
  return server
}

async function claudeHook(server: AgentHookServer, payload: Record<string, unknown>) {
  const response = await postHookEvent(
    server,
    buildBody({ session_id: 'claude-lead', ...payload }, { agentProcess: JSON.stringify(PROCESS) })
  )
  expect(response.status).toBe(204)
}

function row(server: AgentHookServer) {
  return server.getStatusSnapshotForPane(PANE)[0]
}

const later = () => new Promise((resolve) => setTimeout(resolve, 5))

/** What Claude Code 2.1.325 sends for a compaction between turns, captured from a real /compact:
 *  its one-shot summary agent ends with a SubagentStop that no SubagentStart announced. */
const COMPACTION_BETWEEN_TURNS = [
  { hook_event_name: 'PreCompact', trigger: 'manual' },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'a126d9368648aecd2',
    agent_type: '',
    background_tasks: []
  },
  { hook_event_name: 'SessionStart', source: 'compact' },
  { hook_event_name: 'PostCompact', trigger: 'manual' }
]

// Paweł, 2026-11-16: Claude's idle compaction at 20:55 put an 8 pm chat back in the Inbox as
// "12m"; "should stay where it was with stamp compacted that dissapears when conversation is
// continued".
describe('Claude compacting between turns', () => {
  it('keeps the finish time and marks the row compacted until the next turn', async () => {
    const server = await start()
    await claudeHook(server, { hook_event_name: 'UserPromptSubmit', prompt: 'write it' })
    await claudeHook(server, { hook_event_name: 'Stop', background_tasks: [] })
    const finished = row(server)!
    expect(finished.state).toBe('done')
    expect(finished.compactedAt).toBeUndefined()

    await later()
    for (const payload of COMPACTION_BETWEEN_TURNS) {
      await claudeHook(server, payload)
    }
    const compacted = row(server)!
    expect(compacted.state).toBe('done')
    expect(compacted.stateStartedAt).toBe(finished.stateStartedAt)
    expect(compacted.compactedAt).toBeGreaterThan(finished.stateStartedAt)

    await later()
    await claudeHook(server, { hook_event_name: 'UserPromptSubmit', prompt: 'and now this' })
    expect(row(server)!.compactedAt).toBeUndefined()
    await claudeHook(server, { hook_event_name: 'Stop', background_tasks: [] })
    const next = row(server)!
    expect(next.state).toBe('done')
    expect(next.compactedAt).toBeUndefined()
    expect(next.stateStartedAt).toBeGreaterThan(finished.stateStartedAt)
  })

  it('says nothing about a compaction inside a turn', async () => {
    const server = await start()
    await claudeHook(server, { hook_event_name: 'UserPromptSubmit', prompt: 'long work' })
    await claudeHook(server, { hook_event_name: 'PreCompact', trigger: 'auto' })
    await claudeHook(server, { hook_event_name: 'SessionStart', source: 'compact' })
    await claudeHook(server, { hook_event_name: 'PostCompact', trigger: 'auto' })
    expect(row(server)!.state).toBe('working')
    await claudeHook(server, { hook_event_name: 'Stop', background_tasks: [] })
    expect(row(server)!.compactedAt).toBeUndefined()
  })

  it('still starts a new finish when a child that held the pane open ends', async () => {
    const server = await start()
    await claudeHook(server, { hook_event_name: 'UserPromptSubmit', prompt: 'start it' })
    await claudeHook(server, { hook_event_name: 'Stop', background_tasks: [] })
    const finished = row(server)!
    await later()
    await claudeHook(server, {
      hook_event_name: 'SubagentStart',
      agent_id: 'bg',
      agent_type: 'general-purpose'
    })
    expect(row(server)!.state).toBe('working')
    await later()
    await claudeHook(server, {
      hook_event_name: 'SubagentStop',
      agent_id: 'bg',
      agent_type: 'general-purpose',
      background_tasks: []
    })
    const ended = row(server)!
    expect(ended.state).toBe('done')
    expect(ended.stateStartedAt).toBeGreaterThan(finished.stateStartedAt)
  })
})
