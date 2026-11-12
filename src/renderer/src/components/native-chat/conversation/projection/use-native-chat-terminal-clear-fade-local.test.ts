import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../../../shared/native-chat/native-chat-types'
import { nativeChatTerminalClearSettled } from './use-native-chat-terminal-clear-fade'

function message(source: NativeChatMessage['source'], timestamp: number | null): NativeChatMessage {
  return { id: `${source}:${timestamp}`, role: 'system', source, timestamp, blocks: [] }
}

const CLEAR = { clearSentAt: 1_000, sessionIdAtClear: 'session-1', sessionId: 'session-1' }

describe('nativeChatTerminalClearSettled', () => {
  it('waits while only the local command marker is newer than the clear', () => {
    expect(
      nativeChatTerminalClearSettled({
        ...CLEAR,
        messages: [message('transcript', 900), message('scrape', 1_000)]
      })
    ).toBe(false)
  })

  it('lands once the agent writes after the clear', () => {
    expect(
      nativeChatTerminalClearSettled({ ...CLEAR, messages: [message('transcript', 1_200)] })
    ).toBe(true)
  })

  it('lands when the agent starts a new session', () => {
    expect(nativeChatTerminalClearSettled({ ...CLEAR, sessionId: 'session-2', messages: [] })).toBe(
      true
    )
  })
})
