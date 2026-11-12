import { describe, expect, it } from 'vitest'
import { nativeChatShowsComposerWorkspaceLine } from './native-chat-appearance-settings'

describe('nativeChatShowsComposerWorkspaceLine', () => {
  it("shows upstream's line until settings load", () => {
    expect(nativeChatShowsComposerWorkspaceLine(null)).toBe(true)
  })

  it('hides it once settings load unless turned on', () => {
    expect(nativeChatShowsComposerWorkspaceLine({})).toBe(false)
    expect(nativeChatShowsComposerWorkspaceLine({ nativeChatAppearance: {} })).toBe(false)
    expect(
      nativeChatShowsComposerWorkspaceLine({
        nativeChatAppearance: { composerWorkspaceLine: true }
      })
    ).toBe(true)
  })
})
