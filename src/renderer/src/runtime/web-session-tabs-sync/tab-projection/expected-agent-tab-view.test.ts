import { afterEach, describe, expect, it } from 'vitest'
import {
  claimExpectedAgentTabView,
  expectAgentTabChatView,
  resetExpectedAgentTabViewsForTests
} from './expected-agent-tab-view'

afterEach(() => resetExpectedAgentTabViewsForTests())

describe('the first agent tab of a remote workspace opens in its Chat UI', () => {
  it('claims the first agent tab only, tells the host once, keeps it across rebuilds', () => {
    expectAgentTabChatView('wt', 1_000)
    expect(claimExpectedAgentTabView('wt', 'shell-tab', undefined, 1_001)).toBeNull()
    expect(claimExpectedAgentTabView('wt', 'agent-tab', 'claude', 1_002)).toEqual({
      viewMode: 'chat',
      tell: true
    })
    expect(claimExpectedAgentTabView('wt', 'agent-tab', 'claude', 1_003)).toEqual({
      viewMode: 'chat',
      tell: false
    })
    expect(claimExpectedAgentTabView('wt', 'second-agent', 'claude', 1_004)).toBeNull()
    expect(claimExpectedAgentTabView('other', 'agent-tab', 'claude', 1_005)).toBeNull()
  })

  it('expires', () => {
    expectAgentTabChatView('wt', 1_000)
    expect(claimExpectedAgentTabView('wt', 'agent-tab', 'claude', 1_000 + 120_001)).toBeNull()
  })
})
