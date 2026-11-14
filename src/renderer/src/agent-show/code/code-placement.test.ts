import { describe, expect, it } from 'vitest'
import { chooseCodePlacement, type CodePlacementInput } from './code-placement'

const roomy: CodePlacementInput = {
  place: 'beside',
  ownerGroupId: 'chat',
  stageLeaves: ['a', 'b'],
  usedByOwner: ['b', 'a'],
  stageHasRoom: true,
  roomBelow: true,
  roomRight: true
}

describe('chooseCodePlacement', () => {
  it('makes a stage column right of the chat when there is none', () => {
    for (const place of ['beside', 'below', 'right', 'same'] as const) {
      expect(chooseCodePlacement({ ...roomy, place, stageLeaves: null, usedByOwner: [] })).toEqual({
        kind: 'split',
        sourceGroupId: 'chat',
        direction: 'right'
      })
    }
  })

  it('opens beside and same in the stage pane used last, never the chat', () => {
    expect(chooseCodePlacement(roomy)).toEqual({ kind: 'group', groupId: 'b' })
    expect(chooseCodePlacement({ ...roomy, place: 'same' })).toEqual({
      kind: 'group',
      groupId: 'b'
    })
    expect(chooseCodePlacement({ ...roomy, usedByOwner: [] })).toEqual({
      kind: 'group',
      groupId: 'a'
    })
  })

  it('splits the current pane below when every range still fits', () => {
    expect(chooseCodePlacement({ ...roomy, place: 'below' })).toEqual({
      kind: 'split',
      sourceGroupId: 'b',
      direction: 'down'
    })
  })

  it('reuses the pane used least recently instead of a split that would not fit', () => {
    expect(chooseCodePlacement({ ...roomy, place: 'below', roomBelow: false })).toEqual({
      kind: 'group',
      groupId: 'a',
      reusedForRoom: true
    })
  })

  it('treats right as below when the stage is too narrow for two columns', () => {
    expect(chooseCodePlacement({ ...roomy, place: 'right', roomRight: false })).toEqual({
      kind: 'split',
      sourceGroupId: 'b',
      direction: 'down'
    })
    expect(chooseCodePlacement({ ...roomy, place: 'right' })).toEqual({
      kind: 'split',
      sourceGroupId: 'b',
      direction: 'right'
    })
  })

  it('opens a background tab in the chat pane when no stage fits beside it', () => {
    expect(chooseCodePlacement({ ...roomy, stageHasRoom: false })).toEqual({
      kind: 'background',
      groupId: 'chat'
    })
  })

  it('leaves placement to the editor when there is no owner tab', () => {
    expect(chooseCodePlacement({ ...roomy, ownerGroupId: null })).toEqual({ kind: 'default' })
  })
})
