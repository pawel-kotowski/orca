import { describe, expect, it } from 'vitest'
import { compileTour } from './show-tour-compile'

const inWorktree = (path: string): string => {
  if (path.startsWith('/')) {
    throw new Error(`${path} is not inside the worktree`)
  }
  return path
}

describe('compileTour', () => {
  it('turns each orca-show line into the request the same command would send', () => {
    const tour = compileTour(
      [
        '# Files',
        '<!-- tour-commit: abcdef1234 -->',
        '## One',
        'Words.',
        '```orca-show',
        'code a.ts --lines 2-5 --mark 1 --note "Entry"',
        'tree a.ts --label "a.ts=the file" --no-expand',
        '```'
      ].join('\n'),
      inWorktree,
      'fallback'
    )
    expect(tour.problems).toEqual([])
    expect(tour.title).toBe('Files')
    expect(tour.stamp).toBe('abcdef1234')
    expect(tour.steps[0]!.caption).toBe('Words.')
    expect(tour.steps[0]!.requests).toEqual([
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

  it('lists every problem at once: bad flags, paths outside, empty steps', () => {
    const tour = compileTour(
      [
        '## Bad',
        'Words.',
        '```orca-show',
        'code a.ts --line 2-5',
        'code /etc/hosts --lines 1-2',
        '```',
        '## Empty'
      ].join('\n'),
      inWorktree,
      'fallback'
    )
    expect(tour.title).toBe('fallback')
    expect(tour.problems).toEqual([
      'step 1 "Bad" (line 1): `code a.ts --line 2-5`: Unknown flag --line for command: show code',
      'step 1 "Bad" (line 1): `code /etc/hosts --lines 1-2`: /etc/hosts is not inside the worktree',
      'step 2 "Empty" (line 7): no orca-show block',
      'step 2 "Empty" (line 7): no caption; write 1-3 sentences under the heading'
    ])
  })
})
