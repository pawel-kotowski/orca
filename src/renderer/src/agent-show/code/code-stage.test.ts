import { describe, expect, it } from 'vitest'
import type { TabGroupLayoutNode } from '../../../../shared/tab-types'
import { findCodeStage, stackSplitRatios, verticalStackAround } from './code-stage'

const leaf = (groupId: string): TabGroupLayoutNode => ({ type: 'leaf', groupId })
const split = (
  direction: 'horizontal' | 'vertical',
  first: TabGroupLayoutNode,
  second: TabGroupLayoutNode
): TabGroupLayoutNode => ({ type: 'split', direction, first, second })

describe('findCodeStage', () => {
  it('is the column right of the chat', () => {
    const layout = split('horizontal', leaf('chat'), split('vertical', leaf('a'), leaf('b')))
    expect(findCodeStage(layout, 'chat')).toEqual({ path: ['second'], leaves: ['a', 'b'] })
  })

  it('skips the chat column’s own stacking', () => {
    const layout = split('horizontal', split('vertical', leaf('chat'), leaf('term')), leaf('a'))
    expect(findCodeStage(layout, 'chat')).toEqual({ path: ['second'], leaves: ['a'] })
  })

  it('is none when the chat is alone or the rightmost column', () => {
    expect(findCodeStage(leaf('chat'), 'chat')).toBeNull()
    expect(findCodeStage(split('horizontal', leaf('a'), leaf('chat')), 'chat')).toBeNull()
  })
})

describe('verticalStackAround', () => {
  it('climbs vertical splits inside the stage only', () => {
    const layout = split(
      'horizontal',
      leaf('chat'),
      split('horizontal', split('vertical', leaf('a'), leaf('b')), leaf('c'))
    )
    expect(verticalStackAround(layout, ['second'], 'b')).toEqual({
      path: ['second', 'first'],
      leaves: ['a', 'b']
    })
    expect(verticalStackAround(layout, ['second'], 'c')).toEqual({
      path: ['second', 'second'],
      leaves: ['c']
    })
  })
})

describe('stackSplitRatios', () => {
  it('gives each pane height in proportion to its need', () => {
    const layout = split(
      'horizontal',
      leaf('chat'),
      split('vertical', leaf('a'), split('vertical', leaf('b'), leaf('c')))
    )
    const need: Record<string, number> = { a: 200, b: 100, c: 100 }
    expect(stackSplitRatios(layout, ['second'], (id) => need[id] ?? 0)).toEqual([
      { path: 'second.second', ratio: 0.5 },
      { path: 'second', ratio: 0.5 }
    ])
    need.a = 600
    expect(stackSplitRatios(layout, ['second'], (id) => need[id] ?? 0)[1]).toEqual({
      path: 'second',
      ratio: 0.75
    })
  })
})
