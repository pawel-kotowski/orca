import { describe, expect, it } from 'vitest'
import { parseTourFile, splitShellWords } from './show-tour-file'

describe('splitShellWords', () => {
  it('splits like a shell for quotes and escapes', () => {
    expect(
      splitShellWords(`code src/a.ts --lines 1-3 --note "Path, made 'relative'" --mark 1`)
    ).toEqual([
      'code',
      'src/a.ts',
      '--lines',
      '1-3',
      '--note',
      "Path, made 'relative'",
      '--mark',
      '1'
    ])
    expect(splitShellWords(`tree src --label 'src=all code' --label src\\ two=x`)).toEqual([
      'tree',
      'src',
      '--label',
      'src=all code',
      '--label',
      'src two=x'
    ])
  })

  it('refuses an unclosed quote', () => {
    expect(() => splitShellWords('code a.ts --note "open')).toThrow('unclosed')
  })
})

describe('parseTourFile', () => {
  const tour = [
    '# How files open',
    '',
    'Intro text the player does not show.',
    '',
    '## The CLI sends one call',
    'It sends `files.open` ①.',
    '<!-- hold: 9s -->',
    '',
    '```orca-show',
    'code src/cli/file.ts --lines 140-153 --mark 1 --note "One RPC"',
    'orca show code src/cli/call.ts --lines 18-35 --mark 2 --place below --keep',
    '```',
    '',
    '## Main checks the file',
    'A folder fails here.',
    '```orca-show',
    'code src/main/access.ts --lines 45-69',
    '```'
  ].join('\n')

  it('reads the title, each step’s caption, hold and commands', () => {
    expect(parseTourFile(tour)).toEqual({
      title: 'How files open',
      steps: [
        {
          title: 'The CLI sends one call',
          caption: 'It sends `files.open` ①.',
          holdMs: 9000,
          line: 5,
          commands: [
            ['code', 'src/cli/file.ts', '--lines', '140-153', '--mark', '1', '--note', 'One RPC'],
            [
              'code',
              'src/cli/call.ts',
              '--lines',
              '18-35',
              '--mark',
              '2',
              '--place',
              'below',
              '--keep'
            ]
          ]
        },
        {
          title: 'Main checks the file',
          caption: 'A folder fails here.',
          holdMs: null,
          line: 14,
          commands: [['code', 'src/main/access.ts', '--lines', '45-69']]
        }
      ]
    })
  })

  it('refuses a block that is never closed', () => {
    expect(() => parseTourFile('## Step\n```orca-show\ncode a.ts --lines 1')).toThrow('not closed')
  })
})
