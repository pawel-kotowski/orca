import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../../../shared/native-chat/native-chat-types'
import type { NativeChatTurnStatus } from '../../../../../../shared/native-chat/transcript/native-chat-turn-status'
import type { NativeChatResolvedPrompt } from '../../../../../../shared/native-chat/native-chat-resolution-receipt'
import type { NativeChatTurnDiff } from '../../../../../../shared/native-chat/tools/native-chat-turn-diffs'
import {
  buildNativeChatTranscriptSlots,
  type NativeChatMessageSlot
} from './native-chat-transcript-slots'
import { unframeHeldTurnAnswer } from './native-chat-turn-answer-frame'

function text(id: string, body: string, role: NativeChatMessage['role'] = 'assistant') {
  return {
    id,
    role,
    blocks: [{ type: 'text' as const, text: body }],
    timestamp: 1,
    source: 'transcript' as const
  }
}

function toolRun(id: string): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [{ type: 'tool-call', name: 'shell', input: { command: 'ls' }, state: 'completed' }],
    timestamp: 1,
    source: 'transcript'
  }
}

function turnKeysOf(messages: NativeChatMessage[]): (string | undefined)[] {
  let turn: string | undefined
  return messages.map((message) => {
    if (message.role === 'user') {
      turn = message.id
    }
    return turn
  })
}

function build(
  messages: NativeChatMessage[],
  overrides: Partial<Parameters<typeof buildNativeChatTranscriptSlots>[0]> = {}
): NativeChatMessageSlot[] {
  return buildNativeChatTranscriptSlots({
    messages,
    turnKeys: turnKeysOf(messages),
    liveTurnKey: undefined,
    receipts: new Map<string, NativeChatResolvedPrompt>(),
    turnStatuses: { active: null, completedByTurn: {} },
    turnDiffs: new Map<string, NativeChatTurnDiff>(),
    expandedTurnKeys: new Set<string>(),
    isWorking: false,
    lifecycleWorking: false,
    ...overrides
  }).filter((slot): slot is NativeChatMessageSlot => slot.kind === 'message')
}

const framed = (slots: NativeChatMessageSlot[]): string[] =>
  slots.filter((slot) => slot.turnAnswer).map((slot) => slot.message.id)

describe('a finished turn answer (local)', () => {
  const settled = {
    active: null,
    completedByTurn: { u: { workedSeconds: 12 } as NativeChatTurnStatus }
  }

  it('frames the last thing the agent said after its work and commentary', () => {
    const slots = build(
      [
        text('u', 'do it', 'user'),
        text('a1', 'Checking the logs first.'),
        toolRun('t1'),
        text('a2', 'Done: the build passes.')
      ],
      { turnStatuses: settled, expandedTurnKeys: new Set(['u']) }
    )
    expect(framed(slots)).toEqual(['a2'])
  })

  it('frames a turn that is only its answer too, but not a turn still running', () => {
    const answered = build([text('u', 'hi', 'user'), text('a1', 'Hello.')], {
      turnStatuses: settled
    })
    expect(framed(answered)).toEqual(['a1'])
    const running = build([text('u', 'hi', 'user'), text('a1', 'Hello.')])
    expect(running.some((slot) => slot.turnAnswer)).toBe(false)
  })

  it('frames only the last answer, never words before a send-back or words with calls under them', () => {
    const slots = build(
      [
        text('u', 'do it', 'user'),
        {
          ...text('a1', 'Adjusting the weight, then testing:'),
          blocks: [
            { type: 'text' as const, text: 'Adjusting the weight, then testing:' },
            {
              type: 'tool-call' as const,
              name: 'Bash',
              input: { command: 'ls' },
              state: 'completed' as const
            }
          ]
        },
        text('m', 'one more thing', 'user'),
        text('a2', 'Done.')
      ],
      { turnStatuses: settled }
    )
    expect(framed(slots)).not.toContain('a1')
  })

  it('drops the newest frame while the agent waits on its own background work', () => {
    const messages = [text('u', 'hi', 'user'), text('a1', 'Hello.')]
    const slots = build(messages, { turnStatuses: settled })
    const held = unframeHeldTurnAnswer(slots, turnKeysOf(messages)).filter(
      (slot): slot is NativeChatMessageSlot => slot.kind === 'message'
    )
    expect(framed(held)).toEqual([])
    expect(framed(slots)).toEqual(['a1'])
  })
})
