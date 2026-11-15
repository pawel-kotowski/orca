import { describe, expect, it } from 'vitest'
import { stepEntryClears, stepHoldMs, stepRequests, tourTargetStep } from './tour-steps'

describe('stepHoldMs', () => {
  it('holds a step long enough to read its caption, between 6 and 20 seconds', () => {
    expect(stepHoldMs({ caption: 'Short.', holdMs: null })).toBe(6000)
    // 4000 + 60 * 100 = 10000
    expect(stepHoldMs({ caption: 'x'.repeat(100), holdMs: null })).toBe(10000)
    expect(stepHoldMs({ caption: 'x'.repeat(1000), holdMs: null })).toBe(20000)
    expect(stepHoldMs({ caption: 'x'.repeat(1000), holdMs: 3000 })).toBe(3000)
  })
})

describe('stepEntryClears', () => {
  const code = {
    kind: 'code' as const,
    filePath: 'a.ts',
    range: { startLine: 1, endLine: 4 },
    place: 'below' as const,
    keepOthers: true
  }
  const tree = { kind: 'tree' as const, entries: [{ path: 'src' }], expand: false, dimOthers: true }

  it('clears code only for a step without code, folders only for a step with its own', () => {
    expect(stepEntryClears({ requests: [] })).toEqual({ code: true, ui: true, tree: false })
    expect(stepEntryClears({ requests: [code, tree] })).toEqual({
      code: false,
      ui: true,
      tree: true
    })
  })

  it("makes a step's first code show replace the last step's marks, later ones keep", () => {
    expect(
      stepRequests({ requests: [tree, code, code] }).map((r) => r.kind === 'code' && r.keepOthers)
    ).toEqual([false, false, true])
  })
})

describe('tourTargetStep', () => {
  it('moves within the tour and stops at its ends', () => {
    expect(tourTargetStep('next', 0, 3)).toBe(1)
    expect(tourTargetStep('next', 2, 3)).toBeNull()
    expect(tourTargetStep('back', 0, 3)).toBeNull()
    expect(tourTargetStep('step', 0, 3, 3)).toBe(2)
    expect(tourTargetStep('step', 0, 3, 4)).toBeNull()
  })
})
