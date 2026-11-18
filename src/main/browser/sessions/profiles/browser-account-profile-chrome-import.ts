import type { BrowserSessionProfile } from '../../../../shared/browser/workspaces/browser-workspace-types'
import {
  ACCOUNT_BROWSER_PROFILE_MAC_OWNER,
  type ManagedBrowserProfileOwner
} from '../../../../shared/browser/profiles/browser-profile-scope'
import {
  pickChromeProfileDir,
  readChromeProfileInfoCache,
  type ChromeProfileAccount
} from '../../../chrome/chrome-profile-link'
import {
  detectInstalledBrowsers,
  selectBrowserProfile
} from '../../../browser/cookies/sources/browser-cookie-detection'
import { importCookiesFromBrowser } from '../../../browser/cookies/browser-cookie-import'
import { browserSessionRegistry } from './browser-session-registry'

/** The Chrome account a profile's owner stands for: the subscription by email and short name, or the Mac owner. */
export function chromeAccountForProfileOwner(
  owner: ManagedBrowserProfileOwner,
  label: string
): ChromeProfileAccount {
  return owner.id === ACCOUNT_BROWSER_PROFILE_MAC_OWNER
    ? { email: null, name: null, owner: true }
    : { email: owner.id, name: label }
}

/**
 * Fill a new account profile with the cookies of the Chrome profile that account uses, matched as
 * chat links pick their Chrome profile (Paweł, 2026-11-18: "use given chrome profiles cookies in
 * orca browsers depending on orca workspace"). A one-time copy: later Chrome logins need a
 * re-import from Settings → Browser. Any failure leaves the profile empty, never missing.
 */
export async function importAccountChromeCookies(
  profile: BrowserSessionProfile,
  owner: ManagedBrowserProfileOwner,
  label: string
): Promise<BrowserSessionProfile> {
  try {
    const infoCache = await readChromeProfileInfoCache()
    const dir = infoCache
      ? pickChromeProfileDir(infoCache, chromeAccountForProfileOwner(owner, label))
      : null
    const chrome = dir ? detectInstalledBrowsers().find((b) => b.family === 'chrome') : undefined
    if (!dir || !chrome) {
      return profile
    }
    const browser = dir === chrome.selectedProfile ? chrome : selectBrowserProfile(chrome, dir)
    if (!browser) {
      return profile
    }
    const result = await importCookiesFromBrowser(browser, profile.partition)
    if (!result.ok) {
      return profile
    }
    const profileName = browser.profiles.find((p) => p.directory === dir)?.name ?? dir
    return (
      browserSessionRegistry.updateProfileSource(profile.id, {
        browserFamily: 'chrome',
        profileName,
        importedAt: Date.now()
      }) ?? profile
    )
  } catch {
    return profile
  }
}
