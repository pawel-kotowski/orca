import { describe, expect, it } from 'vitest'
import {
  claudeTranscriptSessionValues,
  withClaudeHookEffort
} from './claude-terminal-session-options'

describe('a Claude chat names its model from the transcript when the startup frame is gone', () => {
  it('matches a reply model id to the seed family, with the hook effort', () => {
    expect(claudeTranscriptSessionValues('claude-opus-5-5', undefined, 'high')).toEqual({
      model: 'opus',
      effort: 'high'
    })
  })

  it('prefers a discovered exact model over the seed family', () => {
    const discovered = [{ id: 'claude-opus-5-5', label: 'Opus 5.5', options: [] }]
    expect(claudeTranscriptSessionValues('claude-opus-5-5', discovered, null)).toEqual({
      model: 'claude-opus-5-5'
    })
  })

  it('names nothing for a synthetic reply or no reply', () => {
    expect(claudeTranscriptSessionValues('<synthetic>', undefined, 'high')).toBeNull()
    expect(claudeTranscriptSessionValues(null, undefined, 'high')).toBeNull()
  })

  it('lets the live hook effort replace the startup frame effort', () => {
    expect(withClaudeHookEffort({ model: 'opus', effort: 'medium' }, 'xhigh')).toEqual({
      model: 'opus',
      effort: 'xhigh'
    })
  })
})
