import { describe, expect, it } from 'vitest'
import { chooseCodePlacement } from './code-placement'

describe('chooseCodePlacement', () => {
  it('splits right of the chat when the agent has not used a pane yet', () => {
    expect(
      chooseCodePlacement({
        place: 'right',
        ownerGroupId: 'chat',
        lastGroupId: null,
        beside: null
      })
    ).toEqual({ kind: 'split', sourceGroupId: 'chat', direction: 'right' })
  })

  it('splits below the pane the agent used last', () => {
    expect(
      chooseCodePlacement({
        place: 'below',
        ownerGroupId: 'chat',
        lastGroupId: 'code-a',
        beside: { groupId: 'code-a' }
      })
    ).toEqual({ kind: 'split', sourceGroupId: 'code-a', direction: 'down' })
  })

  it('reuses the last pane for same, and falls back to beside without one', () => {
    expect(
      chooseCodePlacement({
        place: 'same',
        ownerGroupId: 'chat',
        lastGroupId: 'code-a',
        beside: { groupId: 'other' }
      })
    ).toEqual({ kind: 'group', groupId: 'code-a' })
    expect(
      chooseCodePlacement({
        place: 'same',
        ownerGroupId: 'chat',
        lastGroupId: null,
        beside: { split: { sourceGroupId: 'chat' } }
      })
    ).toEqual({ kind: 'split', sourceGroupId: 'chat', direction: 'right' })
  })

  it('opens beside into the neighbour pane a chat link would use', () => {
    expect(
      chooseCodePlacement({
        place: 'beside',
        ownerGroupId: 'chat',
        lastGroupId: 'code-b',
        beside: { groupId: 'neighbour' }
      })
    ).toEqual({ kind: 'group', groupId: 'neighbour' })
  })

  it('leaves placement to the editor when there is no owner tab', () => {
    expect(
      chooseCodePlacement({ place: 'below', ownerGroupId: null, lastGroupId: null, beside: null })
    ).toEqual({ kind: 'default' })
    expect(
      chooseCodePlacement({ place: 'beside', ownerGroupId: null, lastGroupId: null, beside: null })
    ).toEqual({ kind: 'default' })
  })
})
