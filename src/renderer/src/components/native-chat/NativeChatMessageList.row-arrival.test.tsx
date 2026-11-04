// @vitest-environment happy-dom

// Rows that arrive while the chat is open fade in once; history at open and older pages do not.

import '@testing-library/jest-dom/vitest'

import { cleanup, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from './native-chat-tooltip-test-harness'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { NativeChatLiveSession } from './use-native-chat-live-session'
import { NativeChatMessageList } from './NativeChatMessageList'
import { installNativeChatMessageListTestViewport } from './native-chat-message-list-test-viewport'

function said(id: string, text: string): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [{ type: 'text', text }],
    timestamp: 1,
    source: 'transcript'
  }
}

function list(messages: NativeChatMessage[]): React.JSX.Element {
  const session: NativeChatLiveSession = {
    messages,
    status: 'ready',
    sessionId: 'session-1',
    agent: 'codex',
    hasMore: false,
    loadingEarlier: false,
    olderHistoryGeneration: 0,
    loadEarlier: vi.fn(),
    readPhase: 'ready'
  }
  return <NativeChatMessageList session={session} isWorking={false} expandSignal={false} />
}

function arrivedTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-native-chat-arrival]')].map(
    (row) => row.textContent ?? ''
  )
}

describe('NativeChatMessageList row arrival', () => {
  let restoreViewport = (): void => {}
  beforeAll(() => {
    restoreViewport = installNativeChatMessageListTestViewport()
  })
  afterAll(() => restoreViewport())
  afterEach(cleanup)

  it('fades only rows that arrive after the chat opened', () => {
    const opening = [said('a-1', 'Already here.')]
    const { container, rerender } = render(list(opening))
    expect(screen.getByText('Already here.')).toBeInTheDocument()
    expect(arrivedTexts(container)).toEqual([])

    rerender(list([...opening, said('a-2', 'Just arrived.')]))
    expect(screen.getByText('Just arrived.')).toBeInTheDocument()
    expect(arrivedTexts(container)).toEqual([expect.stringContaining('Just arrived.')])

    // An older page read in ahead of the transcript is history.
    rerender(list([said('a-0', 'Older page.'), ...opening, said('a-2', 'Just arrived.')]))
    expect(screen.getByText('Older page.')).toBeInTheDocument()
    expect(arrivedTexts(container)).toEqual([expect.stringContaining('Just arrived.')])
  })
})
