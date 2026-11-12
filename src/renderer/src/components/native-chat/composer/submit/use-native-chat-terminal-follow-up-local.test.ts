import { describe, expect, it } from 'vitest'
import { terminalFollowUpDelivery } from './use-native-chat-terminal-follow-up'

describe('terminalFollowUpDelivery (local)', () => {
  it('with Queue follow-ups on, Enter holds and Ctrl/Cmd+Enter goes now', () => {
    expect(terminalFollowUpDelivery(true, true, undefined, undefined)).toBeUndefined()
    expect(terminalFollowUpDelivery(true, true, undefined, { sendNow: true })).toEqual({
      sendNow: true
    })
    expect(terminalFollowUpDelivery(true, true, undefined, { alternate: true })).toEqual({
      sendNow: true
    })
  })

  it('with Queue follow-ups off, Enter goes now and the chord holds', () => {
    expect(terminalFollowUpDelivery(false, true, undefined, undefined)).toEqual({ sendNow: true })
    expect(terminalFollowUpDelivery(false, true, undefined, { sendNow: true })).toBeUndefined()
    expect(terminalFollowUpDelivery(false, true, undefined, { alternate: true })).toBeUndefined()
  })

  it('leaves idle sends, retries and held cards as they are', () => {
    expect(terminalFollowUpDelivery(false, false, undefined, undefined)).toBeUndefined()
    expect(terminalFollowUpDelivery(false, false, undefined, { sendNow: true })).toEqual({
      sendNow: true
    })
    expect(terminalFollowUpDelivery(false, true, { text: 'x' }, undefined)).toBeUndefined()
    const held = { held: { text: 'x', imagePaths: [] } }
    expect(terminalFollowUpDelivery(false, true, undefined, held)).toBe(held)
  })
})
