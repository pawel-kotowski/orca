import { describe, expect, it } from 'vitest'
import {
  estimateStripPx,
  floatingStripRect,
  stripAndPills,
  tourBandPx
} from './tour-strip-placement'
import { predictionMiss } from './tour-step-problems'

describe('floatingStripRect', () => {
  it('centres a 600 px strip 8 px above the bottom, whatever the layout', () => {
    expect(floatingStripRect({ width: 1280, height: 800 })).toEqual({
      left: 340,
      bottom: 8,
      width: 600,
      maxHeight: 240
    })
    expect(floatingStripRect({ width: 1600, height: 1000 })).toEqual({
      left: 500,
      bottom: 8,
      width: 600,
      maxHeight: 300
    })
  })

  it('narrows on a small window, keeping 16 px each side', () => {
    expect(floatingStripRect({ width: 500, height: 400 })).toEqual({
      left: 16,
      bottom: 8,
      width: 468,
      maxHeight: 120
    })
  })
})

describe('tourBandPx', () => {
  it('reserves the strip plus its gap above and below, and nothing without a strip', () => {
    expect(tourBandPx(80)).toBe(96)
    expect(tourBandPx(0)).toBe(0)
  })
})

describe('estimateStripPx', () => {
  it('sizes for the longest caption: 100 chars wrap to two lines in a 600 px strip', () => {
    // 22 chrome + 1 title line (18) + 2 caption lines (33).
    const steps = [
      { title: 'Short', caption: 'x'.repeat(100) },
      { title: 'Other', caption: 'y' }
    ]
    expect(estimateStripPx(steps, { width: 600, maxHeight: 240 })).toBe(73)
    expect(estimateStripPx(steps, { width: 600, maxHeight: 60 })).toBe(60)
  })
})

describe('predictionMiss', () => {
  it('warns only about kinds of problems the check did not predict', () => {
    expect(predictionMiss([], [])).toBeNull()
    expect(
      predictionMiss(['mark 1 (a.ts:1-9): only 8 of 9 lines fit'], ['only 7 of 9 lines fit'])
    ).toBeNull()
    expect(predictionMiss([], ['(a.ts:1-9) is not on screen; split the step'])).toBe(
      'the check did not expect this: (a.ts:1-9) is not on screen; split the step'
    )
  })
})

describe('stripAndPills', () => {
  const tour = { worktree: 'agent-show' }
  const other = { worktree: 'mos' }

  it('shows the strip in the tour workspace, a pill elsewhere, and the strip again on return', () => {
    let onScreen = 'agent-show'
    const drawn = (t: { worktree: string }): boolean => t.worktree === onScreen
    expect(stripAndPills([tour], drawn)).toEqual({ strip: tour, pills: [] })
    onScreen = '.agents'
    expect(stripAndPills([tour], drawn)).toEqual({ strip: undefined, pills: [tour] })
    onScreen = 'agent-show'
    expect(stripAndPills([tour], drawn)).toEqual({ strip: tour, pills: [] })
  })

  it('gives the one strip to the tour on screen and a pill to the other', () => {
    const drawn = (t: { worktree: string }): boolean => t.worktree === 'mos'
    expect(stripAndPills([tour, other], drawn)).toEqual({ strip: other, pills: [tour] })
  })
})
