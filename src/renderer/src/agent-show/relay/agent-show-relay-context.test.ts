import { describe, expect, it } from 'vitest'
import { relayedShowContext } from './agent-show-relay-context'

const context = { worktreeId: 'w', worktreePath: '/box/w', ownerTabId: 'tab-1', focus: true }

describe('relayedShowContext', () => {
  it('declines a workspace this window shows for another host, or not at all', () => {
    expect(relayedShowContext('box', context, null)).toBeNull()
    expect(relayedShowContext('box', context, { kind: 'local' })).toBeNull()
    expect(
      relayedShowContext('box', context, { kind: 'environment', environmentId: 'other' })
    ).toBeNull()
  })

  it("keeps the box agent's own tab id as the owner, seen here or not", () => {
    // Why: 2026-11-17, owners were dropped when this window had not seen the tab (it names a box
    // tab web-terminal-<id>), so every box agent's show shared one owner-less slot and an
    // owner-less `orca show clear` from any shell ended another agent's tour.
    expect(
      relayedShowContext('box', context, { kind: 'environment', environmentId: 'box' })
    ).toEqual(context)
  })
})
