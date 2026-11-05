import { describe, expect, it } from 'vitest'
import { decodeClaudeTranscriptLine } from './transcript-line-decoders-claude'

// A Claude Code 2.1.318 reply as its transcript stores it, trimmed to the fields that matter here.
function reply(overrides: Record<string, unknown> = {}, usage: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: 'assistant',
    uuid: 'reply-1',
    isSidechain: false,
    timestamp: '2026-11-05T17:21:27.891Z',
    message: {
      id: 'msg_1',
      model: 'claude-opus-5-5',
      role: 'assistant',
      content: [{ type: 'text', text: 'Done.' }],
      usage: {
        input_tokens: 10,
        cache_creation_input_tokens: 23_892,
        cache_read_input_tokens: 225_932,
        output_tokens: 1_091,
        ...usage
      }
    },
    ...overrides
  })
}

describe('decodeClaudeTranscriptLine: the model and its token accounting', () => {
  it('keeps the serving model and the usage Claude reported for the reply', () => {
    expect(decodeClaudeTranscriptLine(reply(), 'fallback')).toMatchObject({
      role: 'assistant',
      model: 'claude-opus-5-5',
      usage: {
        inputTokens: 10,
        cacheCreationInputTokens: 23_892,
        cacheReadInputTokens: 225_932,
        outputTokens: 1_091
      }
    })
  })

  it("leaves out a subagent's reply, which measures the subagent's context", () => {
    const message = decodeClaudeTranscriptLine(reply({ isSidechain: true }), 'fallback')
    expect(message).not.toHaveProperty('usage')
    expect(message).not.toHaveProperty('model')
  })

  it('leaves out a synthetic reply that reports no tokens', () => {
    const line = reply(
      {},
      {
        input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 0
      }
    )
    expect(decodeClaudeTranscriptLine(line, 'fallback')).not.toHaveProperty('usage')
  })
})
