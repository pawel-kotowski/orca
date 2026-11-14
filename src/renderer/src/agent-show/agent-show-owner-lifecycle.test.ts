import { describe, expect, it } from 'vitest'
import type { Tab } from '../../../shared/tab-types'
import { closedShowOwners } from './agent-show-owner-lifecycle'

const owner = (worktreeId: string, ownerTabId: string) => ({
  worktreeId,
  worktreePath: '/w',
  ownerTabId,
  focus: false
})

describe('closedShowOwners', () => {
  it('finds owners whose chat or terminal tab has closed', () => {
    const tabs = {
      w1: [
        { id: 'term-1', entityId: 'pty-1' },
        { id: 'chat-tab', entityId: 'structured-agent-session-a' }
      ] as Tab[]
    }
    const owners = [
      owner('w1', 'term-1'),
      owner('w1', 'structured-agent-session-a'),
      owner('w1', 'gone'),
      owner('w2', 'term-1')
    ]
    expect(closedShowOwners(owners, tabs).map((o) => `${o.worktreeId}/${o.ownerTabId}`)).toEqual([
      'w1/gone',
      'w2/term-1'
    ])
  })
})
