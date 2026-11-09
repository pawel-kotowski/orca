import { mkdtemp, mkdir, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { listClaudeProjectSessions } from './claude-project-sessions'

const line = (row: unknown): string => `${JSON.stringify(row)}\n`

it("lists a project's conversations newest first, titled as Claude Code names them", async () => {
  const project = join(await mkdtemp(join(tmpdir(), 'claude-home-')), 'projects', '-proj')
  await mkdir(project, { recursive: true })
  const write = async (id: string, rows: unknown[], mtime: number): Promise<void> => {
    const path = join(project, `${id}.jsonl`)
    await writeFile(path, rows.map(line).join(''))
    await utimes(path, mtime, mtime)
  }
  await write(
    'old',
    [
      { type: 'user', message: { content: 'first question' } },
      { type: 'ai-title', aiTitle: 'Old work' }
    ],
    1000
  )
  await write(
    'renamed',
    [
      { type: 'user', message: { content: '<command-name>/clear</command-name>' } },
      { type: 'user', message: { content: [{ type: 'text', text: 'real prompt' }] } },
      { type: 'ai-title', aiTitle: 'Auto title' },
      { type: 'custom-title', customTitle: 'My name' }
    ],
    3000
  )
  await write('empty', [{ type: 'mode', mode: 'normal' }], 2000)
  expect(await listClaudeProjectSessions(join(project, 'old.jsonl'))).toEqual([
    { sessionId: 'renamed', title: 'My name', firstPrompt: 'real prompt', updatedAt: 3_000_000 },
    { sessionId: 'old', title: 'Old work', firstPrompt: 'first question', updatedAt: 1_000_000 }
  ])
})

it('reads nothing outside a Claude home projects folder', async () => {
  expect(await listClaudeProjectSessions('/etc/passwd.jsonl')).toEqual([])
})
