import { describe, expect, it } from 'vitest'
import { anchorCodeNote, codeNoteLinesText } from './code-note-anchor'

const file = ['import x', '', 'function run() {', '  retry()', '  wait()', '}'].join('\n')

describe('code note anchors', () => {
  const left = { startLine: 4, lineNumber: 5, selectedText: codeNoteLinesText(file, 4, 5) }

  it('keeps the lines it was left on, indentation included', () => {
    expect(left.selectedText).toBe('  retry()\n  wait()')
    expect(anchorCodeNote(file, left)).toEqual({ startLine: 4, lineNumber: 5, stale: false })
  })

  it('follows its lines when code above them moves them down', () => {
    const edited = [
      'import x',
      'import y',
      '',
      '',
      'function run() {',
      '  retry()',
      '  wait()',
      '}'
    ].join('\n')
    expect(anchorCodeNote(edited, left)).toEqual({ startLine: 6, lineNumber: 7, stale: false })
  })

  it('picks the copy nearest where it was when the lines appear twice', () => {
    const twice = ['  retry()', '  wait()', 'x', '  retry()', '  wait()'].join('\n')
    expect(anchorCodeNote(twice, left)).toEqual({ startLine: 4, lineNumber: 5, stale: false })
  })

  it('is stale when its lines were changed, and stays inside the file', () => {
    const changed = ['import x', '', 'function run() {', '  retry(3)', '}'].join('\n')
    expect(anchorCodeNote(changed, left)).toEqual({ startLine: 4, lineNumber: 5, stale: true })
    expect(anchorCodeNote('one line', left)).toEqual({ startLine: 1, lineNumber: 1, stale: true })
  })
})
