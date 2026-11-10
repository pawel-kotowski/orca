import { describe, expect, it } from 'vitest'
import { pickChromeProfileDir } from './chrome-profile-link'

// Paweł's real profile list on 2026-11-09.
const cache = {
  Default: { name: 'Your Chrome', user_name: 'p.kotowski89@gmail.com' },
  'Profile 3': { name: 'moshealth.com', user_name: 'pawel.kotowski@moshealth.com' },
  'Profile 5': { name: 'K', user_name: 'pawel.kotowski@kyotutechnology.com' },
  'Profile 6': { name: 'R', user_name: 'pawel.kotowski.robotec.ai.1@gmail.com' }
}

describe('the Chrome profile for a subscription', () => {
  it('matches the signed-in email first', () => {
    expect(
      pickChromeProfileDir(cache, { email: 'Pawel.Kotowski@moshealth.com', name: 'moshealth' })
    ).toBe('Profile 3')
    expect(pickChromeProfileDir(cache, { email: 'p.kotowski89@gmail.com', name: 'personal' })).toBe(
      'Default'
    )
  })

  it("falls back to the profile whose address carries the subscription's short name", () => {
    expect(
      pickChromeProfileDir(cache, { email: 'pawel.kotowski@robotec.ai', name: 'robotec' })
    ).toBe('Profile 6')
  })

  it('finds nothing for an unknown account', () => {
    expect(pickChromeProfileDir(cache, { email: 'x@y.z', name: 'y' })).toBeNull()
    expect(pickChromeProfileDir(cache, { email: null, name: null })).toBeNull()
  })
})

describe("the owner's Chrome profile", () => {
  it("is Chrome's first profile, whatever it is called", () => {
    expect(pickChromeProfileDir(cache, { email: null, name: null, owner: true })).toBe('Default')
  })

  it('is missing when Chrome has no first profile', () => {
    const { Default: _owner, ...rest } = cache
    expect(pickChromeProfileDir(rest, { email: null, name: null, owner: true })).toBeNull()
  })
})
