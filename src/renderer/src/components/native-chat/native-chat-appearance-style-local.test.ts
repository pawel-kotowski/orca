import { describe, expect, it } from 'vitest'
import { nativeChatAppearanceStyle } from './native-chat-appearance-style'

// Why: local-only chat appearance settings (image overlay, custom text and bubble colours) keep
// their tests in a file of their own, so upstream's test pruning never conflicts with them.
describe('local chat appearance style', () => {
  it('publishes the chat opacity over a background image as a fraction', () => {
    expect(nativeChatAppearanceStyle(undefined)['--chat-image-overlay-opacity']).toBe(0.75)
    expect(
      nativeChatAppearanceStyle({ nativeChatAppearance: { imageOverlayOpacity: 50 } })[
        '--chat-image-overlay-opacity'
      ]
    ).toBe(0.5)
  })

  it('publishes a custom text color only for the themes that set a valid one', () => {
    const style = nativeChatAppearanceStyle({
      nativeChatAppearance: { textColorDark: '#e0d0c0', textColorLight: '#zz' }
    })
    expect(style['--chat-text-color-dark']).toBe('#e0d0c0')
    expect(style).not.toHaveProperty('--chat-text-color-light')
    expect(nativeChatAppearanceStyle(undefined)).not.toHaveProperty('--chat-text-color-dark')
    expect(
      nativeChatAppearanceStyle({ nativeChatAppearance: { userBubbleColorLight: 'abc' } })[
        '--chat-user-bubble-light'
      ]
    ).toBe('#abc')
  })
})
