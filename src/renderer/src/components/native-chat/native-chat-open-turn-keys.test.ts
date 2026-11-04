import { describe, expect, it } from 'vitest'
import { nativeChatOpenTurnKeys } from './native-chat-expanded-keys'

describe('nativeChatOpenTurnKeys', () => {
  const turnKeys = [undefined, 't1', 't1', 't2', 't3']

  it('folded by default: only the turns the reader opened', () => {
    const toggled = new Set(['t2'])
    expect(nativeChatOpenTurnKeys(turnKeys, toggled, false)).toBe(toggled)
  })

  it('open by default: every turn except the ones the reader closed', () => {
    expect([...nativeChatOpenTurnKeys(turnKeys, new Set(['t2']), true)]).toEqual(['t1', 't3'])
  })
})
