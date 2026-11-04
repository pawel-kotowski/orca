import { describe, expect, it } from 'vitest'
import {
  floatingLauncherShift,
  resolveCornerButtonsLayout
} from './native-chat-corner-buttons-layout'

const pane = { left: 0, right: 1200, top: 600, bottom: 720 }
const rect = (left: number, top: number, size = 36) => ({
  left,
  right: left + size,
  top,
  bottom: top + size
})

describe('resolveCornerButtonsLayout', () => {
  it('glues the buttons to the bottom edge when the pane has room beside the message box', () => {
    const column = { left: 200, right: 1000, top: 608, bottom: 704 }
    expect(
      resolveCornerButtonsLayout({ pane, column, width: 80, height: 36, launcher: null })
    ).toEqual({ placement: 'beside', shift: 0 })
  })

  it('lifts the buttons above the message box when the pane is too narrow', () => {
    const column = { left: 16, right: 1184, top: 608, bottom: 704 }
    expect(
      resolveCornerButtonsLayout({ pane, column, width: 80, height: 36, launcher: null })
    ).toEqual({ placement: 'above', shift: 0 })
  })

  it('keeps the bottom edge while the message box is hidden', () => {
    expect(
      resolveCornerButtonsLayout({ pane, column: null, width: 80, height: 36, launcher: null })
        .placement
    ).toBe('beside')
  })

  it('lifts the buttons when clearing the floating launcher would push them into the box', () => {
    const column = { left: 200, right: 1050, top: 608, bottom: 704 }
    const launcher = rect(1120, 660)
    expect(resolveCornerButtonsLayout({ pane, column, width: 80, height: 36, launcher })).toEqual({
      placement: 'above',
      shift: 0
    })
  })
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
