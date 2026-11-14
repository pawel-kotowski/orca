import { describe, expect, it } from 'vitest'
import { clampCodeLineRange } from './code-line-range'

describe('clampCodeLineRange', () => {
  it('keeps a range inside the file', () => {
    expect(clampCodeLineRange({ startLine: 40, endLine: 62 }, 100)).toEqual({
      range: { startLine: 40, endLine: 62 },
      clamped: false
    })
  })

  it('cuts a range that runs past the end', () => {
    expect(clampCodeLineRange({ startLine: 40, endLine: 62 }, 50)).toEqual({
      range: { startLine: 40, endLine: 50 },
      clamped: true
    })
  })

  it('moves a range that starts past the end onto the last line', () => {
    expect(clampCodeLineRange({ startLine: 80, endLine: 90 }, 50)).toEqual({
      range: { startLine: 50, endLine: 50 },
      clamped: true
    })
  })
})
