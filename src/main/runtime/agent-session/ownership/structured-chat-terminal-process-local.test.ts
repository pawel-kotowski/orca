import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type * as ClaudeSessionRecords from './claude-session-records'

const ID = 'ce489453-5f6c-4b04-bd51-b00646a38a10'
const rows = vi.hoisted(() => ({ list: [] as { pid: number; ppid: number; command: string }[] }))
vi.mock(
  '../../../../shared/process-observation/tables/process-table-snapshot-reader',
  async (original) => ({
    ...(await original<object>()),
    getFreshShellForegroundSnapshot: async () => ({})
  })
)
vi.mock('../../../../shared/process-observation/tables/process-table-index', () => ({
  getProcessTableIndex: () => ({ byPid: new Map(rows.list.map((row) => [row.pid, row])) }),
  collectDescendantsFromIndex: (_index: unknown, root: number) =>
    rows.list.filter(({ ppid }) => ppid === root)
}))

const records = vi.hoisted(() => ({ dir: '' }))
vi.mock('./claude-session-records', async (original) => {
  const { readClaudeSessionRecords } = await original<typeof ClaudeSessionRecords>()
  return { readClaudeSessionRecords: () => readClaudeSessionRecords(async () => [records.dir]) }
})

import { readTerminalProcesses } from './structured-chat-terminal-process'

beforeEach(async () => {
  records.dir = await mkdtemp(join(tmpdir(), 'claude-records-'))
})
afterEach(() => rm(records.dir, { recursive: true, force: true }))

it('sees the conversation wherever its agent runs, and not its copies or other programs', async () => {
  const process = (pid: number, command: string) => ({ pid, ppid: 10, command })
  const anywhere = async (command: string, except?: number[]) => {
    rows.list = [process(1, command)]
    return (await readTerminalProcesses()).runsAnywhere(ID, except)
  }
  expect(await anywhere(`claude --resume ${ID}`)).toBe(true)
  expect(await anywhere(`codex --no-daemon resume ${ID}`)).toBe(true)
  expect(await anywhere(`claude --resume ${ID} --fork-session`)).toBe(false)
  expect(await anywhere(`codex --no-daemon fork ${ID}`)).toBe(false)
  expect(await anywhere(`claude -p --resume ${ID} hello`)).toBe(true)
  expect(await anywhere(`claude Read /tmp/${ID}/scratchpad/brief.md`)).toBe(false)
  expect(await anywhere(`tail -f /x/${ID}.jsonl`)).toBe(false)
  expect(await anywhere(`claude --resume ${ID}`, [10])).toBe(false)
})

const WORKER = 'claude bg-spare --bg-spare /tmp/cc-daemon-502/1c4dbdc2/spare/022accb7.sock'
// A pid of a live process, whose start the records are checked against.
const PID = process.pid
const record = (text: string) => writeFile(join(records.dir, `${PID}.json`), text)
const anywhere = async (command: string, except?: number[]) => {
  rows.list = [
    { pid: 11, ppid: 10, command: 'claude --resume another' },
    { pid: 12, ppid: 11, command: '/Users/me/.local/bin/claude daemon run --origin transient' },
    { pid: PID, ppid: 12, command }
  ]
  return (await readTerminalProcesses()).runsAnywhere(ID, except)
}

it('sees a Claude session put in the background, which only its own record names', async () => {
  expect(await anywhere(WORKER)).toBe(false)
  await record(JSON.stringify({ pid: PID, sessionId: ID, kind: 'bg' }))
  expect(await anywhere(WORKER)).toBe(true)
  // Its service is another terminal's, whose agent is on another conversation.
  expect(await anywhere(WORKER, [10])).toBe(true)
  expect(await anywhere('/x/claude/versions/2.1.331 --session-id other')).toBe(true)
  expect(await anywhere('vim notes.md')).toBe(false)
  await record(JSON.stringify({ pid: PID, sessionId: 'another' }))
  expect(await anywhere(WORKER)).toBe(false)
  expect(await anywhere(`claude bg-pty-host x -- claude --resume ${ID}`, [10])).toBe(true)
})

it('an earlier process with the same pid is not the one a record names', async () => {
  const own = { pid: PID, sessionId: ID, startedAt: Date.now() }
  await record(JSON.stringify(own))
  expect(await anywhere(WORKER)).toBe(true)
  const startedAt = Date.now() - 365 * 24 * 60 * 60 * 1000
  await record(JSON.stringify({ ...own, startedAt, procStart: '1' }))
  expect(await anywhere(WORKER)).toBe(process.platform === 'win32')
})

it('a record or folder that cannot be read proves nothing', async () => {
  await record('{"pid":1,"sess')
  expect(await anywhere(WORKER)).toBe(null)
  // Another kind of process holds nothing with it.
  expect(await anywhere('claude --resume another')).toBe(false)
  if (process.platform !== 'win32') {
    await chmod(records.dir, 0)
    expect(await anywhere(WORKER)).toBe(null)
    await chmod(records.dir, 0o700)
  }
})
