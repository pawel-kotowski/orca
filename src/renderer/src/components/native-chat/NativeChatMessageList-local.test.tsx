// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from './messages/actions/native-chat-tooltip-test-harness'
import type {
  AgentJournalItemBody,
  AgentJournalRenderItem
} from '../../../../shared/agent-session/journal/agent-session-journal-types'
import { projectStructuredQuestionMessages } from '../../../../shared/native-chat/transcript/messages/structured-agent-question-projection'
import { NativeChatMessageList } from './NativeChatMessageList'
import { installNativeChatMessageListTestViewport } from './viewport/virtualization/native-chat-message-list-test-viewport-local'
import type { NativeChatLiveSession } from './session/terminal/read/native-chat-live-session-contract'

// Moved from the live-reasoning suite upstream retired (#41617).

function item(
  itemId: string,
  body: AgentJournalItemBody,
  sequence: number
): AgentJournalRenderItem {
  return { itemId, body, sequence, observedAt: sequence * 1000, revision: 1 }
}
const user = item(
  'user',
  { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'Make the change' }] },
  1
)
const prose = item(
  'prose',
  { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: 'Updating the files.' }] },
  2
)
function diff(patch = '@@ -1 +1 @@\n-before\n+after'): AgentJournalRenderItem {
  return item(
    'diff',
    {
      kind: 'diff',
      path: 'src/a.ts',
      patch: { head: patch, truncated: false, digest: 'fixture', byteLength: patch.length }
    },
    3
  )
}
function session(items: AgentJournalRenderItem[]): NativeChatLiveSession {
  return {
    messages: projectStructuredQuestionMessages(items),
    status: 'ready',
    sessionId: 'session',
    agent: 'codex',
    hasMore: false,
    loadingEarlier: false,
    olderHistoryGeneration: 0,
    loadEarlier: vi.fn(),
    readPhase: 'ready'
  }
}
function view(items: AgentJournalRenderItem[], structured = true): React.JSX.Element {
  return (
    <NativeChatMessageList
      session={session(items)}
      journalItems={structured ? items : undefined}
      isWorking={false}
      expandSignal={false}
    />
  )
}

describe('turn history presentation (local)', () => {
  let restoreViewport = (): void => {}
  beforeAll(() => {
    restoreViewport = installNativeChatMessageListTestViewport()
  })
  afterAll(() => restoreViewport())
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  // Local build: transcript-only (terminal) lists total their turns too (Paweł, 2026-11-10).
  it('keeps rollups turn-local, with or without a journal', () => {
    const secondUser = item(
      'user-two',
      { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'Again' }] },
      5
    )
    const secondDiff = { ...diff(), itemId: 'second-diff', sequence: 6, observedAt: 6000 }
    const items = [user, prose, diff(), secondUser, secondDiff]
    const { rerender } = render(view(items))
    expect(screen.getAllByRole('button', { name: /1 changed file/ })).toHaveLength(2)
    rerender(view(items, false))
    expect(screen.getAllByRole('button', { name: /1 changed file/ })).toHaveLength(2)
  })
})
