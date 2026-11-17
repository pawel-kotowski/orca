import { describe, expect, it } from 'vitest'
import { relayedShowContext } from './agent-show-relay-context'

const context = { worktreeId: 'w', worktreePath: '/box/w', ownerTabId: 'tab-1', focus: true }

describe('relayedShowContext', () => {
  it('declines a workspace this window shows for another host, or not at all', () => {
    expect(relayedShowContext('box', context, { ownerTarget: null, tabs: [] })).toBeNull()
    expect(
      relayedShowContext('box', context, { ownerTarget: { kind: 'local' }, tabs: [] })
    ).toBeNull()
    expect(
      relayedShowContext('box', context, {
        ownerTarget: { kind: 'environment', environmentId: 'other' },
        tabs: []
      })
    ).toBeNull()
  })

  it("keeps the agent's tab when this window has it, else shows without an owner", () => {
    const ownerTarget = { kind: 'environment' as const, environmentId: 'box' }
    expect(relayedShowContext('box', context, { ownerTarget, tabs: [{ id: 'tab-1' }] })).toEqual(
      context
    )
    expect(
      relayedShowContext('box', context, { ownerTarget, tabs: [{ id: 'x', entityId: 'tab-1' }] })
    ).toEqual(context)
    expect(relayedShowContext('box', context, { ownerTarget, tabs: undefined })).toEqual({
      ...context,
      ownerTabId: null
    })
  })
})
