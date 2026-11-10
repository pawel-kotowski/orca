import { describe, expect, it } from 'vitest'
import { terminalPromptExcerpt } from './native-chat-terminal-prompt-excerpt'

const RULE = '─'.repeat(60)

describe('terminalPromptExcerpt', () => {
  it('reads the prompt Claude draws in place of its input box', () => {
    const screen = [
      '● Earlier answer text',
      '',
      RULE,
      ' Bash command',
      '',
      '   rm -rf build',
      '   Remove the build folder',
      '',
      ' Do you want to proceed?',
      ' ❯ 1. Yes',
      '   2. No, and tell Claude what to do differently (esc)',
      ''
    ].join('\r\n')
    expect(terminalPromptExcerpt(screen)).toEqual([
      'Bash command',
      '  rm -rf build',
      '  Remove the build folder',
      'Do you want to proceed?',
      '❯ 1. Yes',
      '  2. No, and tell Claude what to do differently (esc)'
    ])
  })

  it('turns serialized cursor moves back into spaces and drops colours', () => {
    const screen = `${RULE}\r\n\x1b[1C\x1b[1mPick\x1b[1Cone\x1b[0m\r\n\x1b[1C❯\x1b[1C1.\x1b[3CRed`
    expect(terminalPromptExcerpt(screen)).toEqual(['Pick one', '❯ 1.   Red'])
  })

  it('skips the mode line under an idle input box', () => {
    const screen = [
      '● done',
      RULE,
      '❯ ',
      RULE,
      '  ⏵⏵ bypass permissions on (shift+tab to cycle)'
    ].join('\n')
    expect(terminalPromptExcerpt(screen)).toEqual(['❯'])
  })

  it('falls back to the last lines without a rule, and reads nothing from nothing', () => {
    expect(terminalPromptExcerpt('a\nb\nc', 2)).toEqual(['b', 'c'])
    expect(terminalPromptExcerpt(null)).toEqual([])
    expect(terminalPromptExcerpt('\n\n')).toEqual([])
  })
})
