import { afterEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ mac: true }))
vi.mock('../../pane/routing/native-chat-shortcut', () => ({ isMacPlatform: () => platform.mac }))

import { withNativeChatTerminalSendNow } from './native-chat-terminal-send-now-state'
import type { NativeChatComposerSendState } from './native-chat-composer-send-state'

const base: NativeChatComposerSendState = {
  sendBlockedReason: null,
  sendHeld: false,
  hasDraft: true,
  sendButtonDisabled: false,
  alternateSend: undefined,
  chordSteersHead: false
}

afterEach(() => {
  platform.mac = true
})

describe('a working terminal Claude chat offers Ctrl+Enter as its steer (local)', () => {
  it('names Control on a Mac, never Command', () => {
    expect(withNativeChatTerminalSendNow(base, true)).toEqual({
      ...base,
      alternateSend: 'steer',
      chordSteersHead: true,
      alternateSendShortcut: '⌃ Enter'
    })
    platform.mac = false
    expect(withNativeChatTerminalSendNow(base, true).alternateSendShortcut).toBe('Ctrl+Enter')
  })

  it('leaves the box as it was where Ctrl+Enter does not send now', () => {
    expect(withNativeChatTerminalSendNow(base, false)).toBe(base)
  })
})
