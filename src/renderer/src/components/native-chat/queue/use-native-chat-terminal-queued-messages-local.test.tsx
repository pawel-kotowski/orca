// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentType } from '../../../../../shared/agent-status/contracts/agent-status-types'

const mocks = vi.hoisted(() => ({
  appendToNativeChatComposerDraft: vi.fn(),
  toastError: vi.fn()
}))
vi.mock('../drafts/native-chat-composer-draft-store', () => ({
  appendToNativeChatComposerDraft: mocks.appendToNativeChatComposerDraft
}))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

import {
  holdNativeChatTerminalMessage,
  moveNativeChatTerminalHeldMessage,
  nativeChatTerminalHeldCards,
  readNativeChatTerminalHeldMessages,
  registerNativeChatTerminalHeldSender,
  resetNativeChatTerminalHeldMessagesForTests,
  takeNativeChatTerminalHeldMessage
} from './native-chat-terminal-held-messages'
import {
  nativeChatTerminalDrainStep,
  useNativeChatTerminalHold,
  useNativeChatTerminalQueuedMessages,
  useNativeChatTerminalSteerHead
} from './use-native-chat-terminal-queued-messages'

const PANE = 'tab-1:leaf-1'

function texts(): string[] {
  return readNativeChatTerminalHeldMessages(PANE).map((message) => message.text)
}

function hold(...messages: string[]): string[] {
  return messages.map((text) => holdNativeChatTerminalMessage(PANE, { text, images: [] }))
}

function fakeSender(result = true) {
  const sender = vi.fn((_message: { text: string; imagePaths: string[] }, _now: boolean) => result)
  registerNativeChatTerminalHeldSender(PANE, sender)
  return sender
}

type TurnProps = { turnActive: boolean; interrupted?: boolean; ready?: boolean; agent?: AgentType }

function renderQueue(initial: TurnProps) {
  const focus = vi.fn(() => true)
  const hook = renderHook(
    ({ turnActive, interrupted = false, ready = true, agent = 'claude' }: TurnProps) =>
      useNativeChatTerminalQueuedMessages({
        paneKey: PANE,
        agent,
        turnActive,
        interrupted,
        ready,
        composerRef: { current: { focus } }
      }),
    { initialProps: initial }
  )
  return { ...hook, focus }
}

beforeEach(() => {
  resetNativeChatTerminalHeldMessagesForTests()
  vi.clearAllMocks()
})
afterEach(() => {
  resetNativeChatTerminalHeldMessagesForTests()
})

describe('terminal held messages (local)', () => {
  it('holds in order, takes one out and reorders by anchor', () => {
    const [a, b, c] = hold('a', 'b', 'c')
    moveNativeChatTerminalHeldMessage(PANE, c, { beforeMessageId: a })
    expect(texts()).toEqual(['c', 'a', 'b'])
    moveNativeChatTerminalHeldMessage(PANE, c, { afterMessageId: b })
    expect(texts()).toEqual(['a', 'b', 'c'])
    moveNativeChatTerminalHeldMessage(PANE, a, { beforeMessageId: null })
    expect(texts()).toEqual(['b', 'c', 'a'])
    expect(takeNativeChatTerminalHeldMessage(PANE, b)?.text).toBe('b')
    expect(takeNativeChatTerminalHeldMessage(PANE, b)).toBeNull()
    expect(texts()).toEqual(['c', 'a'])
  })

  it('draws held messages as plainly waiting queued cards, images included', () => {
    holdNativeChatTerminalMessage(PANE, {
      text: 'look',
      images: [{ id: 'i1', path: '/tmp/a.png' }]
    })
    expect(nativeChatTerminalHeldCards(readNativeChatTerminalHeldMessages(PANE))).toEqual([
      expect.objectContaining({
        text: 'look',
        state: 'waiting',
        hold: 'turn',
        images: [{ type: 'image-ref', path: '/tmp/a.png' }]
      })
    ])
  })

  it('the composer holds only while its agent works, keeping image ids but not previews', () => {
    const idle = renderHook(() => useNativeChatTerminalHold(PANE, false))
    expect(idle.result.current).toBeUndefined()
    const working = renderHook(() => useNativeChatTerminalHold(PANE, true))
    const images = [{ id: 'i1', path: '/tmp/a.png', previewUrl: 'blob:x' }]
    expect(working.result.current?.({ text: 'later', images })).toBe(true)
    expect(readNativeChatTerminalHeldMessages(PANE)).toEqual([
      expect.objectContaining({ text: 'later', images: [{ id: 'i1', path: '/tmp/a.png' }] })
    ])
  })
})

describe('the turn-end drain (local)', () => {
  const idle = { armed: false, turnActive: false, interrupted: false, ready: true, hasHeld: true }

  it('arms on a turn and sends the head when it ends', () => {
    const armed = nativeChatTerminalDrainStep({ ...idle, turnActive: true })
    expect(armed).toEqual({ armed: true, drain: false })
    expect(nativeChatTerminalDrainStep({ ...idle, armed: true })).toEqual({
      armed: false,
      drain: true
    })
  })

  it('never sends after a Stop, without a turn, or with nothing held', () => {
    expect(nativeChatTerminalDrainStep({ ...idle, armed: true, interrupted: true }).drain).toBe(
      false
    )
    expect(nativeChatTerminalDrainStep(idle).drain).toBe(false)
    expect(nativeChatTerminalDrainStep({ ...idle, armed: true, hasHeld: false }).drain).toBe(false)
  })

  it('waits, still armed, while the box cannot type', () => {
    expect(nativeChatTerminalDrainStep({ ...idle, armed: true, ready: false })).toEqual({
      armed: true,
      drain: false
    })
  })

  it('types one head card with plain Enter per turn end; the rest wait', () => {
    const sender = fakeSender()
    const queue = renderQueue({ turnActive: true })
    act(() => void hold('first', 'second'))
    expect(queue.result.current.cards.map((card) => card.text)).toEqual(['first', 'second'])
    expect(sender).not.toHaveBeenCalled()

    queue.rerender({ turnActive: false })
    expect(sender).toHaveBeenCalledExactlyOnceWith({ text: 'first', imagePaths: [] }, false)
    expect(texts()).toEqual(['second'])

    queue.rerender({ turnActive: true })
    queue.rerender({ turnActive: false })
    expect(sender).toHaveBeenLastCalledWith({ text: 'second', imagePaths: [] }, false)
    expect(texts()).toEqual([])
  })

  it('sends the head card when the chat comes back after its turn ended unseen', () => {
    const sender = fakeSender()
    hold('waited', 'later')
    renderQueue({ turnActive: false })
    expect(sender).toHaveBeenCalledExactlyOnceWith({ text: 'waited', imagePaths: [] }, false)
    expect(texts()).toEqual(['later'])
  })

  it('keeps the cards after a Stop', () => {
    const sender = fakeSender()
    const queue = renderQueue({ turnActive: true })
    act(() => void hold('kept'))
    queue.rerender({ turnActive: false, interrupted: true })
    expect(sender).not.toHaveBeenCalled()
    expect(texts()).toEqual(['kept'])
  })

  it('sends once the box can type again when the turn ended under a prompt card', () => {
    const sender = fakeSender()
    const queue = renderQueue({ turnActive: true })
    act(() => void hold('waiting'))
    queue.rerender({ turnActive: false, ready: false })
    expect(sender).not.toHaveBeenCalled()
    queue.rerender({ turnActive: false, ready: true })
    expect(sender).toHaveBeenCalledOnce()
    expect(texts()).toEqual([])
  })
})

describe('the terminal queue controller (local)', () => {
  it('Send on a card goes now with Claude send-now key while the turn runs', async () => {
    const sender = fakeSender()
    const [, second] = hold('a', 'b')
    const queue = renderQueue({ turnActive: true })
    expect(queue.result.current.isWorking).toBe(true)
    await act(() => queue.result.current.steer(second))
    expect(sender).toHaveBeenCalledExactlyOnceWith({ text: 'b', imagePaths: [] }, true)
    expect(texts()).toEqual(['a'])
  })

  it("Codex's Send types with Enter, since Codex has no send-now key", async () => {
    const sender = fakeSender()
    const [only] = hold('a')
    const queue = renderQueue({ turnActive: true, agent: 'codex' })
    expect(queue.result.current.isWorking).toBe(false)
    await act(() => queue.result.current.steer(only))
    expect(sender).toHaveBeenCalledExactlyOnceWith({ text: 'a', imagePaths: [] }, false)
  })

  it('keeps a card the box could not type, and says so', async () => {
    fakeSender(false)
    const [only] = hold('a')
    const queue = renderQueue({ turnActive: true })
    await act(() => queue.result.current.steer(only))
    expect(texts()).toEqual(['a'])
    expect(mocks.toastError).toHaveBeenCalledOnce()
  })

  it('Delete drops a card, Clear all drops every card', async () => {
    const [first] = hold('a', 'b', 'c')
    const queue = renderQueue({ turnActive: true })
    await act(() => queue.result.current.remove(first))
    expect(texts()).toEqual(['b', 'c'])
    await act(() => queue.result.current.clear())
    expect(queue.result.current.cards).toEqual([])
  })

  it('Edit hands the message and its images back to the message box', async () => {
    holdNativeChatTerminalMessage(PANE, { text: 'fix me', images: [{ path: '/tmp/a.png' }] })
    const queue = renderQueue({ turnActive: true })
    await act(() => queue.result.current.edit(queue.result.current.cards[0].messageId))
    expect(texts()).toEqual([])
    expect(mocks.appendToNativeChatComposerDraft).toHaveBeenCalledExactlyOnceWith(PANE, {
      text: 'fix me',
      images: [expect.objectContaining({ path: '/tmp/a.png', id: expect.any(String) })]
    })
    expect(queue.focus).toHaveBeenCalled()
  })

  it('reorders by drag through the local store', async () => {
    const [a, b] = hold('a', 'b')
    const queue = renderQueue({ turnActive: true })
    await act(() => queue.result.current.reorder!.move(a, { afterMessageId: b }))
    expect(queue.result.current.cards.map((card) => card.text)).toEqual(['b', 'a'])
  })

  it('the box steer (Ctrl+Enter on an empty box) sends the head card now', () => {
    const sender = fakeSender()
    const none = renderHook(() => useNativeChatTerminalSteerHead(PANE, true, true))
    expect(none.result.current).toBeUndefined()
    hold('head', 'next')
    const steer = renderHook(() => useNativeChatTerminalSteerHead(PANE, true, true))
    expect(steer.result.current?.()).toBe(true)
    expect(sender).toHaveBeenCalledExactlyOnceWith({ text: 'head', imagePaths: [] }, true)
    expect(texts()).toEqual(['next'])
    const off = renderHook(() => useNativeChatTerminalSteerHead(PANE, false, true))
    expect(off.result.current).toBeUndefined()
  })
})
