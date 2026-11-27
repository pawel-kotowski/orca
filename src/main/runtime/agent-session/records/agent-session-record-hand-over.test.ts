import { describe, expect, it } from 'vitest'
import { isPersistedAgentSessionObservationRecord } from '../../../../shared/agent-session/lifecycle/agent-session-record'
import { isAgentSessionHandover } from '../../../../shared/agent-session/lifecycle/agent-session-handover'
import { applyAgentSessionRecordCommand } from './agent-session-record-command'
import { foundAgentSessionRecord } from './agent-session-record-founding'

describe('a chat hands its conversation over', () => {
  it('records where it went on, and the record still reads back', () => {
    const record = foundAgentSessionRecord(
      {
        sessionId: 'old-chat-0001',
        location: {
          executionHostId: 'local',
          wslDistro: null,
          workspaceId: 'w',
          workspaceKind: 'git-worktree'
        },
        provider: 'claude',
        accountHome: { variable: 'CLAUDE_CONFIG_DIR', path: '/home/me/.claude' }
      },
      { claimKeyId: 'key', now: 1 }
    )
    const { record: next } = applyAgentSessionRecordCommand(record, {
      kind: 'hand-over',
      to: 'new-chat-0001',
      name: 'wake (went on in a new chat)',
      now: 5
    })
    expect(next.handedOverTo).toEqual({ sessionId: 'new-chat-0001', at: 5 })
    expect(isPersistedAgentSessionObservationRecord(next)).toBe(true)
    expect(isAgentSessionHandover(next.handedOverTo)).toBe(true)
    expect(next.conversationName).toBe('wake (went on in a new chat)')
    // Handed back only by the chat it points at.
    const other = applyAgentSessionRecordCommand(next, {
      kind: 'hand-back',
      from: 'someone-else',
      name: 'wake',
      now: 6
    }).record
    expect(other.handedOverTo?.sessionId).toBe('new-chat-0001')
    const back = applyAgentSessionRecordCommand(next, {
      kind: 'hand-back',
      from: 'new-chat-0001',
      name: 'wake',
      now: 6
    }).record
    expect(back.handedOverTo).toBeUndefined()
    expect(back.conversationName).toBe('wake')
    expect(isAgentSessionHandover({ sessionId: 7, at: 1 })).toBe(false)
  })
})
