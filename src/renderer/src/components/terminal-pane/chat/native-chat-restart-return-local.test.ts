import { describe, expect, it } from 'vitest'
import {
  chatRestartReturnStep,
  clearChatRestartReturns,
  hasChatRestartReturn,
  markChatRestartReturn
} from './native-chat-restart-return'

// Local-only test: a chat whose Claude limit-move (or the Slack bot) restarts in place returns
// to its Chat UI once the new Claude runs, and only a tab the exit itself moved.
describe('a chat restarted in place returns to Chat UI (local)', () => {
  const claude = { agent: 'claude' as const, shellForeground: false }
  const shell = { agent: null, shellForeground: true }

  it('waits for the shell, then returns when a new agent runs', () => {
    const mark = { sawShell: false }
    // The old Claude may still show for a moment after its exit.
    expect(chatRestartReturnStep(mark, claude)).toBe('wait')
    expect(chatRestartReturnStep(mark, shell)).toBe('saw-shell')
    mark.sawShell = true
    expect(chatRestartReturnStep(mark, shell)).toBe('wait')
    expect(chatRestartReturnStep(mark, undefined)).toBe('wait')
    expect(chatRestartReturnStep(mark, claude)).toBe('return')
  })

  const LEAF_1 = '11111111-1111-4111-8111-111111111111'
  const LEAF_2 = '22222222-2222-4222-8222-222222222222'

  it('marks only the panes the exit moved, and a view change clears the tab', () => {
    markChatRestartReturn('tab-a', LEAF_1)
    expect(hasChatRestartReturn('tab-a', LEAF_1)).toBe(true)
    expect(hasChatRestartReturn('tab-a', LEAF_2)).toBe(false)
    expect(hasChatRestartReturn('tab-b', LEAF_1)).toBe(false)
    clearChatRestartReturns('tab-a')
    expect(hasChatRestartReturn('tab-a', LEAF_1)).toBe(false)
  })
})
