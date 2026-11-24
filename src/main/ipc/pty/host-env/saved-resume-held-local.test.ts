import { expect, it, vi } from 'vitest'
import { terminalConversationKey } from '../../../native-chat/conversation-adoption/structured-conversation-key'
import type * as Ownership from '../../../native-chat/agent-session-wire/host/structured-provider-session-ownership'
import type * as Holds from '../../../runtime/agent-session/ownership/structured-chat-terminal-holds'

const ID = 'ce489453-5f6c-4b04-bd51-b00646a38a10'
vi.mock('../../../runtime/agent-session/ownership/structured-chat-terminal-holds', async (o) => ({
  ...(await o<typeof Holds>()),
  conversationHeldForTerminal: (id: string) => id === ID
}))
vi.mock(
  '../../../native-chat/agent-session-wire/host/structured-provider-session-ownership',
  async (o) => ({
    ...(await o<typeof Ownership>()),
    listStructuredProviderSessionOwnership: () => [
      { sessionId: 'chat', role: 'head', key: terminalConversationKey('claude', ID) }
    ]
  })
)

import { admitResumeSpawn } from './saved-resume-admission'

it("a held conversation's terminal is not restored; its resume goes only to a chat on screen", async () => {
  const verdict = async (sessionIds: string[]) => {
    const runtime = {
      openAgentSessionRecordStore: async () => ({
        listConversations: () => [],
        getVisibleSessionTabIndex: () => ({ present: true, sessionIds })
      })
    } as unknown as Parameters<typeof admitResumeSpawn>[0]
    const answer = await admitResumeSpawn(
      runtime,
      {
        resumeOrigin: 'saved',
        launchAgent: 'claude',
        resumeProviderSession: { key: 'session_id', id: ID }
      } as Parameters<typeof admitResumeSpawn>[1],
      null
    )
    return answer?.verdict
  }
  expect(await verdict(['chat'])).toBe('chat-home')
  // Its tab is closed: the pane's saved resume is all there is of it on screen.
  expect(await verdict([])).toBe('unverifiable')
})
