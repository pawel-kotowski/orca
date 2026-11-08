/** Window background images the person picked from disk (main: user-theme-backgrounds.ts). */

export const USER_THEME_BACKGROUND_MAX_BYTES = 25 * 1024 * 1024

export type UserThemeBackgroundKind = 'png' | 'jpg' | 'webp' | 'gif'

export type UserThemeBackgroundImage = {
  name: string
  kind: UserThemeBackgroundKind
  bytes: Uint8Array
}

export type UserThemeBackgroundSize = 'cover' | 'contain' | 'tile'
export type UserThemeBackgroundPosition = 'center' | 'top' | 'bottom' | 'left' | 'right'

/** The choice, kept in settings (`nativeChatAppearance.themeBackground`). */
export type UserThemeBackgroundChoice = {
  name: string
  opacity: number
  size: UserThemeBackgroundSize
  position: UserThemeBackgroundPosition
}

const NAME = /^[0-9a-f]{16}\.(png|jpg|webp|gif)$/

export function isUserThemeBackgroundName(value: unknown): value is string {
  return typeof value === 'string' && NAME.test(value)
}

export const USER_THEME_BACKGROUND_MIME: Record<UserThemeBackgroundKind, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif'
}

/** The image kind from its first bytes, never from the file name. */
export function userThemeBackgroundKind(bytes: Uint8Array): UserThemeBackgroundKind | null {
  const at = (index: number): number => bytes[index] ?? -1
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) {
    return 'png'
  }
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) {
    return 'jpg'
  }
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) {
    return 'gif'
  }
  const riff = at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46
  const webp = at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50
  return riff && webp ? 'webp' : null
}

const SIZES: readonly UserThemeBackgroundSize[] = ['cover', 'contain', 'tile']
const POSITIONS: readonly UserThemeBackgroundPosition[] = [
  'center',
  'top',
  'bottom',
  'left',
  'right'
]

/** The saved choice, or null when there is none or it is unreadable. */
export function readUserThemeBackgroundChoice(
  appearance: unknown
): UserThemeBackgroundChoice | null {
  const value =
    appearance && typeof appearance === 'object'
      ? (appearance as { themeBackground?: unknown }).themeBackground
      : undefined
  if (!value || typeof value !== 'object') {
    return null
  }
  const raw = value as Record<string, unknown>
  if (!isUserThemeBackgroundName(raw.name)) {
    return null
  }
  const opacity =
    typeof raw.opacity === 'number' && raw.opacity >= 0 && raw.opacity <= 1 ? raw.opacity : 0.6
  return {
    name: raw.name,
    opacity,
    size: SIZES.includes(raw.size as UserThemeBackgroundSize)
      ? (raw.size as UserThemeBackgroundSize)
      : 'cover',
    position: POSITIONS.includes(raw.position as UserThemeBackgroundPosition)
      ? (raw.position as UserThemeBackgroundPosition)
      : 'center'
  }
}
