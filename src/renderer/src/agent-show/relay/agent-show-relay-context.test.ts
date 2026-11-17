import { describe, expect, it } from 'vitest'
import { toWebTerminalSurfaceTabId } from '../../../../shared/workspace-layout/terminal-surface-id'
import { relayedOwnerTab, relayedShowContext } from './agent-show-relay-context'

const context = { worktreeId: 'w', worktreePath: '/box/w', ownerTabId: 'tab-1', focus: true }
const box = { kind: 'environment' as const, environmentId: 'box' }

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

  it("owns the show by this window's mirror of the box agent's terminal tab", () => {
    // Why: 2026-11-17, a box agent's tour played owner-less because the laptop names the box's
    // tab d6d2… as web-terminal-d6d2…; any other owner-less show in the workspace could end it.
    const mirrored = toWebTerminalSurfaceTabId('tab-1')
    expect(
      relayedShowContext('box', context, {
        ownerTarget: box,
        tabs: [{ id: 'web-terminal-other' }, { id: mirrored }]
      })
    ).toEqual({ ...context, ownerTabId: mirrored })
  })

  it('finds a per-pane mirror, an agent-session tab by entity id, and a tab with the same id', () => {
    const pane = toWebTerminalSurfaceTabId('tab-1::leaf-2')
    expect(relayedOwnerTab('tab-1', [{ id: pane }])?.id).toBe(pane)
    expect(relayedOwnerTab('tab-1', [{ id: 'x', entityId: 'tab-1' }])?.id).toBe('x')
    expect(relayedOwnerTab('tab-1', [{ id: 'tab-1' }])?.id).toBe('tab-1')
    expect(relayedOwnerTab('tab-1', [{ id: toWebTerminalSurfaceTabId('tab-10') }])).toBeUndefined()
  })

  it('shows without an owner while this window has not seen the tab', () => {
    expect(relayedShowContext('box', context, { ownerTarget: box, tabs: undefined })).toEqual({
      ...context,
      ownerTabId: null
    })
  })
})
