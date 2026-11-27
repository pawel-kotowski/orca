import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentSessionRecord } from '../../../shared/agent-session/lifecycle/agent-session-record'
import { ChatScratchInheritance } from '../launch-profiles/chat-scratch-inheritance'
import {
  closedChatTakeoverRefusal,
  refuseHandedOverChatStart,
  takeOverClosedChatConversation,
  type ClosedChatTakeoverHost
} from './closed-chat-takeover'

const CONVERSATION = 'claude-session-1'

function chat(sessionId: string, extra: Partial<AgentSessionRecord> = {}): AgentSessionRecord {
  return {
    sessionId,
    provider: 'claude',
    location: {
      executionHostId: 'local',
      wslDistro: null,
      workspaceId: 'w',
      workspaceKind: 'git-worktree'
    },
    providerHandleChain: [
      { handle: { agent: 'claude', nativeId: CONVERSATION } }
    ] as unknown as AgentSessionRecord['providerHandleChain'],
    conversationName: 'wake 1',
    lease: { claimStatus: 'released' },
    ...extra
  } as unknown as AgentSessionRecord
}

/** One store, one lock per chat (a promise chain), as the host serializes them. */
function fakeHost(records: AgentSessionRecord[], open = new Set<string>()) {
  const byId = new Map(records.map((r) => [r.sessionId, r]))
  const locks = new Map<string, Promise<unknown>>()
  const host: ClosedChatTakeoverHost = {
    deps: {
      store: {
        listConversations: () => [...byId.values()],
        getRecord: (id) => byId.get(id) ?? null,
        isSessionTabVisible: (id) => open.has(id),
        updateRecord: async (id, command) => {
          const record = byId.get(id)!
          if (command.kind === 'hand-over') {
            byId.set(id, {
              ...record,
              handedOverTo: { sessionId: command.to, at: command.now },
              conversationName: command.name
            })
          } else if (record.handedOverTo?.sessionId === command.from) {
            const { handedOverTo: _gone, ...rest } = record
            byId.set(id, { ...rest, conversationName: command.name ?? undefined })
          }
        }
      }
    },
    serialize: (id, run) => {
      const next = (locks.get(id) ?? Promise.resolve()).then(run, run)
      locks.set(
        id,
        next.catch(() => {})
      )
      return next
    },
    childAccountHome: () => undefined,
    sessionStarting: () => false
  }
  return { host, byId }
}

const scratch = () =>
  new ChatScratchInheritance(join(mkdtempSync(join(tmpdir(), 'scratch-')), 'i.json'))

describe('a new chat taking over a closed chat’s conversation', () => {
  it('takes it from a closed, idle chat on this machine only', () => {
    const facts = { local: true, tabOpen: false, agentRunning: false }
    expect(closedChatTakeoverRefusal(facts)).toBe(null)
    expect(closedChatTakeoverRefusal({ ...facts, tabOpen: true })).toMatch(/open/)
    expect(closedChatTakeoverRefusal({ ...facts, agentRunning: true })).toMatch(/running/)
    expect(closedChatTakeoverRefusal({ ...facts, local: false })).toMatch(/another machine/)
  })

  it('hands it over and keeps the old chat’s scratch folder; a failed create hands it back', async () => {
    const { host, byId } = fakeHost([chat('old')])
    const folders = scratch()
    const input = { agent: 'claude', providerSessionId: CONVERSATION, selfSessionId: 'new' }
    const takeover = await takeOverClosedChatConversation(host, input, folders)
    expect(byId.get('old')?.handedOverTo?.sessionId).toBe('new')
    expect(byId.get('old')?.conversationName).toBe('wake 1 (went on in a new chat)')
    expect(folders.source('new')).toBe('old')
    await takeover.undo()
    expect(byId.get('old')?.handedOverTo).toBeUndefined()
    expect(byId.get('old')?.conversationName).toBe('wake 1')
    expect(folders.source('new')).toBe('new')
  })

  it('refuses an open chat, and a second takeover while the first is in flight', async () => {
    const open = fakeHost([chat('old')], new Set(['old']))
    const input = { agent: 'claude', providerSessionId: CONVERSATION, selfSessionId: 'b' }
    await expect(takeOverClosedChatConversation(open.host, input, scratch())).rejects.toThrow(
      /is open/
    )
    const { host, byId } = fakeHost([chat('old')])
    const [first, second] = await Promise.allSettled([
      takeOverClosedChatConversation(host, { ...input, selfSessionId: 'b' }, scratch()),
      takeOverClosedChatConversation(host, { ...input, selfSessionId: 'c' }, scratch())
    ])
    expect(first.status).toBe('fulfilled')
    expect(second.status).toBe('rejected')
    expect(byId.get('old')?.handedOverTo?.sessionId).toBe('b')
    if (first.status === 'fulfilled') {
      first.value.done()
    }
  })

  it('takes over again from a hand-over whose new chat never came (a crash between)', async () => {
    const { host, byId } = fakeHost([
      chat('old', { handedOverTo: { sessionId: 'never-made', at: 1 } })
    ])
    const input = { agent: 'claude', providerSessionId: CONVERSATION, selfSessionId: 'new' }
    const takeover = await takeOverClosedChatConversation(host, input, scratch())
    expect(byId.get('old')?.handedOverTo?.sessionId).toBe('new')
    takeover.done()
  })

  it('a chat that handed its conversation on never starts again', () => {
    expect(() =>
      refuseHandedOverChatStart({ handedOverTo: { sessionId: 'new', at: 1 } }, () => 'agent x')
    ).toThrow(/went on in another chat \("agent x"\)/)
    expect(() => refuseHandedOverChatStart({}, () => undefined)).not.toThrow()
  })
})
