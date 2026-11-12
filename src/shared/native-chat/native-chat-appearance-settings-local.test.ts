import { describe, expect, it } from 'vitest'
import {
  nativeChatFinishedTurnsOpen,
  nativeChatShowsBareWorkingLine,
  nativeChatSoleCallAsLine,
  nativeChatToolStepsOpen,
  normalizeNativeChatAppearanceSettings,
  resetNativeChatAppearanceSettings,
  resolveNativeChatAppearanceSettings
} from './native-chat-appearance-settings'

// Local-only tests for the local build's chat appearance settings (text and bubble colors, chat
// opacity over a background image, local view defaults); upstream never touches this file.

describe('chat colors per theme (local)', () => {
  it('resolves the defaults, including the image overlay opacity', () => {
    expect(
      resolveNativeChatAppearanceSettings({ fontSize: 99, codeFontSize: 0, width: 'full' })
    ).toEqual({
      fontFamily: '',
      fontSize: 20,
      codeFontSize: 10,
      width: 'full',
      contrast: 100,
      matchTerminalInterface: false,
      imageOverlayOpacity: 75
    })
  })

  it('keeps typed text colors and applies only valid hex per theme', () => {
    expect(
      normalizeNativeChatAppearanceSettings({ textColorLight: ' #12', textColorDark: '' })
    ).toEqual({ textColorLight: '#12' })
    expect(
      resolveNativeChatAppearanceSettings({ textColorLight: '#12', textColorDark: 'a0b1c2' })
    ).toMatchObject({ textColorLight: undefined, textColorDark: '#a0b1c2' })
    expect(
      resolveNativeChatAppearanceSettings({
        userBubbleColorDark: '#334455',
        userBubbleColorLight: 'x'
      })
    ).toMatchObject({ userBubbleColorDark: '#334455', userBubbleColorLight: undefined })
    const fromNewerVersion = { textColorLight: '#fff', userBubbleColorDark: '#000', futureKey: 1 }
    expect(resetNativeChatAppearanceSettings(fromNewerVersion)).toEqual({ futureKey: 1 })
  })
})

describe('chat opacity over a background image (local)', () => {
  it('clamps it to 30–100, defaults to 75 and stores only a change', () => {
    expect(resolveNativeChatAppearanceSettings({}).imageOverlayOpacity).toBe(75)
    expect(
      resolveNativeChatAppearanceSettings({ imageOverlayOpacity: 5 }).imageOverlayOpacity
    ).toBe(30)
    expect(
      resolveNativeChatAppearanceSettings({ imageOverlayOpacity: 140 }).imageOverlayOpacity
    ).toBe(100)
    expect(
      resolveNativeChatAppearanceSettings({ imageOverlayOpacity: 'x' }).imageOverlayOpacity
    ).toBe(75)
    expect(normalizeNativeChatAppearanceSettings({ imageOverlayOpacity: 75 })).toBeUndefined()
    expect(normalizeNativeChatAppearanceSettings({ imageOverlayOpacity: 60.4 })).toEqual({
      imageOverlayOpacity: 60
    })
  })
})

describe('local chat view defaults', () => {
  it('keeps the bare Working… line only until settings load, or when asked for', () => {
    expect(nativeChatShowsBareWorkingLine(null)).toBe(true)
    expect(nativeChatShowsBareWorkingLine({})).toBe(false)
    expect(
      nativeChatShowsBareWorkingLine({ nativeChatAppearance: { bareWorkingLine: true } })
    ).toBe(true)
  })

  it('draws a one-call run as its line once settings load', () => {
    expect(nativeChatSoleCallAsLine(null)).toBe(false)
    expect(nativeChatSoleCallAsLine({})).toBe(true)
    expect(nativeChatSoleCallAsLine({ nativeChatAppearance: { soleCallAsLine: false } })).toBe(
      false
    )
  })

  it('opens finished turns and folds tool steps by default once settings load', () => {
    expect(nativeChatFinishedTurnsOpen({})).toBe(true)
    expect(nativeChatFinishedTurnsOpen(null)).toBe(false)
    expect(nativeChatToolStepsOpen({})).toBe(false)
    expect(nativeChatToolStepsOpen({ nativeChatAppearance: { toolStepsOpen: true } })).toBe(true)
  })
})
