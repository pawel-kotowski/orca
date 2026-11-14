import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { HandlerContext } from '../dispatch/dispatch'
import { buildTourSteps } from './show-tour'
import { parseTourFile } from './show-tour-file'

const root = mkdtempSync(join(tmpdir(), 'orca-tour-'))
writeFileSync(join(root, 'a.ts'), Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n'))

// The runtime only answers where the worktree is, as it would for a real checkout.
const client = { call: async () => ({ result: { worktree: { path: root } } }) }
const ctx = {
  flags: new Map(),
  cwd: '/elsewhere',
  json: false,
  client
} as unknown as HandlerContext

describe('buildTourSteps', () => {
  it('turns each orca-show line into the request the same command would send', async () => {
    const tour = parseTourFile(
      [
        '## One',
        'Words.',
        '```orca-show',
        'code a.ts --lines 2-5 --mark 1 --note "Entry"',
        'tree a.ts --label "a.ts=the file" --no-expand',
        '```'
      ].join('\n')
    )
    const { steps, problems } = await buildTourSteps(ctx, `path:${root}`, root, tour)
    expect(problems).toEqual([])
    expect(steps[0]!.requests).toEqual([
      {
        kind: 'code',
        filePath: 'a.ts',
        range: { startLine: 2, endLine: 5 },
        note: 'Entry',
        mark: '1',
        place: 'beside',
        keepOthers: false
      },
      {
        kind: 'tree',
        entries: [{ path: 'a.ts', label: 'the file' }],
        expand: false,
        dimOthers: false
      }
    ])
  })

  it('lists every problem at once: bad flags, missing files, ranges past the end, empty steps', async () => {
    const tour = parseTourFile(
      [
        '## Bad',
        'Words.',
        '```orca-show',
        'code a.ts --line 2-5',
        'code gone.ts --lines 1-2',
        'code a.ts --lines 18-25',
        '```',
        '## Empty'
      ].join('\n')
    )
    const { problems } = await buildTourSteps(ctx, `path:${root}`, root, tour)
    expect(problems).toEqual([
      'step 1 "Bad" (line 1): `code a.ts --line 2-5`: Unknown flag --line for command: show code',
      'step 1 "Bad" (line 1): `code gone.ts --lines 1-2`: gone.ts does not exist in the worktree',
      'step 1 "Bad" (line 1): `code a.ts --lines 18-25`: lines 18-25 run past the end (20 lines)',
      'step 2 "Empty" (line 8): no orca-show block',
      'step 2 "Empty" (line 8): no caption; write 1-3 sentences under the heading'
    ])
  })
})
