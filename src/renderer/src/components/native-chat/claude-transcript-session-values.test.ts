import { describe, expect, it } from 'vitest'
import {
  claudeTranscriptSessionValues,
  withClaudeHookEffort,
  withClaudeStartingEffort
} from './session/options/terminal/claude-terminal-session-options'

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

  it('never reads a newer point release as the shorter id it starts with', () => {
    // Why: Orca's cached host catalog lists `claude-fable-5` (Fable 5) and an older `fable`
    // alias (Fable 5.1); a Fable 5.2 reply showed "Fable 5".
    const discovered = [
      { id: 'fable', label: 'Fable 5.1', options: [] },
      { id: 'claude-fable-5', label: 'Fable 5', options: [] }
    ]
    expect(claudeTranscriptSessionValues('claude-fable-5-2', discovered, null)).toEqual({
      model: 'claude-fable-5-2'
    })
  })

  it('takes the alias whose label names the reply version', () => {
    const discovered = [
      { id: 'fable', label: 'Fable 5.2', options: [] },
      { id: 'claude-fable-5', label: 'Fable 5', options: [] }
    ]
    expect(claudeTranscriptSessionValues('claude-fable-5-2', discovered, null)).toEqual({
      model: 'fable'
    })
  })

  it('still matches a dated reply id to its listed model', () => {
    const discovered = [{ id: 'claude-haiku-4-5', label: 'Haiku 4.5', options: [] }]
    expect(claudeTranscriptSessionValues('claude-haiku-4-5-20251001', discovered, null)).toEqual({
      model: 'claude-haiku-4-5'
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

describe('a Claude chat shows an effort before Claude reports one', () => {
  const starting = { flag: null, byModel: { 'claude-opus-5-5': 'xhigh' }, fallback: 'high' }

  it('fills in the level Claude started the model at', () => {
    expect(withClaudeStartingEffort({ model: 'claude-opus-5-5' }, starting)).toEqual({
      model: 'claude-opus-5-5',
      effort: 'xhigh'
    })
    expect(withClaudeStartingEffort({ model: 'opus' }, starting)).toEqual({
      model: 'opus',
      effort: 'high'
    })
  })

  it('never overrides an effort Claude itself named', () => {
    expect(withClaudeStartingEffort({ model: 'opus', effort: 'low' }, starting)).toEqual({
      model: 'opus',
      effort: 'low'
    })
    expect(withClaudeStartingEffort({ model: 'opus' }, null)).toEqual({ model: 'opus' })
  })
})
