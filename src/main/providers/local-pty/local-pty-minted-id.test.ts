import { describe, expect, it } from 'vitest'
import { normalizeLocalCallerSessionId, LOCAL_PTY_ID_PREFIX } from './local-pty-launch-context'
import { allocatePtyId } from './local-pty-provider-state'

// After a restart that could not reach the terminal daemon, this provider's counter ids ("1",
// "2") were saved in the layout; the next start made the daemon create terminals under them and
// resume the panes' agents a second time. Its own ids are now unique and still never reused.
describe('local terminal ids', () => {
  it('are minted unique, never a counter', () => {
    const first = allocatePtyId(undefined)
    const second = allocatePtyId(undefined)
    expect(first.startsWith(LOCAL_PTY_ID_PREFIX)).toBe(true)
    expect(first).not.toMatch(/^\d+$/)
    expect(second).not.toBe(first)
  })

  it('are not reused by a caller except an explicit attach', () => {
    const own = allocatePtyId(undefined)
    expect(normalizeLocalCallerSessionId(own)).toBeNull()
    expect(normalizeLocalCallerSessionId(own, true)).toBe(own)
    expect(normalizeLocalCallerSessionId('7')).toBeNull()
    expect(normalizeLocalCallerSessionId('worktree@@abcd1234')).toBe('worktree@@abcd1234')
  })
})
