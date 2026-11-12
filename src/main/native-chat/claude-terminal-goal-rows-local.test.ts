import { describe, expect, it } from 'vitest'
import { decodeClaudeTranscriptLine } from './transcript-line-decoders-claude'
import { claudeGoalCommandOutputState } from './claude-terminal-goal-rows'

// The records a real terminal Claude Code 2.1.322 wrote for `/goal …`, a passed check and `/goal clear`.
const base = { isSidechain: false, sessionId: 's1', cwd: '/tmp/p', version: '2.1.322' }
const lines = {
  sentinel: {
    ...base,
    type: 'attachment',
    uuid: 'a1',
    timestamp: '2026-11-12T20:41:36.802Z',
    attachment: { type: 'goal_status', met: false, sentinel: true, condition: 'say ok' }
  },
  command: {
    ...base,
    type: 'user',
    uuid: 'u1',
    timestamp: '2026-11-12T20:41:36.810Z',
    message: {
      role: 'user',
      content:
        '<command-name>/goal</command-name>\n            <command-message>goal</command-message>\n            <command-args>say ok</command-args>'
    }
  },
  output: {
    ...base,
    type: 'user',
    uuid: 'u2',
    parentUuid: 'u1',
    timestamp: '2026-11-12T20:41:36.820Z',
    message: {
      role: 'user',
      content: '<local-command-stdout>Goal set: say ok</local-command-stdout>'
    }
  },
  met: {
    ...base,
    type: 'attachment',
    uuid: 'a2',
    parentUuid: 'x',
    timestamp: '2026-11-12T20:41:39.256Z',
    attachment: {
      type: 'goal_status',
      met: true,
      condition: 'say ok',
      reason: 'It said ok.',
      iterations: 1,
      durationMs: 2455,
      tokens: 75
    }
  },
  unmet: {
    ...base,
    type: 'attachment',
    uuid: 'a3',
    timestamp: '2026-11-12T20:41:39.256Z',
    attachment: { type: 'goal_status', met: false, condition: 'say ok', reason: 'Not yet.' }
  },
  cleared: {
    ...base,
    type: 'system',
    subtype: 'local_command',
    uuid: 's2',
    timestamp: '2026-11-12T20:42:00.000Z',
    content: '<local-command-stdout>Goal cleared: say ok</local-command-stdout>',
    level: 'info'
  },
  clearCommand: {
    ...base,
    type: 'system',
    subtype: 'local_command',
    uuid: 's1',
    timestamp: '2026-11-12T20:42:00.000Z',
    content:
      '<command-name>/goal</command-name>\n            <command-message>goal</command-message>\n            <command-args>clear</command-args>',
    level: 'info'
  }
}
const decode = (record: object) => decodeClaudeTranscriptLine(JSON.stringify(record), 'fallback')

describe('a terminal Claude /goal', () => {
  it('carries the goal set by the command on its echoed output, and nothing on the command', () => {
    expect(decode(lines.output)?.threadGoal).toEqual({
      state: 'set',
      goal: expect.objectContaining({ objective: 'say ok', status: 'active' })
    })
    expect(decode(lines.command)?.threadGoal).toBeUndefined()
  })

  it('shows a passed check as a quiet complete row; an unmet one or the set sentinel adds no row', () => {
    const row = decode(lines.met)
    expect(row).toMatchObject({
      id: 'a2',
      role: 'system',
      blocks: [{ type: 'text', text: 'Goal complete: say ok' }],
      threadGoal: { state: 'set', goal: { objective: 'say ok', status: 'complete' } }
    })
    expect(decode(lines.unmet)).toBeNull()
    expect(decode(lines.sentinel)).toBeNull()
  })

  it('shows an idle /goal clear as a cleared row and drops the command echo', () => {
    expect(decode(lines.cleared)).toMatchObject({
      id: 's2',
      role: 'system',
      blocks: [{ type: 'text', text: 'Goal cleared: say ok' }],
      threadGoal: { state: 'cleared' }
    })
    expect(decode(lines.clearCommand)).toBeNull()
  })

  it('reads every /goal report form', () => {
    expect(claudeGoalCommandOutputState('No goal set', 1)).toEqual({ state: 'cleared' })
    expect(
      claudeGoalCommandOutputState('Goal cleared after an unrecoverable error (x)', 1)
    ).toEqual({ state: 'cleared' })
    expect(
      claudeGoalCommandOutputState('Goal active: ship it (3 turns)\nLast check: not yet', 1)
    ).toMatchObject({ state: 'set', goal: { objective: 'ship it', status: 'active' } })
    expect(claudeGoalCommandOutputState('Something else', 1)).toBeNull()
  })
})
