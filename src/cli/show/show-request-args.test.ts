import { describe, expect, it } from 'vitest'
import {
  getClearScope,
  getUiTarget,
  parseCodeRef,
  parseLineRange,
  treeEntriesFor
} from './show-request-args'

const flags = (entries: [string, string | boolean][]) => new Map(entries)

describe('parseLineRange', () => {
  it('reads one line as a one-line range', () => {
    expect(parseLineRange('42')).toEqual({ startLine: 42, endLine: 42 })
  })

  it('reads a start-end range', () => {
    expect(parseLineRange('40-62')).toEqual({ startLine: 40, endLine: 62 })
  })

  it.each(['62-40', '0', '40-', '-3', 'a-b', '1-2-3', '4.5'])('rejects %s', (value) => {
    expect(() => parseLineRange(value)).toThrow(/--lines/)
  })
})

describe('parseCodeRef', () => {
  it('splits at the last colon so a Windows drive letter stays in the path', () => {
    expect(parseCodeRef('C:\\repo\\app.ts:3-9')).toEqual({
      filePath: 'C:\\repo\\app.ts',
      range: { startLine: 3, endLine: 9 }
    })
  })

  it('rejects a path without a range', () => {
    expect(() => parseCodeRef('src/app.ts')).toThrow(/--code/)
  })
})

describe('treeEntriesFor', () => {
  it('pairs each label with the path it names and keeps unlabelled paths', () => {
    expect(treeEntriesFor(['src/cli', 'src/main'], ['src/main=main = process'])).toEqual([
      { path: 'src/cli' },
      { path: 'src/main', label: 'main = process' }
    ])
  })

  it('rejects a label for a path that is not shown', () => {
    expect(() => treeEntriesFor(['src/cli'], ['src/main=main'])).toThrow(/not one of the paths/)
  })

  it.each(['src/cli', '=label', 'src/cli='])('rejects the malformed pair %s', (pair) => {
    expect(() => treeEntriesFor(['src/cli'], [pair])).toThrow(/--label/)
  })
})

describe('getUiTarget', () => {
  it('takes the one target given', () => {
    expect(getUiTarget(flags([['ref', '@e3']]))).toEqual({ ref: '@e3' })
  })

  it('rejects no target and two targets', () => {
    expect(() => getUiTarget(flags([]))).toThrow(/exactly one/)
    expect(() =>
      getUiTarget(
        flags([
          ['selector', '#login'],
          ['text', 'Sign in']
        ])
      )
    ).toThrow(/exactly one/)
  })
})

describe('getClearScope', () => {
  it('clears everything by default and one area when named', () => {
    expect(getClearScope(flags([]))).toBe('all')
    expect(getClearScope(flags([['tree', true]]))).toBe('tree')
  })

  it('rejects two scopes', () => {
    expect(() =>
      getClearScope(
        flags([
          ['code', true],
          ['ui', true]
        ])
      )
    ).toThrow(/at most one/)
  })
})
