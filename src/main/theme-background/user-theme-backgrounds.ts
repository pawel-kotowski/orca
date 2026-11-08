import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, dialog, type OpenDialogOptions, type WebContents } from 'electron'
import {
  USER_THEME_BACKGROUND_MAX_BYTES,
  isUserThemeBackgroundName,
  userThemeBackgroundKind,
  type UserThemeBackgroundImage
} from '../../shared/theme-background/user-theme-background'

/**
 * Images the person picked from disk for the window background (Paweł, 2026-11-08: "add option to
 * change background of my theme, via selecting images from disk"). Each pick is copied into
 * `<userData>/theme-backgrounds/<hash>.<ext>`, so moving or deleting the original keeps the
 * background, and the renderer can only ever read files from that folder by their hashed name.
 */
export function userThemeBackgroundDir(userDataDir: string): string {
  return join(userDataDir, 'theme-backgrounds')
}

/** Copies one picked file into the folder; returns its stored name, or why it was refused. */
export async function storeUserThemeBackground(
  dir: string,
  bytes: Uint8Array
): Promise<{ name: string } | { error: string }> {
  if (bytes.byteLength > USER_THEME_BACKGROUND_MAX_BYTES) {
    return { error: 'too-large' }
  }
  const kind = userThemeBackgroundKind(bytes)
  if (!kind) {
    return { error: 'not-an-image' }
  }
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
  const name = `${hash}.${kind}`
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, name), bytes)
  return { name }
}

export async function listUserThemeBackgrounds(dir: string): Promise<string[]> {
  let names: string[]
  try {
    names = (await readdir(dir)).filter(isUserThemeBackgroundName)
  } catch {
    return []
  }
  const dated = await Promise.all(
    names.map(async (name) => ({ name, at: (await stat(join(dir, name))).mtimeMs }))
  )
  // Why newest first: the image just added leads the gallery.
  return dated.sort((a, b) => b.at - a.at).map((entry) => entry.name)
}

export async function readUserThemeBackground(
  dir: string,
  name: unknown
): Promise<UserThemeBackgroundImage | null> {
  if (!isUserThemeBackgroundName(name)) {
    return null
  }
  try {
    const bytes = await readFile(join(dir, name))
    const kind = userThemeBackgroundKind(bytes)
    return kind ? { name, kind, bytes: new Uint8Array(bytes) } : null
  } catch {
    return null
  }
}

export async function removeUserThemeBackground(dir: string, name: unknown): Promise<void> {
  if (isUserThemeBackgroundName(name)) {
    await rm(join(dir, name), { force: true })
  }
}

/** The file dialog, then the copy; null when the person cancels. */
export async function pickUserThemeBackground(
  dir: string,
  webContents?: WebContents
): Promise<{ name: string } | { error: string } | null> {
  const owner = webContents ? BrowserWindow.fromWebContents(webContents) : null
  const options: OpenDialogOptions = {
    title: 'Choose a background image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  }
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options)
  const path = result.canceled ? undefined : result.filePaths[0]
  if (!path) {
    return null
  }
  const size = (await stat(path)).size
  if (size > USER_THEME_BACKGROUND_MAX_BYTES) {
    return { error: 'too-large' }
  }
  return storeUserThemeBackground(dir, new Uint8Array(await readFile(path)))
}
