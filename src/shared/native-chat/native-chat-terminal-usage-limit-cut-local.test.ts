import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from './native-chat-types'
import { latestNativeChatTerminalUsageLimitCut } from './native-chat-terminal-usage-limit-cut'

const RESETS_AT = 1792344600_000

function limitRow(id: string, timestamp = 1_000): NativeChatMessage {
  return {
    id,
    role: 'system',
    source: 'transcript',
    timestamp,
    blocks: [
      {
        type: 'text',
        text: 'Claude hit its session limit.',
        tone: 'warning',
        usageLimitTurnItemId: id,
        failure: {
          kind: 'usageLimitReached',
          usageLimit: { window: 'session', resetsAt: RESETS_AT }
        }
      }
    ]
  }
}

function row(
  role: NativeChatMessage['role'],
  id: string,
  source: NativeChatMessage['source'] = 'transcript'
): NativeChatMessage {
  return { id, role, source, timestamp: 2_000, blocks: [{ type: 'text', text: id }] }
}

describe('latestNativeChatTerminalUsageLimitCut', () => {
  it('offers the latest limit row with its reset and the time it hit', () => {
    expect(
      latestNativeChatTerminalUsageLimitCut([
        row('user', 'prompt'),
        row('assistant', 'reply'),
        limitRow('limit')
      ])
    ).toEqual({ turnItemId: 'limit', resetsAt: RESETS_AT, turnEndedAt: 1_000 })
  })

  it('stands past a local aside such as a command marker', () => {
    expect(
      latestNativeChatTerminalUsageLimitCut([
        limitRow('limit'),
        row('system', 'command:1', 'scrape')
      ])
    ).toMatchObject({ turnItemId: 'limit' })
  })

  it.each([
    ['a message the person sent', row('user', 'next')],
    ['a pending echo of one', row('user', 'pending', 'scrape')],
    ['a reply', row('assistant', 'reply')],
    ['a tool step', row('tool', 'tool')]
  ])('is gone after %s', (_, after) => {
    expect(latestNativeChatTerminalUsageLimitCut([limitRow('limit'), after])).toBeNull()
  })

  it('is the newer of two limits', () => {
    expect(
      latestNativeChatTerminalUsageLimitCut([
        limitRow('old'),
        row('user', 'retry'),
        limitRow('new', 3_000)
      ])
    ).toMatchObject({ turnItemId: 'new', turnEndedAt: 3_000 })
  })

  it('ignores warnings that carry no usage limit', () => {
    const credits: NativeChatMessage = {
      ...row('system', 'credits'),
      blocks: [{ type: 'text', text: "You're out of usage credits.", tone: 'warning' }]
    }
    expect(latestNativeChatTerminalUsageLimitCut([credits])).toBeNull()
  })
})
