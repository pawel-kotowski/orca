// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentType } from '../../../../../../shared/agent-status/contracts/agent-status-types'

const mocks = vi.hoisted(() => ({
  sendNativeChatMessage: vi.fn((..._args: unknown[]) => null),
  sendNativeChatTypedCommand: vi.fn((..._args: unknown[]) => null),
  submitNativeChatPrompt: vi.fn()
}))

vi.mock('../../session/terminal/send/native-chat-runtime-send', () => mocks)
vi.mock('../../session/terminal/send/native-chat-runtime-image-send', () => ({
  sendNativeChatMessageWithImageAttachments: vi.fn(() => null)
}))
vi.mock('../../drafts/native-chat-composer-draft-store', () => ({
  readNativeChatComposerDraft: () => ({ document: null, pastedTextFiles: [] })
}))
vi.mock('../pickers/native-chat-agent-reference-send', () => ({
  serializeNativeChatAgentReferences: (text: string) => text
}))
vi.mock('../../paste/native-chat-composer-pasted-text-references', () => ({
  admitNativeChatPastedText: () => true,
  resolveNativeChatPastedText: (_scope: string, text: string) => text
}))
vi.mock('../../drafts/native-chat-launch-draft-send', () => ({
  resolveNativeChatLaunchDraftSend: () => ({ plan: null, sendOptions: { clearInput: '' } })
}))
vi.mock('../../telemetry/native-chat-telemetry', () => ({ emitNativeChatMessageSent: vi.fn() }))
vi.mock('../../../../store/index', () => {
  const state = { clearNativeChatLaunchDraft: vi.fn() }
  return { useAppStore: { getState: () => state } }
})

import { useNativeChatPtyComposerSend } from './use-native-chat-pty-composer-send'

// Claude Code's send-now chord (Ctrl+X Ctrl+S), bound beside Ctrl+Enter in its terminal.
const SEND_NOW = '\x18\x13'

function renderSend(agent: AgentType, draft = 'hello') {
  const { result } = renderHook(() =>
    useNativeChatPtyComposerSend({
      agent,
      draft,
      draftScopeKey: 'tab-1',
      imageAttachments: [],
      disabled: false,
      isDispatchingSessionOption: false,
      launchDraftResolved: true,
      resolveTarget: () => ({ ptyId: 'pty-1' }),
      classifySend: () => 'chat',
      sessionOptionsSurface: null,
      terminalTabId: 'tab-1',
      trackPendingSend: vi.fn(),
      setDraft: vi.fn(),
      setCaret: vi.fn(),
      clearSkillOrigin: vi.fn(),
      clearImageAttachments: vi.fn(),
      setNotice: vi.fn()
    })
  )
  return result.current
}

describe('Ctrl+Enter in a terminal Claude chat (local)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits with the send-now key instead of Enter', () => {
    expect(renderSend('claude')(undefined, { sendNow: true })).toBe(true)
    expect(mocks.sendNativeChatMessage).toHaveBeenCalledExactlyOnceWith(
      'pty-1',
      'hello',
      expect.objectContaining({ submitKey: SEND_NOW })
    )
  })

  it('keeps Enter for a plain send', () => {
    renderSend('claude')()
    expect(mocks.sendNativeChatMessage).toHaveBeenCalledOnce()
    expect(mocks.sendNativeChatMessage.mock.calls[0]?.[2]).not.toHaveProperty('submitKey')
  })

  it('pushes the messages Claude holds when the box is empty', () => {
    expect(renderSend('claude', '')(undefined, { sendNow: true })).toBe(true)
    expect(mocks.submitNativeChatPrompt).toHaveBeenCalledExactlyOnceWith('pty-1', SEND_NOW)
    expect(mocks.sendNativeChatMessage).not.toHaveBeenCalled()
  })

  it('leaves other agents on their own Enter', () => {
    renderSend('codex')(undefined, { sendNow: true })
    expect(mocks.sendNativeChatMessage.mock.calls[0]?.[2]).not.toHaveProperty('submitKey')
  })
})
