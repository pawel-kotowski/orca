// @vitest-environment happy-dom

import React, { type ComponentProps } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../pane/routing/native-chat-shortcut', () => ({ isMacPlatform: () => true }))
vi.mock('@/store', () => ({ useAppStore: undefined }))
vi.mock('@/components/ui/button', () => ({
  Button: React.forwardRef<
    HTMLButtonElement,
    ComponentProps<'button'> & { variant?: string; size?: string }
  >(({ variant: _variant, size: _size, ...props }, ref) => <button ref={ref} {...props} />)
}))
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: React.PropsWithChildren) => children,
  TooltipTrigger: ({ children }: React.PropsWithChildren) => children,
  TooltipContent: () => null
}))

import { NativeChatTerminalQueuedMessageList } from './NativeChatTerminalQueuedMessageList'
import {
  holdNativeChatTerminalMessage,
  resetNativeChatTerminalHeldMessagesForTests
} from './native-chat-terminal-held-messages'

const PANE = 'tab-1:leaf-1'

function renderList(agent: 'claude' | 'codex', turnActive = true) {
  holdNativeChatTerminalMessage(PANE, { text: 'first', images: [] })
  holdNativeChatTerminalMessage(PANE, { text: 'second', images: [] })
  render(
    <NativeChatTerminalQueuedMessageList
      paneKey={PANE}
      agent={agent}
      turnActive={turnActive}
      workingInterrupted={false}
      composerReady
      composerRef={{ current: null }}
    />
  )
}

afterEach(() => {
  cleanup()
  resetNativeChatTerminalHeldMessagesForTests()
})

describe('held messages in a terminal chat (local)', () => {
  it("shows Claude's Ctrl+Enter on the head card and a quiet line on each", () => {
    renderList('claude')
    expect(screen.getByText('Queued')).toBeTruthy()
    expect(
      screen.getByText('Goes when the turn ends · ⌃↵ on an empty box sends it now')
    ).toBeTruthy()
    expect(screen.getByText('Goes after the ones above · Send sends it now')).toBeTruthy()
    expect(screen.getByText('⌃↵')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Steer/ })).toHaveLength(2)
  })

  it('offers Codex a plain Send, which types the message for Codex to queue', () => {
    renderList('codex')
    expect(screen.getByText('Goes when the turn ends · Send types it now')).toBeTruthy()
    expect(screen.queryByText('⌃↵')).toBeNull()
    expect(screen.getAllByRole('button', { name: /Send/ })).toHaveLength(2)
  })
})
