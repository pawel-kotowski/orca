// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useNativeChatComposerRevealFocus } from './use-native-chat-composer-reveal-focus'
import type { NativeChatComposerHandle } from '../native-chat-composer-types'

// Local-only test (upstream removed its reveal-focus suite): a message box the user collapsed
// behind the corner button stays collapsed when its pane is revealed.

let container: HTMLDivElement
let root: Root
let frames: (() => void)[] = []
let focusCalls = 0

function drainFrames(max = 20): void {
  for (let i = 0; i < max && frames.length > 0; i += 1) {
    const queued = frames
    frames = []
    act(() => {
      for (const frame of queued) {
        frame()
      }
    })
  }
}

function Harness({ collapsed }: { collapsed: boolean }): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const composerRef = useRef<NativeChatComposerHandle>(null)
  composerRef.current = {
    focus: () => {
      focusCalls += 1
      fieldRef.current?.focus()
      return true
    },
    insertTypedText: () => true,
    insertAgentReferences: () => false,
    appendText: () => {},
    acceptsText: () => true,
    handlePasteEvent: () => {},
    pasteFromClipboard: () => {},
    contains: (node) => fieldRef.current?.contains(node) === true,
    isCollapsed: () => collapsed
  }
  useNativeChatComposerRevealFocus({
    tabId: 'chat-tab',
    rootRef,
    composerRef,
    isVisible: true,
    isFocusedGroup: true,
    composerReady: true,
    scheduleFrame: (callback) => {
      frames.push(callback)
    }
  })
  return createElement(
    'div',
    { ref: rootRef },
    createElement('textarea', { ref: fieldRef, 'data-testid': 'composer' })
  )
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  frames = []
  focusCalls = 0
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
  document.body.innerHTML = ''
})

describe('useNativeChatComposerRevealFocus (local)', () => {
  it('focuses an expanded message box when the pane is revealed', () => {
    act(() => {
      root.render(createElement(Harness, { collapsed: false }))
    })
    drainFrames()
    expect(focusCalls).toBeGreaterThan(0)
    expect(document.activeElement).toBe(container.querySelector('[data-testid="composer"]'))
  })

  it('leaves a collapsed message box collapsed when the pane is revealed', () => {
    act(() => {
      root.render(createElement(Harness, { collapsed: true }))
    })
    drainFrames()
    expect(focusCalls).toBe(0)
    expect(document.activeElement).not.toBe(container.querySelector('[data-testid="composer"]'))
  })
})
