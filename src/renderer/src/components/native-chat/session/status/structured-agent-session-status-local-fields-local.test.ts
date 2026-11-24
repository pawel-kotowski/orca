import { describe, expect, it } from 'vitest'
import { projectStructuredAgentSessionStatusSummary } from '../../../../../../shared/agent-session/view/structured-agent-session-projection'
import { structuredAgentSessionLocalClocks } from '../../../../../../shared/agent-session/view/structured-agent-session-local-status'
import type { AgentJournalRenderItem } from '../../../../../../shared/agent-session/journal/agent-session-journal-types'
import {
  structuredStatusLocalFieldsMatch,
  structuredStatusLocalPayload
} from './structured-agent-session-status-local-fields'

function turn(turnId: string, fields: Record<string, unknown>, observedAt: number) {
  return {
    itemId: turnId,
    sequence: observedAt,
    observedAt,
    body: { kind: 'turn', turnId, ...fields }
  } as unknown as AgentJournalRenderItem
}

describe('the clocks of a chat row', () => {
  it('a finished compaction stamps the row until the chat goes on', () => {
    const done = { state: 'completed', outcome: 'success', completedAt: 50 }
    expect(
      structuredAgentSessionLocalClocks({ observedAt: 10 }, turn('compact:a', done, 40))
    ).toEqual({ turnStartedAt: 10, compactedAt: 50 })
    expect(
      structuredAgentSessionLocalClocks(
        { observedAt: 10 },
        turn('compact:a', { ...done, outcome: 'failure' }, 40)
      )
    ).toEqual({ turnStartedAt: 10 })
    expect(structuredAgentSessionLocalClocks({ observedAt: 60 }, turn('t2', done, 60))).toEqual({
      turnStartedAt: 60
    })
  })

  it('a /compact neither counts as your prompt nor moves the end of the turn before it', () => {
    const user = (itemId: string, observedAt: number, command?: object) =>
      ({
        itemId,
        sequence: observedAt,
        observedAt,
        body: {
          kind: 'message',
          role: 'user',
          blocks: [{ type: 'text', text: itemId }],
          ...(command ? { command } : {})
        }
      }) as unknown as AgentJournalRenderItem
    const items = [
      user('ask', 10),
      turn(
        't1',
        { state: 'completed', outcome: 'success', userItemId: 'ask', completedAt: 20 },
        11
      ),
      user('compact', 30, { name: 'compact' }),
      turn(
        'compact:c',
        { state: 'completed', outcome: 'success', userItemId: 'compact', completedAt: 40 },
        31
      )
    ]
    expect(projectStructuredAgentSessionStatusSummary(items)).toMatchObject({
      status: 'idle',
      statusStartedAt: 20,
      turnStartedAt: 10,
      compactedAt: 40
    })
  })

  it('a working row drops the stamp, and an older host’s silence never rewrites a row', () => {
    const reachOut = { message: 'look', at: 5 }
    expect(structuredStatusLocalPayload('working', { compactedAt: 4, reachOut })).toEqual({
      reachOut
    })
    expect(structuredStatusLocalFieldsMatch({ reachOut, turnStartedAt: 3 } as never, {}, {})).toBe(
      true
    )
    expect(
      structuredStatusLocalFieldsMatch(
        { reachOut } as never,
        { reachOut: { ...reachOut, at: 6 } },
        {}
      )
    ).toBe(false)
  })
})
