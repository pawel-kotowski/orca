import { describe, expect, it } from 'vitest'
import {
  closedChatTakeoverRefusal,
  refuseHandedOverChatStart,
  scratchSessionFor
} from './closed-chat-takeover'

describe('a new chat taking over a closed chat’s conversation', () => {
  it('takes it from a closed, idle chat on this machine only', () => {
    expect(closedChatTakeoverRefusal({ local: true, tabOpen: false, agentRunning: false })).toBe(
      null
    )
    expect(closedChatTakeoverRefusal({ local: true, tabOpen: true, agentRunning: false })).toMatch(
      /open/
    )
    expect(closedChatTakeoverRefusal({ local: true, tabOpen: false, agentRunning: true })).toMatch(
      /running/
    )
    expect(
      closedChatTakeoverRefusal({ local: false, tabOpen: false, agentRunning: false })
    ).toMatch(/another machine/)
  })

  it('keeps the first chat’s scratch folder along the hand-overs', () => {
    const records = [
      { sessionId: 'wake-1', handedOverTo: { sessionId: 'wake-2', at: 1 } },
      { sessionId: 'wake-2', handedOverTo: { sessionId: 'wake-3', at: 2 } },
      { sessionId: 'wake-3' },
      { sessionId: 'other' }
    ]
    expect(scratchSessionFor('wake-3', records)).toBe('wake-1')
    expect(scratchSessionFor('wake-2', records)).toBe('wake-1')
    expect(scratchSessionFor('other', records)).toBe('other')
  })

  it('a chat that handed its conversation on never starts again', () => {
    expect(() =>
      refuseHandedOverChatStart({ handedOverTo: { sessionId: 'new', at: 1 } }, () => 'agent x')
    ).toThrow(/went on in another chat \("agent x"\)/)
    expect(() => refuseHandedOverChatStart({}, () => undefined)).not.toThrow()
  })
})
