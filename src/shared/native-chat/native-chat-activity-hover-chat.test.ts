import { describe, expect, it } from 'vitest'
import { nativeChatActivityHoverChat } from './native-chat-appearance-settings'

describe('nativeChatActivityHoverChat', () => {
  it('is off once settings load, unless turned on', () => {
    expect(nativeChatActivityHoverChat({})).toBe(false)
    expect(nativeChatActivityHoverChat({ nativeChatAppearance: {} })).toBe(false)
    expect(nativeChatActivityHoverChat({ nativeChatAppearance: { activityHoverChat: true } })).toBe(
      true
    )
  })

  it("keeps upstream's hover details in a bare store", () => {
    expect(nativeChatActivityHoverChat(null)).toBe(true)
    expect(nativeChatActivityHoverChat(undefined)).toBe(true)
  })
})
