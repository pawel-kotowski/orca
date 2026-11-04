// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Each chat stands in as one message row, drawn when the test says so.
const drawn = new Set<string>()
vi.mock('../native-chat/NativeChatView', () => ({
  default: ({ paneKey }: { paneKey: string }) =>
    drawn.has(paneKey) ? <div data-native-chat-message-id="m" data-pane={paneKey} /> : null
}))
vi.mock('@/store', () => {
  const state = { terminalLayoutsByTabId: {}, ptyIdsByTabId: {} }
  return { useAppStore: (select: (s: typeof state) => unknown) => select(state) }
})

import {
  ActivityChatPreviewHost,
  hideActivityChatPreview,
  showActivityChatPreview
} from './activity-chat-preview-host'
import type { AgentPaneThread } from './activity-thread-types'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function show(paneKey: string): void {
  act(() =>
    showActivityChatPreview({
      thread: { paneKey, paneTitle: paneKey, tab: { id: `tab-${paneKey}` } } as AgentPaneThread,
      onClose: () => {},
      onShowTerminal: () => {}
    })
  )
}

describe('ActivityChatPreviewHost', () => {
  let container: HTMLDivElement
  let root: Root

  const frames = (): Element[] => [
    ...document.querySelectorAll('[data-activity-thread-chat-preview]')
  ]
  // Each layer wraps one chat; its opacity says whether it shows.
  const layerOpacity = (paneKey: string): string | null => {
    const chat = document.querySelector(`[data-pane="${paneKey}"]`)
    return chat ? (chat.parentElement as HTMLElement).style.opacity : null
  }
  const advance = (ms: number): void => {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame']
    })
    drawn.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(<ActivityChatPreviewHost />))
  })

  afterEach(() => {
    act(() => hideActivityChatPreview('a'))
    act(() => hideActivityChatPreview('b'))
    advance(1000)
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
    vi.useRealTimers()
  })

  it('keeps one window and fades the last chat out only once the next has drawn', () => {
    drawn.add('a')
    show('a')
    expect(frames()).toHaveLength(1)
    expect(layerOpacity('a')).toBe('1')

    show('b')
    advance(100)
    // b has not drawn yet: a stays fully shown in the same window.
    expect(frames()).toHaveLength(1)
    expect(layerOpacity('a')).toBe('1')

    drawn.add('b')
    show('b')
    advance(20)
    expect(frames()).toHaveLength(1)
    expect(layerOpacity('b')).toBe('1')
    expect(layerOpacity('a')).toBe('0')

    advance(400)
    expect(layerOpacity('a')).toBeNull()
    expect(layerOpacity('b')).toBe('1')
  })

  it('fades the window out on close, then removes it', () => {
    drawn.add('a')
    show('a')
    act(() => hideActivityChatPreview('a'))
    expect(frames()).toHaveLength(1)
    expect(frames()[0]!.hasAttribute('data-closing')).toBe(true)
    advance(400)
    expect(frames()).toHaveLength(0)
  })

  it('ignores a hide from a card that is no longer shown', () => {
    drawn.add('a')
    drawn.add('b')
    show('a')
    show('b')
    act(() => hideActivityChatPreview('a'))
    expect(frames()[0]!.hasAttribute('data-closing')).toBe(false)
  })

  it('closes a chat whose card is gone on a click outside', () => {
    drawn.add('a')
    show('a')
    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    expect(frames()[0]!.hasAttribute('data-closing')).toBe(true)
  })

  it('leaves a click inside the window alone', () => {
    drawn.add('a')
    show('a')
    act(() => {
      document
        .querySelector('[data-pane="a"]')!
        .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    expect(frames()[0]!.hasAttribute('data-closing')).toBe(false)
  })
})
