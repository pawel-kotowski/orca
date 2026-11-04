import { describe, expect, it } from 'vitest'
import { isClaudeNarrationThinking } from './claude-narration-thinking'
import { decodeClaudeTranscriptLine } from './transcript-line-decoders-claude'

// Signature prefixes from a Claude Code 2.1.318 transcript (thinking display "updates").
const NARRATION_SIGNATURE =
  'CAQS/gUKEQgTGAI4AUIJbmFycmF0aW9uEgzdYleegWAASzwMDeoaDDzmjOvwDJT9tmgX6yIw8OiPMipcXfBDCeUPbySpZlpqAUSIHrUs2ezLgkGJb6tZGWHu'
const THINKING_SIGNATURE =
  'CAQSugUKEAgTGAI4AUIIdGhpbmtpbmcSDCstViSU5uOzB4it5RoMR//w21wwXjnSnEY9IjBmEn+4k3GUMtzXqxkZa8Jx1qFwuTb95O3TZ51ilLRahWRE/CEO'

function assistantLine(content: unknown[]): string {
  return JSON.stringify({
    type: 'assistant',
    uuid: 'a1',
    timestamp: '2026-11-04T15:19:21.685Z',
    message: { id: 'msg_1', role: 'assistant', content }
  })
}

describe('Claude narration thinking', () => {
  it('tells narration from real thinking by its signature and text', () => {
    expect(
      isClaudeNarrationThinking({
        type: 'thinking',
        thinking: 'Checking the transcript next.',
        signature: NARRATION_SIGNATURE
      })
    ).toBe(true)
    expect(
      isClaudeNarrationThinking({ type: 'thinking', thinking: '', signature: THINKING_SIGNATURE })
    ).toBe(false)
    expect(
      isClaudeNarrationThinking({ type: 'thinking', thinking: '', signature: NARRATION_SIGNATURE })
    ).toBe(false)
  })

  it('decodes narration as the agent speaking, and real thinking as reasoning', () => {
    const narration = decodeClaudeTranscriptLine(
      assistantLine([
        {
          type: 'thinking',
          thinking: 'Checking the transcript next.',
          signature: NARRATION_SIGNATURE
        }
      ]),
      'f1'
    )
    expect(narration?.role).toBe('assistant')
    expect(narration?.blocks).toEqual([{ type: 'text', text: 'Checking the transcript next.' }])
    const thinking = decodeClaudeTranscriptLine(
      assistantLine([
        { type: 'thinking', thinking: 'Weighing options.', signature: THINKING_SIGNATURE }
      ]),
      'f2'
    )
    expect(thinking?.role).toBe('reasoning')
  })
})
