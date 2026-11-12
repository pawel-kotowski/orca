import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Whose Chrome profile a link should open in: the account's (by email, else short name), or with
 * `owner` Chrome's own first profile, the one that belongs to whoever owns this Mac.
 */
export type ChromeProfileAccount = { email: string | null; name: string | null; owner?: boolean }

/** The renderer's `chromeAccount` argument, validated; null when it names nobody. */
export function parseChromeProfileAccount(value: unknown): ChromeProfileAccount | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const { email, name, owner } = value as Record<string, unknown>
  if (owner === true) {
    return { email: null, name: null, owner: true }
  }
  const text = (field: unknown): string | null =>
    typeof field === 'string' && field.trim() ? field.trim().slice(0, 200) : null
  return text(email) || text(name) ? { email: text(email), name: text(name) } : null
}

/** Chrome's first profile keeps this directory name whatever it is renamed to. */
const OWNER_PROFILE_DIR = 'Default'

type InfoCache = Record<string, { name?: unknown; user_name?: unknown }>

function lower(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/**
 * The Chrome profile signed in as the account's email, else the one named like its short name,
 * else the one whose name or address contains that short name.
 */
export function pickChromeProfileDir(
  infoCache: InfoCache,
  account: ChromeProfileAccount
): string | null {
  if (account.owner) {
    return OWNER_PROFILE_DIR in infoCache ? OWNER_PROFILE_DIR : null
  }
  const email = lower(account.email)
  const name = lower(account.name)
  const entries = Object.entries(infoCache)
  const byEmail = email ? entries.filter(([, info]) => lower(info.user_name) === email) : []
  if (byEmail.length === 1) {
    return byEmail[0]![0]
  }
  const byName = name ? entries.filter(([, info]) => lower(info.name) === name) : []
  if (byName.length === 1) {
    return byName[0]![0]
  }
  // Why containment: a profile kept for a subscription may sign in with another address that
  // carries its name (robotec's profile is "pawel.kotowski.robotec.ai.1@gmail.com").
  const containing =
    name.length >= 3
      ? entries.filter(
          ([, info]) => lower(info.name).includes(name) || lower(info.user_name).includes(name)
        )
      : []
  return containing.length === 1 ? containing[0]![0] : null
}

async function readInfoCache(): Promise<InfoCache | null> {
  try {
    const localState = JSON.parse(
      await readFile(
        join(homedir(), 'Library/Application Support/Google/Chrome/Local State'),
        'utf8'
      )
    ) as { profile?: { info_cache?: InfoCache } }
    return localState.profile?.info_cache ?? null
  } catch {
    return null
  }
}

/**
 * Open `url` in the Chrome profile of `account` (Paweł, 2026-11-09: "when i open link in chat it
 * should open in chrome that is same profile (email) as default subscription for given project").
 * False when this is not macOS, Chrome is missing or no profile matches; the caller then opens it
 * the usual way.
 */
export async function openUrlInChromeProfile(
  url: string,
  account: ChromeProfileAccount
): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return false
  }
  const infoCache = await readInfoCache()
  const dir = infoCache ? pickChromeProfileDir(infoCache, account) : null
  if (!dir) {
    return false
  }
  // Why `open -na … --profile-directory`: Chrome's own switch reaches a profile whether its
  // window is open or not; the new process hands the URL to the running browser and exits.
  return await new Promise((resolve) => {
    execFile(
      'open',
      ['-na', 'Google Chrome', '--args', `--profile-directory=${dir}`, url],
      (error) => resolve(!error)
    )
  })
}
