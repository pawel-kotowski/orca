import { describe, expect, it } from 'vitest'
import { decodeClaudeTranscriptLine } from './transcript-line-decoders-claude'

// A Claude Code 2.1.318 away recap, as its transcript stores it.
const recapLine = JSON.stringify({
  parentUuid: 'turn-end',
  isSidechain: false,
  type: 'system',
  subtype: 'away_summary',
  content:
    'Goal: restart the bot. Next: once robo answers, check what runs there. (disable recaps in /config)',
  timestamp: '2026-11-04T14:22:25.028Z',
  uuid: 'recap-1',
  isMeta: false
})

describe('decodeClaudeTranscriptLine: away recap', () => {
  it('shows the recap the terminal shows, without its settings hint', () => {
    expect(decodeClaudeTranscriptLine(recapLine, 'fallback')).toEqual({
      id: 'recap-1',
      role: 'system',
      blocks: [
        {
          type: 'text',
          text: 'Recap: Goal: restart the bot. Next: once robo answers, check what runs there.'
        }
      ],
      timestamp: Date.parse('2026-11-04T14:22:25.028Z'),
      source: 'transcript',
      parentId: 'turn-end'
    })
  })

  it('still drops other system rows', () => {
    const line = JSON.stringify({
      type: 'system',
      subtype: 'turn_duration',
      durationMs: 1,
      uuid: 'd'
    })
    expect(decodeClaudeTranscriptLine(line, 'fallback')).toBeNull()
  })
})
