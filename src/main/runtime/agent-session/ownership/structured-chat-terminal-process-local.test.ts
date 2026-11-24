import { expect, it, vi } from 'vitest'

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
