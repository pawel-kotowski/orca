import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../native-chat-types'
import {
  mergeNativeChatLiveSession,
  nativeChatHookWorkingStartedAt
} from './native-chat-live-status'

function assistant(id: string, text: string): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [{ type: 'text', text }],
    timestamp: 2,
    source: 'transcript'
  }
}

describe('nativeChatHookWorkingStartedAt', () => {
  it("dates a held-open row's new main-agent turn from the main agent, so the last turn's end does not settle it", () => {
    // The row stayed working for an hour (background shells); the main agent started a turn after the last one ended.
    const entry = {
      state: 'working' as const,
      stateStartedAt: 1_000,
      mainAgent: { state: 'working' as const, stateStartedAt: 70_000 }
    }
    expect(nativeChatHookWorkingStartedAt(entry)).toBe(70_000)
    const session = mergeNativeChatLiveSession({
      messages: [assistant('a-1', 'checking the run')],
      sessionId: 'sess',
      agent: 'claude',
      hookState: 'working',
      stateStartedAt: nativeChatHookWorkingStartedAt(entry),
      transcriptLifecycle: { state: 'completed', turnId: 'turn-1', timestamp: 5_000 }
    })
    expect(session.status).toBe('working')
  })

  it("keeps the row's start while only children work", () => {
    expect(
      nativeChatHookWorkingStartedAt({
        state: 'working',
        stateStartedAt: 1_000,
        mainAgent: { state: 'done', stateStartedAt: 70_000 }
      })
    ).toBe(1_000)
    expect(nativeChatHookWorkingStartedAt(undefined)).toBeNull()
  })
})
