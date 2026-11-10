import { describe, expect, it } from 'vitest'
import { readEffortFlag, readEffortSettings } from './claude-session-effort'
import { claudeStartingEffort } from '../../shared/native-chat/claude-session-effort-types'

describe('the effort a Claude session started with', () => {
  it('reads an --effort flag from the process command', () => {
    expect(readEffortFlag('claude --effort max --resume abc')).toBe('max')
    expect(readEffortFlag('claude --effort=low')).toBe('low')
    expect(readEffortFlag('claude --dangerously-skip-permissions')).toBeNull()
  })

  it("reads the config folder's saved levels, per model and overall", () => {
    expect(
      readEffortSettings({
        effortLevel: 'high',
        modelSettings: {
          'claude-fable-5-1': { effortLevel: 'medium' },
          'claude-opus-5-5': { effortLevel: 'xhigh' },
          broken: { effortLevel: 7 }
        }
      })
    ).toEqual({
      byModel: { 'claude-fable-5-1': 'medium', 'claude-opus-5-5': 'xhigh' },
      fallback: 'high'
    })
    expect(readEffortSettings(null)).toEqual({ byModel: {}, fallback: null })
  })

  it("applies Claude's own order: flag, then the model's level, then the folder's", () => {
    const settings = { flag: null, byModel: { 'claude-opus-5-5': 'xhigh' }, fallback: 'high' }
    expect(claudeStartingEffort(settings, 'claude-opus-5-5')).toBe('xhigh')
    expect(claudeStartingEffort(settings, 'claude-fable-5-2')).toBe('high')
    expect(claudeStartingEffort({ ...settings, flag: 'low' }, 'claude-opus-5-5')).toBe('low')
    expect(claudeStartingEffort(null, 'claude-opus-5-5')).toBeNull()
  })
})
