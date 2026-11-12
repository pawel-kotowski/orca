// @vitest-environment happy-dom

import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { _resetActivityHoverCardIntentForTest } from './activity-thread-hover-card-intent'
import { ActivityThreadRow } from './activity-thread-row'
import type { AgentPaneThread } from './activity-thread-types'
import { makeRepo, makeTab, makeWorktree } from './ActivityPrototypePage-test-fixtures'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Local-only: an Inbox card's one corner slot, a bell while unread and an X once seen (6d1e5ffd23).

function createTestThread(overrides: Partial<AgentPaneThread> = {}): AgentPaneThread {
  return {
    paneKey: 'tab-1:leaf-1',
    tab: makeTab(),
    worktree: { ...makeWorktree(), displayName: 'm4air-audit' },
    repo: makeRepo(),
    agentType: 'claude',
    latestEvent: null,
    currentAgentState: 'working',
    currentAgentEntry: null,
    events: [],
    unread: false,
    paneTitle: 'Audit current HEAD on m4air environment',
    responsePreview: 'Auditing terminal PTY and IME bug categories...',
    latestTimestamp: 1700000000000,
    ...overrides
  }
}

function Harness({
  thread,
  onSelect = vi.fn(),
  onMarkRead = vi.fn(),
  onClear
}: {
  thread: AgentPaneThread
  onSelect?: () => void
  onMarkRead?: () => void
  onClear?: (thread: AgentPaneThread) => void
}): ReactElement {
  return (
    <TooltipProvider>
      <ActivityThreadRow
        thread={thread}
        selected={false}
        onSelect={onSelect}
        onJump={vi.fn()}
        onMarkRead={onMarkRead}
        onClear={onClear}
        inInbox
        canJump={true}
        compactMode={false}
      />
    </TooltipProvider>
  )
}

describe('ActivityThreadRow corner slot', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    _resetActivityHoverCardIntentForTest()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
    vi.useRealTimers()
  })

  it('marks an unread Inbox card seen from its bell without selecting the row', async () => {
    const thread = createTestThread({ unread: true })
    const onMarkRead = vi.fn()
    const onSelect = vi.fn()

    await act(async () => {
      root.render(<Harness thread={thread} onMarkRead={onMarkRead} onSelect={onSelect} />)
    })

    const markReadButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Mark as seen"]'
    )
    expect(markReadButton).not.toBeNull()

    act(() => {
      markReadButton?.click()
    })

    expect(onMarkRead).toHaveBeenCalledWith(thread)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('clears a seen Inbox card from its corner X without selecting the row', async () => {
    const thread = createTestThread()
    const onClear = vi.fn()
    const onSelect = vi.fn()

    await act(async () => {
      root.render(<Harness thread={thread} onClear={onClear} onSelect={onSelect} />)
    })

    const clearButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Done with it: move to Standing by"]'
    )
    expect(clearButton).not.toBeNull()

    act(() => clearButton?.click())

    expect(onClear).toHaveBeenCalledWith(thread)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
