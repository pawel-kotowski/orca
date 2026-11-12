import { describe, expect, it } from 'vitest'
import { terminalChatThreadGoal } from './terminal-chat-thread-goal'
import { terminalChatWorkerApprovalParty } from '../../worker-approvals/use-terminal-chat-worker-approval-party'
import type { NativeChatMessage } from '../../../../../../shared/native-chat/native-chat-types'
import type { AgentJournalThreadGoal } from '../../../../../../shared/agent-session/journal/agent-session-journal-types'

const goal = (status: AgentJournalThreadGoal['status'], at: number): AgentJournalThreadGoal => ({
  objective: 'ship it',
  status,
  tokenBudget: null,
  tokensUsed: 0,
  timeUsedSeconds: 0,
  createdAt: at,
  updatedAt: at
})
const row = (
  id: string,
  timestamp: number,
  threadGoal?: NativeChatMessage['threadGoal']
): NativeChatMessage => ({
  id,
  role: threadGoal ? 'system' : 'assistant',
  blocks: [{ type: 'text', text: id }],
  timestamp,
  source: 'transcript',
  ...(threadGoal ? { threadGoal } : {})
})

describe('terminalChatThreadGoal', () => {
  it('shows the goal set last, timed from when it was set to the newest row', () => {
    const shown = terminalChatThreadGoal([
      row('set', 1_000, { state: 'set', goal: goal('active', 1_000) }),
      row('reply', 31_000)
    ])
    expect(shown).toMatchObject({ objective: 'ship it', status: 'active', timeUsedSeconds: 30 })
    expect(shown?.updatedAt).toBe(31_000)
  })

  it('shows nothing once the goal is met or cleared, or when none was set', () => {
    const set = row('set', 1_000, { state: 'set', goal: goal('active', 1_000) })
    expect(
      terminalChatThreadGoal([
        set,
        row('met', 2_000, { state: 'set', goal: goal('complete', 2_000) })
      ])
    ).toBeNull()
    expect(terminalChatThreadGoal([set, row('clear', 2_000, { state: 'cleared' })])).toBeNull()
    expect(terminalChatThreadGoal([row('reply', 1_000)])).toBeNull()
  })
})

describe('terminalChatWorkerApprovalParty', () => {
  it("is the pane's terminal handle on this machine only", () => {
    expect(terminalChatWorkerApprovalParty({ kind: 'local' }, 'term_a1')).toBe('term_a1')
    expect(
      terminalChatWorkerApprovalParty({ kind: 'environment', environmentId: 'box' }, 'term_a1')
    ).toBeNull()
    expect(terminalChatWorkerApprovalParty({ kind: 'local' }, null)).toBeNull()
    expect(terminalChatWorkerApprovalParty(null, 'term_a1')).toBeNull()
  })
})
