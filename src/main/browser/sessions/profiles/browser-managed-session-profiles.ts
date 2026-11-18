import type { BrowserSessionProfile } from '../../../../shared/browser/workspaces/browser-workspace-types'
import {
  isManagedBrowserProfileOf,
  isManagedBrowserProfileOwnerKind,
  managedBrowserProfileOwnerKey,
  type ManagedBrowserProfileOwner
} from '../../../../shared/browser/profiles/browser-profile-scope'
import { importAccountChromeCookies } from './browser-account-profile-chrome-import'
import { InFlightPromiseDedupe } from '../../../../shared/concurrency/in-flight-promise-dedupe'
import { browserSessionRegistry } from './browser-session-registry'

const creations = new InFlightPromiseDedupe<BrowserSessionProfile | null>()

function findManagedProfile(owner: ManagedBrowserProfileOwner): BrowserSessionProfile | undefined {
  return browserSessionRegistry
    .listProfiles()
    .find((profile) => isManagedBrowserProfileOf(profile, owner))
}

/** Coalesce first-use profile creation for each owner. */
export async function ensureManagedBrowserProfile(
  owner: ManagedBrowserProfileOwner,
  label: string
): Promise<BrowserSessionProfile | null> {
  if (
    !isManagedBrowserProfileOwnerKind(owner?.kind) ||
    typeof owner.id !== 'string' ||
    typeof label !== 'string'
  ) {
    throw new Error('Invalid managed browser profile owner')
  }
  const { kind, id } = owner
  return (
    findManagedProfile(owner) ??
    creations.run(managedBrowserProfileOwnerKey(owner), async () => {
      const profile = await browserSessionRegistry.createProfile('isolated', label, { kind, id })
      // Why before answering: the tab waits on this profile, so its first page loads signed in.
      return profile && kind === 'account'
        ? await importAccountChromeCookies(profile, owner, label)
        : profile
    })
  )
}

export function deleteManagedBrowserProfile(owner: ManagedBrowserProfileOwner): Promise<boolean> {
  const profile = findManagedProfile(owner)
  return profile ? browserSessionRegistry.deleteProfile(profile.id) : Promise.resolve(false)
}
