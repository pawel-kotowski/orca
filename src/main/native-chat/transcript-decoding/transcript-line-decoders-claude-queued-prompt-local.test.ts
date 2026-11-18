import { describe, expect, it } from 'vitest'
import { decodeClaudeTranscriptLine } from './transcript-line-decoders-claude'

// Shape captured from Claude Code 2.1.292 for a prompt absorbed mid-turn.
function queuedCommand(attachment: Record<string, unknown>): string {
  return JSON.stringify({
    parentUuid: 'tool-result-row',
    isSidechain: false,
    attachment: {
      type: 'queued_command',
      source_uuid: 'cmd-1',
      delivery_id: 'delivery-1',
      timestamp: '2026-10-06T21:49:54.910Z',
      ...attachment
    },
    type: 'attachment',
    uuid: 'queued-row',
    timestamp: '2026-10-06T21:49:54.910Z',
    rendered: [{ content: '<system-reminder>\nThe user sent a new message…</system-reminder>' }]
  })
}

describe('Claude queued_command attachment (local)', () => {
  it('decodes a background task that ended mid-turn as the notice an idle agent gets', () => {
    // Shape captured from Claude Code 2.1.319: no user row follows, so the shells strip never settled.
    const notice =
      '<task-notification>\n<task-id>bgsk7286a</task-id>\n<tool-use-id>toolu_014D</tool-use-id>\n' +
      '<output-file>/tmp/tasks/bgsk7286a.output</output-file>\n<status>completed</status>\n' +
      '<summary>Background command "Run a quick judge score" completed (exit code 0)</summary>\n' +
      '</task-notification>'
    const line = queuedCommand({
      prompt: notice,
      commandMode: 'task-notification',
      origin: { kind: 'task-notification', producer: 'session-task' }
    })
    expect(decodeClaudeTranscriptLine(line, 'fallback')).toEqual({
      id: 'queued-row',
      role: 'user',
      blocks: [{ type: 'text', text: notice }],
      timestamp: Date.parse('2026-10-06T21:49:54.910Z'),
      source: 'transcript',
      parentId: 'tool-result-row'
    })
  })

  it('still drops queued entries that are neither a prompt nor a task notice', () => {
    const line = queuedCommand({ prompt: 'x', commandMode: 'bash', origin: { kind: 'human' } })
    expect(decodeClaudeTranscriptLine(line, 'fallback')).toBeNull()
  })
})
