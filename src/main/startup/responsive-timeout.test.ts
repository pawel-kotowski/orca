import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startResponsiveTimeout } from './responsive-timeout'

describe('startResponsiveTimeout', () => {
  let clock = 0
  const now = () => clock

  beforeEach(() => {
    vi.useFakeTimers()
    clock = 0
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const tick = (wallMs: number) => {
    clock += wallMs
    vi.advanceTimersByTime(1_000)
  }

  it('expires after the given responsive time', () => {
    const onExpire = vi.fn()
    startResponsiveTimeout(10_000, onExpire, now)
    for (let i = 0; i < 9; i += 1) {
      tick(1_000)
    }
    expect(onExpire).not.toHaveBeenCalled()
    tick(1_000)
    expect(onExpire).toHaveBeenCalledOnce()
  })

  // A Keychain prompt froze main for 14 minutes; that must not count as the daemon hanging.
  it('does not count a frozen main thread toward the timeout', () => {
    const onExpire = vi.fn()
    startResponsiveTimeout(10_000, onExpire, now)
    tick(1_000)
    tick(830_000)
    expect(onExpire).not.toHaveBeenCalled()
    for (let i = 0; i < 7; i += 1) {
      tick(1_000)
    }
    expect(onExpire).not.toHaveBeenCalled()
    tick(1_000)
    expect(onExpire).toHaveBeenCalledOnce()
  })

  it('stops when cancelled', () => {
    const onExpire = vi.fn()
    const cancel = startResponsiveTimeout(3_000, onExpire, now)
    tick(1_000)
    cancel()
    for (let i = 0; i < 5; i += 1) {
      tick(1_000)
    }
    expect(onExpire).not.toHaveBeenCalled()
  })
})
