import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import type * as ClaudeSessionHolder from '../../../ipc/pty/host-env/live-claude-session-holder'

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
vi.mock('../../../ipc/pty/host-env/live-claude-session-holder', async (original) => {
  const holder = await original<typeof ClaudeSessionHolder>()
  return {
    ...holder,
    readClaudeSessionRecords: () => holder.readClaudeSessionRecords(async () => [records.dir])
  }
})

import { readTerminalProcesses } from './structured-chat-terminal-process'

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

it('sees a Claude session put in the background, which only its own record names', async () => {
  records.dir = await mkdtemp(join(tmpdir(), 'claude-records-'))
  try {
    const anywhere = async (command: string, except?: number[]) => {
      rows.list = [{ pid: 83044, ppid: 10, command }]
      return (await readTerminalProcesses()).runsAnywhere(ID, except)
    }
    const worker = 'claude bg-spare --bg-spare /tmp/cc-daemon-502/1c4dbdc2/spare/022accb7.sock'
    const record = (text: string) => writeFile(join(records.dir, '83044.json'), text)
    expect(await anywhere(worker)).toBe(false)
    await record(JSON.stringify({ pid: 83044, sessionId: ID, kind: 'bg' }))
    expect(await anywhere(worker)).toBe(true)
    expect(await anywhere(worker, [10])).toBe(false)
    // The record outlived its process, whose pid another program has now.
    expect(await anywhere('vim notes.md')).toBe(false)
    await record('{"pid":83044,"sess')
    expect(await anywhere(worker)).toBe(null)
    await record(JSON.stringify({ pid: 83044, sessionId: 'another' }))
    expect(await anywhere(worker)).toBe(false)
  } finally {
    await rm(records.dir, { recursive: true })
  }
})
