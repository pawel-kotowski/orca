import { describe, expect, it } from 'vitest'
import { computeMonacoRevealRange } from './monaco-reveal-range'

describe('computeMonacoRevealRange with a line range', () => {
  it('selects whole lines from the start line to the end of the end line', () => {
    expect(
      computeMonacoRevealRange({
        line: 40,
        column: 7,
        matchLength: 0,
        maxLine: 100,
        lineMaxColumn: 30,
        endLine: 62,
        endLineMaxColumn: 18
      })
    ).toEqual({ startLineNumber: 40, startColumn: 1, endLineNumber: 62, endColumn: 18 })
  })

  it('stops the range at the last line of the file', () => {
    expect(
      computeMonacoRevealRange({
        line: 40,
        column: 1,
        matchLength: 0,
        maxLine: 50,
        lineMaxColumn: 30,
        endLine: 62,
        endLineMaxColumn: 9
      })
    ).toEqual({ startLineNumber: 40, startColumn: 1, endLineNumber: 50, endColumn: 9 })
  })
})
