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

describe('native chat appearance normalization', () => {
  it('preserves unknown future fields while normalizing only known fields', () => {
    const future = {
      futureSetting: { nested: 'keep' }
    }
    expect(
      normalizeNativeChatAppearanceSettings({
        ...future,
        contrast: 151,
        matchTerminalInterface: true,
        fontSize: 99,
        codeFontSize: 12,
        width: 'comfortable'
      })
    ).toEqual({ ...future, fontSize: 20, contrast: 150, matchTerminalInterface: true })
    expect(normalizeNativeChatAppearanceSettings(future)).toEqual(future)
  })

  it('preserves future fields without letting known defaults or malformed values survive', () => {
    const future = { futureSetting: { nested: 'keep' } }
    for (const contrast of [100, Number.NaN, Number.POSITIVE_INFINITY, '150', null]) {
      for (const matchTerminalInterface of [false, 'true', null]) {
        expect(
          normalizeNativeChatAppearanceSettings({
            ...future,
            contrast,
            matchTerminalInterface
          })
        ).toEqual(future)
      }
    }
  })
  it('resets known controls while keeping settings from a newer version', () => {
    const fromNewerVersion = {
      fontFamily: 'Georgia',
      fontSize: 18,
      codeFontSize: 16,
      width: 'wide' as const,
      contrast: 151,
      matchTerminalInterface: true,
      futureSetting: { nested: 'keep' }
    }
    expect(resetNativeChatAppearanceSettings(fromNewerVersion)).toEqual({
      futureSetting: { nested: 'keep' }
    })
    expect(resetNativeChatAppearanceSettings({ fontSize: 18 })).toBeUndefined()
  })
  it('clamps and rounds values on read', () => {
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
    expect(
      normalizeNativeChatAppearanceSettings({ fontSize: 15.6, codeFontSize: 13.2, width: 'wide' })
    ).toEqual({ fontSize: 16, codeFontSize: 13, width: 'wide' })
  })
  it('falls back safely for malformed persisted data', () => {
    for (const value of [
      null,
      false,
      'large',
      {},
      { fontSize: Number.NaN, codeFontSize: Number.POSITIVE_INFINITY, width: 'giant' },
      { fontSize: '20' }
    ]) {
      expect(normalizeNativeChatAppearanceSettings(value)).toBeUndefined()
    }
  })
  it('trims family names, preserves explicit Geist, and omits malformed overrides', () => {
    expect(normalizeNativeChatAppearanceSettings({ fontFamily: '  Georgia  ' })).toEqual({
      fontFamily: 'Georgia'
    })
    expect(normalizeNativeChatAppearanceSettings({ fontFamily: 'Geist' })).toEqual({
      fontFamily: 'Geist'
    })
    for (const fontFamily of ['', '  ', null, 42, ['Georgia']]) {
      expect(normalizeNativeChatAppearanceSettings({ fontFamily })).toBeUndefined()
    }
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

describe('chat opacity over a background image', () => {
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

describe('chat contrast and terminal interface normalization', () => {
  it('clamps and rounds persisted contrast, accepting only an explicit true toggle', () => {
    expect(
      resolveNativeChatAppearanceSettings({ contrast: 999, matchTerminalInterface: 'true' })
    ).toMatchObject({ contrast: 150, matchTerminalInterface: false })
    expect(normalizeNativeChatAppearanceSettings({ contrast: -5 })).toEqual({ contrast: 50 })
    expect(normalizeNativeChatAppearanceSettings({ contrast: 120.6 })).toEqual({ contrast: 121 })
    for (const contrast of [Number.NaN, Number.POSITIVE_INFINITY, '150', null]) {
      expect(normalizeNativeChatAppearanceSettings({ contrast })).toBeUndefined()
    }
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
