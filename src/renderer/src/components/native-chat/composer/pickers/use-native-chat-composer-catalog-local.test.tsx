// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getVerifiedNativeChatCommands } from '../../../../../../shared/native-chat/native-chat-agent-profiles'
import { useNativeChatComposerCatalog } from './use-native-chat-composer-catalog'
import { withNativeChatResumeCommand } from './use-native-chat-resume-command'

// Local-only test (upstream removed its catalog suite): a terminal-backed chat offers Orca's
// /resume, which opens Session History instead of the terminal's own picker.
describe('composer catalog for terminal chats (local)', () => {
  it("gives a PTY Claude chat Orca's /resume", () => {
    const pty = renderHook(() => useNativeChatComposerCatalog('claude'))
    expect(pty.result.current.agentCommands).toEqual(
      withNativeChatResumeCommand(getVerifiedNativeChatCommands('claude'))
    )
    expect(pty.result.current.sessionSkills).toBeUndefined()
  })
})
