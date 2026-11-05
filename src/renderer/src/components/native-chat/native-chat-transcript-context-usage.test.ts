import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import { transcriptContextUsageSummary } from './native-chat-transcript-context-usage'

function reply(id: string, model: string, read: number): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [{ type: 'text', text: 'ok' }],
    timestamp: null,
    source: 'transcript',
    model,
    // What the model read: fresh input plus the cached prefix it wrote and read.
    usage: {
      inputTokens: 10,
      cacheCreationInputTokens: 1_000,
      cacheReadInputTokens: read,
      outputTokens: 500
    }
  }
}

const WINDOWS = { 'claude-opus-5-5': 1_000_000, 'claude-haiku-4-5-20251001': 200_000 }

describe('transcriptContextUsageSummary', () => {
  it("reads the newest reply's prompt against its model's window", () => {
    const messages = [reply('a', 'claude-opus-5-5', 50_000), reply('b', 'claude-opus-5-5', 418_990)]
    expect(transcriptContextUsageSummary(messages, WINDOWS)).toEqual({
      usedTokens: 420_000,
      windowTokens: 1_000_000,
      percentage: 42,
      estimated: false,
      rows: []
    })
  })

  it('knows nothing for a model the catalog does not list', () => {
    expect(transcriptContextUsageSummary([reply('a', 'claude-next', 1_000)], WINDOWS)).toBeNull()
  })

  it('knows nothing when the reply read more than the listed window, which is then not its own', () => {
    expect(
      transcriptContextUsageSummary([reply('a', 'claude-haiku-4-5-20251001', 250_000)], WINDOWS)
    ).toBeNull()
  })

  it('knows nothing after the conversation was compacted, until the next reply', () => {
    const compaction: NativeChatMessage = {
      id: 'c',
      role: 'system',
      blocks: [{ type: 'text', text: 'Compacted', presentation: 'compaction' }],
      timestamp: null,
      source: 'transcript'
    }
    expect(
      transcriptContextUsageSummary([reply('a', 'claude-opus-5-5', 900_000), compaction], WINDOWS)
    ).toBeNull()
  })
})
