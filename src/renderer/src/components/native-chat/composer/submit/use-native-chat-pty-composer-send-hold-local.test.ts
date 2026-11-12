// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentType } from '../../../../../../shared/agent-status/contracts/agent-status-types'

const mocks = vi.hoisted(() => ({
  sendNativeChatMessage: vi.fn((..._args: unknown[]) => null),
  sendNativeChatTypedCommand: vi.fn((..._args: unknown[]) => null),
  submitNativeChatPrompt: vi.fn(),
  sendNativeChatMessageWithImageAttachments: vi.fn((..._args: unknown[]) => null)
}))

vi.mock('../../session/terminal/send/native-chat-runtime-send', () => ({
  sendNativeChatMessage: mocks.sendNativeChatMessage,
  sendNativeChatTypedCommand: mocks.sendNativeChatTypedCommand,
  submitNativeChatPrompt: mocks.submitNativeChatPrompt
}))
vi.mock('../../session/terminal/send/native-chat-runtime-image-send', () => ({
  sendNativeChatMessageWithImageAttachments: mocks.sendNativeChatMessageWithImageAttachments
}))
vi.mock('../../drafts/native-chat-composer-draft-store', () => ({
  readNativeChatComposerDraft: () => ({ document: null, pastedTextFiles: [] })
}))
vi.mock('../pickers/native-chat-agent-reference-send', () => ({
  serializeNativeChatAgentReferences: (text: string) => `${text} (written out)`
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

const SEND_NOW = '\x18\x13'

function renderSend(options: {
  agent?: AgentType
  draft?: string
  hold?: ReturnType<typeof vi.fn>
  classification?: 'chat' | 'command'
}) {
  const setDraft = vi.fn()
  const onOptimisticSend = vi.fn(() => 'pending-1')
  const { result } = renderHook(() =>
    useNativeChatPtyComposerSend({
      agent: options.agent ?? 'claude',
      draft: options.draft ?? 'hello',
      draftScopeKey: 'pane-1',
      imageAttachments: [{ path: '/tmp/a.png' }],
      disabled: false,
      isDispatchingSessionOption: false,
      launchDraftResolved: true,
      resolveTarget: () => ({ ptyId: 'pty-1' }),
      classifySend: () => options.classification ?? 'chat',
      sessionOptionsSurface: null,
      terminalTabId: 'tab-1',
      trackPendingSend: vi.fn(),
      onOptimisticSend,
      setDraft,
      setCaret: vi.fn(),
      clearSkillOrigin: vi.fn(),
      clearImageAttachments: vi.fn(),
      setNotice: vi.fn(),
      holdWhileWorking: options.hold as never
    })
  )
  return { send: result.current, setDraft, onOptimisticSend }
}

describe('a terminal chat holds messages while its agent works (local)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('holds a plain Enter, written out, and clears the box without typing or an echo', () => {
    const hold = vi.fn(() => true)
    const { send, setDraft, onOptimisticSend } = renderSend({ hold })
    expect(send()).toBe(true)
    expect(hold).toHaveBeenCalledExactlyOnceWith({
      text: 'hello (written out)',
      images: [{ path: '/tmp/a.png' }]
    })
    expect(mocks.sendNativeChatMessageWithImageAttachments).not.toHaveBeenCalled()
    expect(onOptimisticSend).not.toHaveBeenCalled()
    expect(setDraft).toHaveBeenCalledWith('')
  })

  it('never holds Ctrl+Enter (send now) or a slash command', () => {
    const hold = vi.fn(() => true)
    renderSend({ hold }).send(undefined, { sendNow: true })
    renderSend({ hold, classification: 'command', draft: '/compact' }).send()
    expect(hold).not.toHaveBeenCalled()
  })

  it('types a held message as it was held, with images, and leaves the box alone', () => {
    const hold = vi.fn(() => true)
    const { send, setDraft, onOptimisticSend } = renderSend({ hold, draft: 'typing more' })
    expect(send(undefined, { held: { text: 'held one', imagePaths: ['/tmp/b.png'] } })).toBe(true)
    expect(hold).not.toHaveBeenCalled()
    expect(mocks.sendNativeChatMessageWithImageAttachments).toHaveBeenCalledExactlyOnceWith(
      'claude',
      'pty-1',
      'held one',
      ['/tmp/b.png'],
      expect.not.objectContaining({ submitKey: SEND_NOW })
    )
    expect(onOptimisticSend).toHaveBeenCalledWith('held one', ['/tmp/b.png'], false)
    expect(setDraft).not.toHaveBeenCalled()
  })

  it("sends a held message now with Claude's send-now key", () => {
    const { send } = renderSend({})
    send(undefined, { held: { text: 'now', imagePaths: [] }, sendNow: true })
    expect(mocks.sendNativeChatMessage).toHaveBeenCalledExactlyOnceWith(
      'pty-1',
      'now',
      expect.objectContaining({ submitKey: SEND_NOW })
    )
  })
})
