import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../native-chat-types'
import { summarizeNativeChatConversation } from './native-chat-conversation-summary'

function user(id: string, text: string, timestamp: number, extra = {}): NativeChatMessage {
  return {
    id,
    role: 'user',
    blocks: [{ type: 'text', text }],
    timestamp,
    source: 'transcript',
    ...extra
  }
}

describe('summarizeNativeChatConversation: the person’s own last prompt', () => {
  it('skips task notifications, Orca mail and other agents when naming the last prompt and its time', () => {
    const summary = summarizeNativeChatConversation(
      [
        user('u1', 'ship it', 100),
        user('u2', '<task-notification><status>completed</status></task-notification>', 200),
        user('u3', 'You have 1 orchestration message. Run `orca orchestration check`.', 300),
        user('u4', 'worker report', 400, {
          from: { kind: 'agent', senders: [] }
        })
      ],
      { working: false, startsAtFirstMessage: true }
    )
    expect(summary.lastPrompt).toBe('ship it')
    expect(summary.lastPromptAt).toBe(100)
  })
})
