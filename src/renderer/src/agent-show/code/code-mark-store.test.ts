import { describe, expect, it } from 'vitest'
import { placeOwnerCodeMark } from './code-mark-store'

const A = '/repo/a.ts'
const B = '/repo/b.ts'

describe('placeOwnerCodeMark', () => {
  const previous = new Map([
    [A, [{ mark: '1', startLine: 10, endLine: 12 }]],
    [B, [{ mark: '2', startLine: 3, endLine: 4, note: 'old' }]]
  ])

  it("replaces all of the owner's marks by default and numbers from 1", () => {
    const { marks, placed } = placeOwnerCodeMark(previous, B, { startLine: 40, endLine: 62 }, false)
    expect(placed).toEqual({ mark: '1', startLine: 40, endLine: 62 })
    expect([...marks]).toEqual([[B, [{ mark: '1', startLine: 40, endLine: 62 }]]])
  })

  it('keeps others with keepOthers and takes the next free number', () => {
    const { marks, placed } = placeOwnerCodeMark(
      previous,
      A,
      { startLine: 1, endLine: 2, note: 'entry' },
      true
    )
    expect(placed.mark).toBe('3')
    expect(marks.get(A)).toEqual([
      { mark: '3', startLine: 1, endLine: 2, note: 'entry' },
      { mark: '1', startLine: 10, endLine: 12 }
    ])
    expect(marks.get(B)).toEqual([{ mark: '2', startLine: 3, endLine: 4, note: 'old' }])
  })

  it('moves a reused label instead of showing it twice', () => {
    const { marks } = placeOwnerCodeMark(
      previous,
      A,
      { mark: '2', startLine: 20, endLine: 20 },
      true
    )
    expect(marks.has(B)).toBe(false)
    expect(marks.get(A)?.map((mark) => mark.mark)).toEqual(['1', '2'])
  })

  it('replaces a kept mark whose lines overlap the new one on the same file', () => {
    const { marks, placed } = placeOwnerCodeMark(
      previous,
      A,
      { startLine: 12, endLine: 15, note: 'narrower' },
      true
    )
    expect(placed.mark).toBe('1')
    expect(marks.get(A)).toEqual([{ mark: '1', startLine: 12, endLine: 15, note: 'narrower' }])
    expect(marks.get(B)).toEqual([{ mark: '2', startLine: 3, endLine: 4, note: 'old' }])
  })
})
