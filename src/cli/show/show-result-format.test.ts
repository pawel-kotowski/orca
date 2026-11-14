import { describe, expect, it } from 'vitest'
import { formatCodeFit } from './show-result-format'

describe('formatCodeFit', () => {
  it('names the font when it differs from the user’s', () => {
    expect(
      formatCodeFit({ linesVisible: 18, rangeLines: 18, fontSize: 12, userFontSize: 14 })
    ).toBe('fits: 18/18 lines at 12px (yours 14px)')
    expect(
      formatCodeFit({ linesVisible: 20, rangeLines: 20, fontSize: 14, userFontSize: 14 })
    ).toBe('fits: 20/20 lines at 14px')
  })

  it('asks for a shorter range when the range is cut off', () => {
    expect(formatCodeFit({ linesVisible: 9, rangeLines: 30, fontSize: 11, userFontSize: 14 })).toBe(
      'fits: 9/30 lines at 11px (yours 14px); pick a shorter range'
    )
  })
})
