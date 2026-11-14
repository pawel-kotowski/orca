import { describe, expect, it } from 'vitest'
import { codeColumnsAtFloor, codeFontFloor, fitCodeFont, stackPaneShares } from './code-fit'

describe('codeFontFloor', () => {
  it('is 11 px or the user size minus 3, whichever is larger, never above the user size', () => {
    expect(codeFontFloor(14)).toBe(11)
    expect(codeFontFloor(18)).toBe(15)
    expect(codeFontFloor(10)).toBe(10)
  })
})

describe('fitCodeFont', () => {
  const user = { fontSize: 14, lineHeight: 0 }
  // A 20-line range where two lines wrap at 13px and below: 22 rows of font * 1.5 px.
  const wrapped = (fontSize: number): number =>
    (fontSize >= 14 ? 20 : 22) * Math.round(fontSize * 1.5)

  it('keeps the user font when the measured block fits', () => {
    expect(
      fitCodeFont({ availablePx: 420, user, autoLineHeightRatio: 1.5, measureBlockPx: wrapped })
    ).toEqual({ fontSize: 14, lineHeight: 0, blockPx: 420, fits: true })
  })

  it('steps down until the measured block, wrapped rows included, fits', () => {
    // 14px: 420 > 400; 13px: 22 * 20 = 440; 12px: 22 * 18 = 396.
    expect(
      fitCodeFont({ availablePx: 400, user, autoLineHeightRatio: 1.5, measureBlockPx: wrapped })
    ).toEqual({ fontSize: 12, lineHeight: 0, blockPx: 396, fits: true })
  })

  it('stops at the floor when nothing fits', () => {
    expect(
      fitCodeFont({ availablePx: 200, user, autoLineHeightRatio: 1.5, measureBlockPx: wrapped })
    ).toEqual({ fontSize: 11, lineHeight: 0, blockPx: 374, fits: false })
  })

  it('scales a pixel line height with the font', () => {
    const asked: number[] = []
    fitCodeFont({
      availablePx: 0,
      user: { fontSize: 14, lineHeight: 22 },
      autoLineHeightRatio: 1.5,
      measureBlockPx: (_font, lineHeight) => {
        asked.push(lineHeight)
        return 1
      }
    })
    expect(asked).toEqual([22, 20, 19, 17])
  })
})

describe('codeColumnsAtFloor', () => {
  it('counts monospace columns at the floor font after the gutter', () => {
    // 11px * 0.6 = 6.6px per column; (460 - 56) / 6.6 = 61.
    expect(codeColumnsAtFloor(460, 56, 14)).toBe(61)
  })
})

describe('stackPaneShares', () => {
  const small = { floorPx: 240, userPx: 290 }
  const large = { floorPx: 350, userPx: 450 }

  it('gives every pane its need at your font, and the surplus in proportion', () => {
    // 1000 - 2 * 80 = 840 for editors; 740 needed at 14px; 100 spare split 290:450.
    const [a, b] = stackPaneShares([small, large], 1000, 80)
    expect(Math.round(a!)).toBe(409)
    expect(Math.round(b!)).toBe(591)
  })

  it('covers every floor first when the user font does not fit', () => {
    // 760 - 160 = 600 for editors: floors take 590, the 10 left goes 50:100.
    const [a, b] = stackPaneShares([small, large], 760, 80)
    expect(Math.round(a!)).toBe(323)
    expect(Math.round(b!)).toBe(437)
  })
})
