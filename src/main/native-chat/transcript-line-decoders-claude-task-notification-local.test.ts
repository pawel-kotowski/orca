import { describe, expect, it } from 'vitest'
import { decodeClaudeTranscriptLine } from './transcript-line-decoders-claude'
import { runningTranscriptBackgroundShells } from '../../shared/native-chat/transcript/native-chat-transcript-background-shells'
import { isNoiseMessage } from '../../shared/native-chat/native-chat-noise'
import type { NativeChatMessage } from '../../shared/native-chat/native-chat-types'

// Shaped like Claude Code 2.1.322's records: the background Bash call, its launch result, and the
// task notification Claude writes as a system-made user turn when the shell ends.
const lines = [
  {
    type: 'assistant',
    uuid: 'a1',
    timestamp: '2026-11-12T21:19:45.000Z',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'Bash',
          input: { command: 'sleep 100; tail -2 log', run_in_background: true }
        }
      ]
    }
  },
  {
    type: 'user',
    uuid: 'r1',
    timestamp: '2026-11-12T21:19:46.000Z',
    message: {
      role: 'user',
      content: [
        {
          tool_use_id: 'toolu_1',
          type: 'tool_result',
          content:
            'Command running in background with ID: b9stg04q6. Output is being written to: /tmp/x'
        }
      ]
    }
  },
  {
    type: 'user',
    uuid: 'n1',
    timestamp: '2026-11-12T21:21:25.380Z',
    origin: { kind: 'task-notification', producer: 'session-task' },
    promptSource: 'system',
    turnOrigin: 'task_notification',
    message: {
      role: 'user',
      content:
        '<task-notification>\n<task-id>b9stg04q6</task-id>\n<tool-use-id>toolu_1</tool-use-id>\n<status>failed</status>\n<summary>Background command failed with exit code 1</summary>\n</task-notification>'
    }
  }
]

describe('a Claude task notification (local)', () => {
  const messages = lines
    .map((line, index) => decodeClaudeTranscriptLine(JSON.stringify(line), `f${index}`))
    .filter((message): message is NativeChatMessage => message !== null)

  it('ends its background shell, and the view still hides it', () => {
    const notice = messages.find((message) => message.id === 'n1')
    expect(notice).toBeDefined()
    expect(isNoiseMessage(notice!)).toBe(true)
    expect(runningTranscriptBackgroundShells(messages, Date.parse('2026-11-12T21:30:00Z'))).toEqual(
      []
    )
  })
})
