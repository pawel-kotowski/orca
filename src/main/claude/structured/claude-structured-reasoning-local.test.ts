import { describe, expect, it, vi } from 'vitest'
import type { AgentJournalItemBody } from '../../../shared/agent-session/journal/agent-session-journal-types'
import { agentJournalItemKey } from '../../../shared/agent-session/journal/agent-session-journal-item-key'
import { createClaudeJournalTranslator } from './journal/claude-structured-journal-translation'

function setup() {
  const rows = new Map<string, AgentJournalItemBody>()
  const translator = createClaudeJournalTranslator({
    sink: {
      appendItem: (identity, body) => {
        if (body.kind !== 'turn') {
          rows.set(agentJournalItemKey(identity), body)
        }
      },
      appendTombstone: vi.fn(),
      publish: vi.fn()
    }
  })
  const final = (uuid: string, content: unknown[], observedAt?: number): void =>
    translator.handle({
      type: 'message',
      sessionId: 'orca-session',
      ...(observedAt === undefined ? {} : { observedAt }),
      message: {
        session_id: 'session',
        parent_tool_use_id: null,
        type: 'assistant',
        uuid,
        message: { id: 'message-1', role: 'assistant', content }
      }
    })
  return { rows, translator, final }
}

// Signature prefixes from a Claude Code 2.1.318 transcript (thinking display "updates").
const NARRATION_SIGNATURE =
  'CAQS/gUKEQgTGAI4AUIJbmFycmF0aW9uEgzdYleegWAASzwMDeoaDDzmjOvwDJT9tmgX6yIw8OiPMipcXfBDCeUPbySpZlpqAUSIHrUs2ezLgkGJb6tZGWHu'

describe('structured Claude reasoning (local)', () => {
  it('shows narration as the agent speaking, not as folded reasoning', () => {
    const { rows, final, translator } = setup()
    final(
      'narration',
      [{ type: 'thinking', thinking: 'Step 2 is on screen now.', signature: NARRATION_SIGNATURE }],
      5_000
    )
    expect([...rows.values()]).toEqual([
      {
        kind: 'message',
        role: 'assistant',
        blocks: [{ type: 'text', text: 'Step 2 is on screen now.' }]
      }
    ])
    translator.dispose()
  })
})
