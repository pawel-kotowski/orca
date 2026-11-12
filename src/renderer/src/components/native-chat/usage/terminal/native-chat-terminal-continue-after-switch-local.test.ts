import { describe, expect, it } from 'vitest'
import {
  CONTINUE_AFTER_SWITCH_FALLBACK_MS,
  CONTINUE_AFTER_SWITCH_MAX_WAIT_MS,
  CONTINUE_AFTER_SWITCH_SETTLE_MS,
  nativeChatContinueAfterSwitchStep,
  withNewPtySeen,
  type NativeChatContinueAfterSwitch,
  type NativeChatContinueAfterSwitchObserved
} from './native-chat-terminal-continue-after-switch'

const ARMED: NativeChatContinueAfterSwitch = {
  turnItemId: 'limit',
  oldPtyId: 'pty-old',
  armedAt: 1_000,
  accountName: 'moshealth'
}

function observed(
  overrides: Partial<NativeChatContinueAfterSwitchObserved> = {}
): NativeChatContinueAfterSwitchObserved {
  return {
    cutTurnItemId: 'limit',
    ptyId: 'pty-new',
    restartQueued: false,
    status: null,
    ...overrides
  }
}

describe('continue after an account switch', () => {
  it('waits while the old Claude has not restarted', () => {
    expect(
      nativeChatContinueAfterSwitchStep(
        ARMED,
        observed({ ptyId: 'pty-old', restartQueued: true }),
        2_000
      )
    ).toEqual({ kind: 'wait' })
    expect(nativeChatContinueAfterSwitchStep(ARMED, observed({ ptyId: null }), 2_000)).toEqual({
      kind: 'wait'
    })
  })

  it('notes the new PTY once, then waits for the restarted Claude to report in', () => {
    const seen = withNewPtySeen(ARMED, 'pty-new', 5_000)
    expect(seen.newPty).toEqual({ ptyId: 'pty-new', seenAt: 5_000 })
    expect(withNewPtySeen(seen, 'pty-new', 9_000)).toBe(seen)
    expect(withNewPtySeen(ARMED, 'pty-old', 5_000)).toBe(ARMED)
    expect(nativeChatContinueAfterSwitchStep(ARMED, observed(), 5_000)).toEqual({ kind: 'wait' })
  })

  it('sends a moment after the restarted Claude starts', () => {
    const seen = withNewPtySeen(ARMED, 'pty-new', 5_000)
    const started = observed({ status: { state: 'done', updatedAt: 6_000 } })
    const at = 6_000 + CONTINUE_AFTER_SWITCH_SETTLE_MS
    expect(nativeChatContinueAfterSwitchStep(seen, started, 6_100)).toEqual({
      kind: 'wait',
      until: at
    })
    expect(nativeChatContinueAfterSwitchStep(seen, started, at)).toEqual({ kind: 'send' })
  })

  it('still sends when the start went unseen, after a longer wait', () => {
    const seen = withNewPtySeen(ARMED, 'pty-new', 5_000)
    const stale = observed({ status: { state: 'done', updatedAt: 900 } })
    expect(
      nativeChatContinueAfterSwitchStep(seen, stale, 5_000 + CONTINUE_AFTER_SWITCH_FALLBACK_MS)
    ).toEqual({ kind: 'send' })
  })

  it('never sends while Claude works or while the cut is hidden', () => {
    const seen = withNewPtySeen(ARMED, 'pty-new', 5_000)
    const later = 60_000
    expect(
      nativeChatContinueAfterSwitchStep(
        seen,
        observed({ status: { state: 'working', updatedAt: 6_000 } }),
        later
      )
    ).toEqual({ kind: 'wait' })
    // The person sent something themselves, or the transcript is still being read.
    expect(
      nativeChatContinueAfterSwitchStep(seen, observed({ cutTurnItemId: null }), later)
    ).toEqual({
      kind: 'wait'
    })
  })

  it('gives up on a newer limit, and on a restart that never came', () => {
    expect(
      nativeChatContinueAfterSwitchStep(ARMED, observed({ cutTurnItemId: 'newer' }), 2_000)
    ).toEqual({
      kind: 'abandon'
    })
    expect(
      nativeChatContinueAfterSwitchStep(
        ARMED,
        observed({ ptyId: 'pty-old', restartQueued: true }),
        ARMED.armedAt + CONTINUE_AFTER_SWITCH_MAX_WAIT_MS + 1
      )
    ).toEqual({ kind: 'abandon' })
  })
})
