import { describe, expect, it } from 'vitest'
import { floatingLauncherShift } from './native-chat-corner-buttons-layout'

const rect = (left: number, top: number, size = 36) => ({
  left,
  right: left + size,
  top,
  bottom: top + size
})

describe('floatingLauncherShift', () => {
  it('moves left just far enough to clear an overlapping launcher', () => {
    expect(floatingLauncherShift(rect(1100, 660), rect(1120, 660))).toBe(1136 - 1120 + 8)
  })

  it('stays put when the launcher is elsewhere or not laid out', () => {
    expect(floatingLauncherShift(rect(1100, 660), rect(100, 100))).toBe(0)
    expect(floatingLauncherShift(rect(1100, 660), { left: 0, right: 0, top: 0, bottom: 0 })).toBe(0)
    expect(floatingLauncherShift(rect(1100, 660), null)).toBe(0)
  })
})
