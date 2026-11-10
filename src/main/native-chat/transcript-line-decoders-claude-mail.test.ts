import { describe, expect, it } from 'vitest'
import { decodeClaudeTranscriptLine } from './transcript-line-decoders-claude'

function userLine(content: string): string {
  return JSON.stringify({
    type: 'user',
    uuid: 'u-1',
    timestamp: '2026-11-10T10:00:00.000Z',
    message: { role: 'user', content }
  })
}

describe('Orca mail pointers in a Claude transcript', () => {
  it('reads the typed mail pointer as Orca mail, not the person', () => {
    const message = decodeClaudeTranscriptLine(
      userLine('\nYou have 1 orchestration message. Run `orca orchestration check --run run_1`.'),
      'fallback'
    )
    expect(message?.role).toBe('user')
    expect(message?.from).toMatchObject({
      kind: 'agent',
      senders: [],
      orchestration: { message: 'mail-notice' }
    })
  })

  it('leaves a person mentioning orchestration mail alone', () => {
    const message = decodeClaudeTranscriptLine(
      userLine('why do I have 3 orchestration messages?'),
      'fallback'
    )
    expect(message?.from).toBeUndefined()
  })
})
