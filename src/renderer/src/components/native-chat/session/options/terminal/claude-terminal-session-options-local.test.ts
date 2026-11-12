import { describe, expect, it } from 'vitest'
import { readClaudeSessionOptionsFromTerminalScreen } from './claude-terminal-session-options'

const EFFORT = {
  id: 'effort',
  label: 'Effort',
  kind: {
    type: 'select' as const,
    choices: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' }
    ],
    defaultValue: 'high'
  },
  apply: {}
}

function frame(descriptor: string): string {
  return `Claude Code v2.1.220\r\n${descriptor}\r\n~/repo`
}

describe('Claude terminal session option detection (local)', () => {
  it('never reads a newer point release as the shorter version it starts with', () => {
    // Paweł, 2026-11-10: a Fable 5.2 chat read "Fable 5" from a host list holding `claude-fable-5`.
    expect(
      readClaudeSessionOptionsFromTerminalScreen(
        frame('Fable 5.2 with high effort · API Usage Billing'),
        [
          { id: 'claude-fable-5', label: 'Fable 5', options: [EFFORT] },
          { id: 'fable', label: 'Fable 5.2', options: [EFFORT] }
        ]
      )
    ).toEqual({ model: 'fable', effort: 'high' })
  })
})
