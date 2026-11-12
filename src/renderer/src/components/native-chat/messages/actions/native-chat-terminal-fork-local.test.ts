import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../../../shared/native-chat/native-chat-types'
import { nativeChatNoticeLook } from '../../../../../../shared/native-chat/native-chat-notice'
import { codexHomeOfTranscript } from './native-chat-terminal-fork-startup'
import { withNativeChatTerminalForkDivider } from './native-chat-terminal-fork-origins'
import { nativeChatSlotOffersFork } from './native-chat-side-chat-fork-point'
import type { NativeChatMessageSlot } from '../../conversation/slots/native-chat-transcript-slots'

function row(id: string, timestamp: number, transcriptOrder?: number): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [{ type: 'text', text: id }],
    timestamp,
    source: 'transcript',
    ...(transcriptOrder === undefined ? {} : { transcriptOrder })
  }
}

const origin = {
  sourceSessionId: 'source-id',
  sourceTabId: 'tab-1',
  worktreeId: 'wt-1',
  sourceName: 'Fix the build',
  throughUuid: 'b',
  forkedAt: 100
}

describe('withNativeChatTerminalForkDivider', () => {
  it('goes after the copy last row and sorts before the next', () => {
    const messages = withNativeChatTerminalForkDivider(
      [row('a', 10, 0), row('b', 20, 50), row('c', 200, 90)],
      'copy-id',
      origin
    )
    expect(messages.map((message) => message.id)).toEqual([
      'a',
      'b',
      'terminal-fork-divider:copy-id',
      'c'
    ])
    const divider = messages[2]!
    expect(divider.transcriptOrder).toBe(50.5)
    const block = divider.blocks[0]
    expect(block?.type === 'text' ? nativeChatNoticeLook(block) : null).toEqual({
      kind: 'forked-from',
      sourceSessionId: 'source-id',
      sourceName: 'Fix the build'
    })
  })

  it('falls back to the fork time when the last copied row draws no message', () => {
    const messages = withNativeChatTerminalForkDivider(
      [row('a', 10), row('c', 200)],
      'copy-id',
      origin
    )
    expect(messages.map((message) => message.id)).toEqual([
      'a',
      'terminal-fork-divider:copy-id',
      'c'
    ])
  })
})

describe('codexHomeOfTranscript', () => {
  it('reads the Codex home a rollout lives in', () => {
    expect(codexHomeOfTranscript('/Users/p/.codex/sessions/2026/11/12/rollout-x.jsonl')).toBe(
      '/Users/p/.codex'
    )
    expect(codexHomeOfTranscript('/elsewhere/rollout.jsonl')).toBeNull()
    expect(codexHomeOfTranscript(null)).toBeNull()
  })
})

describe('nativeChatSlotOffersFork with a terminal rule', () => {
  it('asks the chat own rule instead of the journal one', () => {
    const slot = {
      kind: 'message',
      message: row('a', 1),
      depth: 0,
      activeTurnIsWorking: false,
      turnKey: 't1'
    } as unknown as NativeChatMessageSlot
    const chat = {
      support: { kind: 'known' as const, fork: 'checkpoint' as const },
      contextFloorSequence: 0,
      forkableItemIds: new Set<string>()
    }
    // Without journal positions the structured rule never offers it.
    expect(nativeChatSlotOffersFork(slot, { chat, latestTurnKey: 't1' })).toBe(false)
    const seen: unknown[] = []
    expect(
      nativeChatSlotOffersFork(slot, {
        chat: {
          ...chat,
          offersRow: (offered) => {
            seen.push(offered)
            return true
          }
        },
        latestTurnKey: 't1'
      })
    ).toBe(true)
    expect(seen).toEqual([
      { message: slot.message, inSubagentSection: false, turnWorking: false, inLatestTurn: true }
    ])
  })
})
