import { describe, expect, it } from 'vitest'
import { decodeClaudeTurnLifecycle } from './transcript-turn-lifecycle'

describe('native chat transcript turn lifecycle', () => {
  it('excludes Claude tool-result rows that also carry text sidecars', () => {
    expect(
      decodeClaudeTurnLifecycle(
        JSON.stringify({
          type: 'user',
          uuid: 'mixed-tool-result',
          timestamp: '2026-07-16T23:45:38.000Z',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'tool-1', content: 'ok' },
              { type: 'text', text: '<system-reminder>continue</system-reminder>' }
            ]
          }
        }),
        'fallback'
      )
    ).toBeNull()
  })

  it("opens a turn on a background task's notification, which the chat hides as noise", () => {
    const line = JSON.stringify({
      type: 'user',
      uuid: 'note-1',
      timestamp: '2026-11-16T16:09:23.047Z',
      origin: { kind: 'task-notification', producer: 'session-task' },
      message: {
        role: 'user',
        content:
          '<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n</task-notification>'
      }
    })
    expect(decodeClaudeTurnLifecycle(line, 'fallback')).toEqual({
      state: 'working',
      turnId: 'note-1',
      timestamp: Date.parse('2026-11-16T16:09:23.047Z')
    })
  })
})
