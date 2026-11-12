import { describe, expect, it } from 'vitest'
import { decodeClaudeTranscriptLine } from './transcript-line-decoders-claude'

const SYNTHETIC_USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0
}

// A Claude Code 2.1 refusal row as its transcript stores it, trimmed to the fields that matter.
function refusal(text: string, overrides: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'assistant',
    uuid: 'limit-row',
    parentUuid: 'prompt-row',
    timestamp: '2026-10-18T14:06:35.460Z',
    isApiErrorMessage: true,
    message: {
      id: 'f90c72e1',
      model: '<synthetic>',
      role: 'assistant',
      stop_reason: 'stop_sequence',
      stop_sequence: '',
      type: 'message',
      usage: SYNTHETIC_USAGE,
      content: [{ type: 'text', text }]
    },
    ...overrides
  })
}

const SESSION_LIMIT = refusal("You've hit your session limit · resets 7:30pm (Europe/Warsaw)", {
  apiErrorStatus: 429,
  error: 'rate_limit',
  apiError: 'usage_limit_reached',
  apiErrorParams: {
    rate_limit_info: {
      status: 'rejected',
      resetsAt: 1792344600,
      rateLimitType: 'five_hour',
      overageStatus: 'rejected',
      isUsingOverage: false
    }
  }
})

describe('decodeClaudeTranscriptLine: Claude refusals', () => {
  it('reads a usage-limit hit as a warning row with its limit and the turn Continue picks up', () => {
    const message = decodeClaudeTranscriptLine(SESSION_LIMIT, 'fallback')
    expect(message).toMatchObject({
      id: 'limit-row',
      role: 'system',
      source: 'transcript',
      parentId: 'prompt-row',
      blocks: [
        {
          type: 'text',
          tone: 'warning',
          usageLimitTurnItemId: 'limit-row',
          failure: {
            kind: 'usageLimitReached',
            usageLimit: { window: 'session', resetsAt: 1792344600_000 },
            detail: { text: "You've hit your session limit · resets 7:30pm (Europe/Warsaw)" }
          }
        }
      ]
    })
    expect(message).not.toHaveProperty('model')
  })

  it('names the weekly window', () => {
    const line = SESSION_LIMIT.replace('five_hour', 'seven_day')
    const block = decodeClaudeTranscriptLine(line, 'fallback')?.blocks[0]
    expect(block).toMatchObject({ failure: { usageLimit: { window: 'weekly' } } })
  })

  it.each([
    [
      'a model that needs usage credits',
      'Fable 5.1 requires usage credits. Switch to another model, or manage usage credits.',
      { apiErrorStatus: 429, error: 'rate_limit', apiError: 'model_requires_usage_credits' }
    ],
    [
      'usage credits run out',
      "You're out of usage credits. Run /usage-credits to keep using Fable 5 or /model to switch models.",
      { apiErrorStatus: 429, error: 'rate_limit' }
    ]
  ])('shows %s as a plain warning, with no Continue', (_, text, fields) => {
    const message = decodeClaudeTranscriptLine(refusal(text, fields), 'fallback')
    expect(message).toMatchObject({ role: 'system', blocks: [{ text, tone: 'warning' }] })
    expect(message?.blocks[0]).not.toHaveProperty('failure')
    expect(message?.blocks[0]).not.toHaveProperty('usageLimitTurnItemId')
  })

  it('keeps any other API error as the reply Claude wrote', () => {
    const line = refusal('API Error: Connection lost mid-response.', {
      error: 'server_error',
      apiError: 'connection_failed'
    })
    expect(decodeClaudeTranscriptLine(line, 'fallback')).toMatchObject({
      role: 'assistant',
      blocks: [{ text: 'API Error: Connection lost mid-response.' }]
    })
  })
})
