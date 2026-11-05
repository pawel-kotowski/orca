import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionRecordStore } from '../../../runtime/agent-session/records/agent-session-record-store'
import { admitResumeSpawn } from './saved-resume-admission'
import { findLiveClaudeSessionHolder, refuseIfRunningElsewhere } from './live-claude-session-holder'

vi.mock('../../../agent-hooks/server', () => ({ agentHookServer: {} }))

// A pid that is certainly alive and is not this process: the test runner's parent.
const LIVE_PID = process.ppid
// A pid that is certainly gone: above the platform's pid range.
const DEAD_PID = 2 ** 30

const emptyStore = {
  listConversations: () => [],
  getVisibleSessionTabIndex: () => ({ present: true, sessionIds: [] })
}

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'claude-sessions-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function record(pid: number, sessionId: string): Promise<void> {
  await writeFile(join(dir, `${pid}.json`), JSON.stringify({ pid, sessionId, kind: 'interactive' }))
}

async function savedResume(agent: 'claude' | 'codex', id: string) {
  const admission = await admitResumeSpawn(
    {
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the admission reads only this member.
      openAgentSessionRecordStore: async () => emptyStore as unknown as AgentSessionRecordStore
    },
    {
      resumeOrigin: 'saved',
      launchAgent: agent,
      resumeProviderSession: { key: 'session_id', id }
    },
    null
  )
  return refuseIfRunningElsewhere(admission, async () => [dir])
}

// Paweł, 2026-11-05: after restarts Orca resumed conversations that were still running, so two or
// three Claude processes worked one conversation and sent duplicate scheduled checks.
describe('a saved resume of a conversation that is still running', () => {
  it('is refused while a live Claude process runs that session', async () => {
    await record(LIVE_PID, 'session-live')
    expect(await findLiveClaudeSessionHolder('session-live', [dir])).toBe(LIVE_PID)
    expect((await savedResume('claude', 'session-live'))?.verdict).toBe('running-elsewhere')
  })

  it('is admitted when the recorded process has exited', async () => {
    await record(DEAD_PID, 'session-gone')
    expect((await savedResume('claude', 'session-gone'))?.verdict).toBe('admitted')
  })

  it('is admitted when live processes run other sessions', async () => {
    await record(LIVE_PID, 'some-other-session')
    expect((await savedResume('claude', 'session-wanted'))?.verdict).toBe('admitted')
  })

  it('does not apply Claude records to another agent', async () => {
    await record(LIVE_PID, 'shared-id')
    expect((await savedResume('codex', 'shared-id'))?.verdict).toBe('admitted')
  })

  it('reads a missing record dir as no holder', async () => {
    expect(await findLiveClaudeSessionHolder('x', [join(dir, 'absent')])).toBeNull()
  })
})
