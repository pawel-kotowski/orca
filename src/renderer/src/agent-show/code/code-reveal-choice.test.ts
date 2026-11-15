import { describe, expect, it } from 'vitest'
import { chooseCodeReveal } from './code-reveal-choice'

// A block from 400 to 600 px in a 300 px viewport: whole for scrollTop 300..400.
const blockShownAt = (scrollTop: number): boolean => scrollTop <= 400 && scrollTop + 300 >= 600
const base = { moved: false, placedScrollTop: 350, currentScrollTop: 350, blockShownAt }

describe('chooseCodeReveal', () => {
  it('places a moved block again whatever the mode', () => {
    for (const mode of ['centre', 'if-cut', 'restore', 'none'] as const) {
      expect(chooseCodeReveal({ ...base, mode, moved: true })).toEqual({ kind: 'centre' })
    }
  })

  it('puts back the last placement after another reveal moved the editor', () => {
    expect(chooseCodeReveal({ ...base, mode: 'restore', currentScrollTop: 210 })).toEqual({
      kind: 'scroll',
      scrollTop: 350
    })
  })

  it('recentres instead when the last placement would now cut the block, or there is none', () => {
    expect(chooseCodeReveal({ ...base, mode: 'restore', placedScrollTop: 250 })).toEqual({
      kind: 'centre'
    })
    expect(chooseCodeReveal({ ...base, mode: 'restore', placedScrollTop: null })).toEqual({
      kind: 'centre'
    })
  })

  it('leaves a whole block where it is for if-cut and scrolls only a cut one', () => {
    expect(chooseCodeReveal({ ...base, mode: 'if-cut' })).toBeNull()
    expect(chooseCodeReveal({ ...base, mode: 'if-cut', currentScrollTop: 420 })).toEqual({
      kind: 'centre'
    })
  })

  it('never scrolls for none', () => {
    expect(chooseCodeReveal({ ...base, mode: 'none', currentScrollTop: 0 })).toBeNull()
  })
})
