import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../native-chat-types'
import { assignNativeChatPendingOccurrence } from './native-chat-pending-occurrence'
import {
  pendingSendsAsMessages,
  prunePendingSends,
  type NativeChatPendingSend
} from './native-chat-pending-sends'

function message(
  id: string,
  role: 'user' | 'assistant',
  text: string,
  timestamp: number
): NativeChatMessage {
  return {
    id,
    role,
    blocks: [{ type: 'text', text }],
    timestamp,
    source: 'transcript'
  }
}

describe('pending send occurrence reconciliation', () => {
  it('keeps the next identical echo after pruning an earlier occurrence', () => {
    const first = assignNativeChatPendingOccurrence<NativeChatPendingSend>([], {
      id: 'p1',
      text: 'repeat',
      sentAt: 100,
      afterMessageId: 'paged-out-boundary'
    })
    const repeated = [
      first,
      assignNativeChatPendingOccurrence([first], {
        id: 'p2',
        text: 'repeat',
        sentAt: 200,
        afterMessageId: 'paged-out-boundary'
      })
    ]
    expect(first.matchingOccurrence).toBeUndefined()
    expect(repeated[1]).toMatchObject({ matchingOccurrence: 2, matchingAfterTimestamp: 100 })

    const firstCompletedTurn = [
      message('u1', 'user', 'repeat', 150),
      message('a1', 'assistant', 'done', 160)
    ]
    const afterFirstPrune = prunePendingSends(repeated, firstCompletedTurn)

    expect(afterFirstPrune.map((entry) => entry.id)).toEqual(['p2'])
    expect(
      pendingSendsAsMessages(afterFirstPrune, firstCompletedTurn).map((entry) => entry.id)
    ).toEqual(['pending:p2'])

    const secondCompletedTurn = [
      ...firstCompletedTurn,
      message('u2', 'user', 'repeat', 250),
      message('a2', 'assistant', 'done again', 260)
    ]
    expect(pendingSendsAsMessages(afterFirstPrune, secondCompletedTurn)).toEqual([])
    expect(prunePendingSends(afterFirstPrune, secondCompletedTurn)).toEqual([])
  })
})

describe('an image sent while the agent works', () => {
  it('retires its echo once the queued row lands with the image inline', () => {
    const pending = assignNativeChatPendingOccurrence<NativeChatPendingSend>([], {
      id: 'p1',
      text: '',
      imagePaths: ['/tmp/orca-paste-1.png'],
      sentAt: 100,
      afterMessageId: 'a0'
    })
    const turn: NativeChatMessage[] = [
      message('a0', 'assistant', 'working', 90),
      {
        id: 'q1',
        role: 'user',
        blocks: [
          { type: 'text', text: '[Image #1]' },
          { type: 'image-ref', url: 'data:image/jpeg;base64,AAAA', alt: 'Pasted image' }
        ],
        timestamp: 110,
        source: 'transcript'
      },
      message('a1', 'assistant', 'done', 120)
    ]
    expect(prunePendingSends([pending], turn)).toEqual([])
    expect(pendingSendsAsMessages([pending], turn)).toEqual([])
  })
})

describe('pending sends typed through an agent TUI', () => {
  const COMPOSER_TEXT = 'summarize the failing test and propose a fix'

  it('prunes the echo of a row carrying the clear byte', () => {
    const pending = [{ id: 'p1', text: COMPOSER_TEXT, sentAt: 100, afterMessageId: 'boundary' }]
    const transcript = [
      message('u1', 'user', `\u0015${COMPOSER_TEXT}`, 150),
      message('a1', 'assistant', 'done', 160)
    ]

    expect(prunePendingSends(pending, transcript)).toEqual([])
    expect(pendingSendsAsMessages(pending, transcript)).toEqual([])
  })
})
