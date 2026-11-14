import { describe, expect, it } from 'vitest'
import { showOwnerTabId } from './show-owner-tab'

describe('showOwnerTabId', () => {
  it('uses the terminal tab when there is one', () => {
    expect(showOwnerTabId({ ORCA_TAB_ID: 'tab-1', ORCA_AGENT_SESSION_ID: 'claude_x' })).toBe(
      'tab-1'
    )
  })

  it("derives a chat agent's tab from its session id", () => {
    expect(showOwnerTabId({ ORCA_AGENT_SESSION_ID: 'claude_a2fe' })).toBe(
      'structured-agent-session-claude_a2fe'
    )
  })

  it('has no owner outside Orca', () => {
    expect(showOwnerTabId({})).toBeNull()
  })
})
