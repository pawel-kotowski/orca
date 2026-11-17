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

describe('closedShowOwners for a box agent', () => {
  const key = (worktreeId: string, tab: string) => `${worktreeId}\u0000${tab}`

  it("finds a box agent's tab through this window's web-terminal mirror", () => {
    const tabs = { w1: [{ id: 'web-terminal-box-tab', entityId: 'pty' }] as Tab[] }
    expect(closedShowOwners([owner('w1', 'box-tab')], tabs)).toEqual([])
    expect(
      closedShowOwners([owner('w1', 'box-tab')], { w1: [] }, new Set([key('w1', 'box-tab')]))
    ).toHaveLength(1)
  })

  it('never calls a tab closed that this window has not seen open', () => {
    // Why: 2026-11-17, a tab made on the box a moment before its agent showed had not reached the
    // hidden laptop window; it must not read as closed and end the show.
    expect(closedShowOwners([owner('w1', 'box-tab')], { w1: [] }, new Set())).toEqual([])
  })
})
