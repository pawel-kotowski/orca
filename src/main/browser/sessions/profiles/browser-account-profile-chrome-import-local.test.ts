import { describe, expect, it } from 'vitest'
import { pickChromeProfileDir } from '../../../chrome/chrome-profile-link'
import { chromeAccountForProfileOwner } from './browser-account-profile-chrome-import'

// Shaped like Paweł's Chrome `Local State` (2026-11-18): display names differ from the aliases.
const infoCache = {
  Default: { name: 'Your Chrome', user_name: 'me@gmail.com' },
  'Profile 3': { name: 'moshealth.com', user_name: 'pawel.kotowski@moshealth.com' },
  'Profile 5': { name: 'K', user_name: 'pawel.kotowski@kyotutechnology.com' },
  'Profile 6': { name: 'R', user_name: 'pawel.kotowski.robotec.ai.1@gmail.com' }
}

const dirFor = (id: string, label: string): string | null =>
  pickChromeProfileDir(infoCache, chromeAccountForProfileOwner({ kind: 'account', id }, label))

describe("an account profile's Chrome source", () => {
  it('is the Chrome profile signed in as the subscription', () => {
    expect(dirFor('pawel.kotowski@kyotutechnology.com', 'kyotutechnology')).toBe('Profile 5')
  })

  it("is the profile carrying the account's short name when its email differs", () => {
    expect(dirFor('pawel.kotowski@robotec.ai', 'robotec')).toBe('Profile 6')
  })

  it("is Chrome's first profile for the Mac owner", () => {
    expect(dirFor('mac-owner', 'Personal')).toBe('Default')
  })
})
