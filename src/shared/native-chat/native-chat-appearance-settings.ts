import { HEX_COLOR_RE } from '../color-validation'
import type { NativeChatProviderChoices } from './native-chat-providers'

export type NativeChatAppearanceSettings = {
  /** Absent follows the IDE font. */
  fontFamily?: string
  /** Chat text size in px, 12–20; absent = 14. */
  fontSize?: number
  /** Code text size in px, 10–18; absent = 12. */
  codeFontSize?: number
  /** Transcript and composer width; absent = comfortable (46rem). */
  width?: 'comfortable' | 'wide' | 'full'
  /** Chat contrast, 50–150; absent = 100. */
  contrast?: number
  /** Follow the terminal interface font and theme; absent = false. */
  matchTerminalInterface?: boolean
  /** How solid the chat sits over a theme background image, 30–100 percent; absent = 75. */
  imageOverlayOpacity?: number
  /** Chat text color in the light theme, as typed (hex when valid); absent = theme default. */
  textColorLight?: string
  /** Chat text color in the dark theme, as typed (hex when valid); absent = theme default. */
  textColorDark?: string
  /** Your message bubble color in the light theme, as typed (hex when valid); absent = theme default. */
  userBubbleColorLight?: string
  /** Your message bubble color in the dark theme, as typed (hex when valid); absent = theme default. */
  userBubbleColorDark?: string
  /**
   * Whether an agent launched in its terminal (CLI) opens in that terminal's Chat UI view; absent =
   * on. Not an appearance value, so resetting appearance keeps it.
   */
  cliAgentsOpenInChat?: boolean
  /** Whether a run of tool calls shows each step without a click; absent = on. */
  toolStepsOpen?: boolean
}

/** Tool runs open to their steps unless the user turned that off. */
export function nativeChatToolStepsOpen(
  settings: { nativeChatAppearance?: NativeChatAppearanceSettings } | null | undefined
): boolean {
  // Why: until settings load (and in a bare store) runs stay folded, as upstream draws them.
  return settings != null && settings.nativeChatAppearance?.toolStepsOpen !== false
}

/** A CLI agent's new tab opens in its terminal-backed Chat UI unless the user turned that off. */
export function cliAgentsOpenInChat(
  settings: { nativeChatAppearance?: NativeChatAppearanceSettings } | null | undefined
): boolean {
  return settings?.nativeChatAppearance?.cliAgentsOpenInChat !== false
}

export const NATIVE_CHAT_COLOR_KEYS = [
  'textColorLight',
  'textColorDark',
  'userBubbleColorLight',
  'userBubbleColorDark'
] as const
export type NativeChatColorKey = (typeof NATIVE_CHAT_COLOR_KEYS)[number]

export type ResolvedNativeChatAppearanceSettings = Required<
  Pick<
    NativeChatAppearanceSettings,
    | 'fontFamily'
    | 'fontSize'
    | 'codeFontSize'
    | 'width'
    | 'contrast'
    | 'matchTerminalInterface'
    | 'imageOverlayOpacity'
  >
> &
  Record<NativeChatColorKey, string | undefined>

export type AgentDefaultSurface = 'chat' | 'terminal'

export type NativeChatGlobalSettings = {
  /** Unlisted agents follow this default; absent means terminal. */
  agentDefaultSurface?: AgentDefaultSurface
  nativeChatAppearance?: NativeChatAppearanceSettings
  /** Off keeps chats unnamed without running a naming agent. Absent means on. */
  nativeChatAutoName?: boolean
  /** Explicit per-agent overrides of the default surface. */
  nativeChatProviders?: NativeChatProviderChoices
  /** Own sends bring the latest into view; off keeps a reader who scrolled up in place. Absent means on. */
  nativeChatScrollToLatestOnSend?: boolean
}

/** Only explicit OFF keeps a reader's place on send. */
export function nativeChatScrollsToLatestOnSend(
  settings: { readonly nativeChatScrollToLatestOnSend?: unknown } | null | undefined
): boolean {
  return settings?.nativeChatScrollToLatestOnSend !== false
}

export const DEFAULT_NATIVE_CHAT_FONT_SIZE = 14
export const DEFAULT_NATIVE_CHAT_CODE_FONT_SIZE = 12
export const DEFAULT_NATIVE_CHAT_CONTRAST = 100
export const DEFAULT_NATIVE_CHAT_IMAGE_OVERLAY_OPACITY = 75

const KNOWN_KEYS: readonly string[] = [
  'fontFamily',
  'fontSize',
  'codeFontSize',
  'width',
  'contrast',
  'matchTerminalInterface',
  'imageOverlayOpacity',
  ...NATIVE_CHAT_COLOR_KEYS
]

// Why: kept as typed so a half-entered hex survives the next write; validated where it is applied.
function normalizeColorDraft(value: unknown): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim().slice(0, 32) : ''
  return trimmed || undefined
}

function resolveColor(value: string | undefined): string | undefined {
  if (!value || !HEX_COLOR_RE.test(value)) {
    return undefined
  }
  return value.startsWith('#') ? value : `#${value}`
}

function normalizeSize(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback
}

export function normalizeNativeChatAppearanceSettings(
  value: unknown
): NativeChatAppearanceSettings | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const fontFamily =
    'fontFamily' in value && typeof value.fontFamily === 'string' ? value.fontFamily.trim() : ''
  const fontSize = normalizeSize('fontSize' in value ? value.fontSize : undefined, 12, 20, 14)
  const codeFontSize = normalizeSize(
    'codeFontSize' in value ? value.codeFontSize : undefined,
    10,
    18,
    12
  )
  const contrast = normalizeSize('contrast' in value ? value.contrast : undefined, 50, 150, 100)
  const matchTerminalInterface =
    'matchTerminalInterface' in value && value.matchTerminalInterface === true
  const imageOverlayOpacity = normalizeSize(
    'imageOverlayOpacity' in value ? value.imageOverlayOpacity : undefined,
    30,
    100,
    DEFAULT_NATIVE_CHAT_IMAGE_OVERLAY_OPACITY
  )
  const width =
    'width' in value && (value.width === 'wide' || value.width === 'full') ? value.width : undefined
  const colors = Object.fromEntries(
    NATIVE_CHAT_COLOR_KEYS.flatMap((key) => {
      const color = normalizeColorDraft(Object.getOwnPropertyDescriptor(value, key)?.value)
      return color ? [[key, color]] : []
    })
  )
  const normalized: NativeChatAppearanceSettings = {
    ...Object.fromEntries(Object.entries(value).filter(([key]) => !KNOWN_KEYS.includes(key))),
    ...(fontFamily ? { fontFamily } : {}),
    ...(fontSize !== DEFAULT_NATIVE_CHAT_FONT_SIZE ? { fontSize } : {}),
    ...(codeFontSize !== DEFAULT_NATIVE_CHAT_CODE_FONT_SIZE ? { codeFontSize } : {}),
    ...(width ? { width } : {}),
    ...(contrast !== DEFAULT_NATIVE_CHAT_CONTRAST ? { contrast } : {}),
    ...(matchTerminalInterface ? { matchTerminalInterface } : {}),
    ...(imageOverlayOpacity !== DEFAULT_NATIVE_CHAT_IMAGE_OVERLAY_OPACITY
      ? { imageOverlayOpacity }
      : {}),
    ...colors
  }
  return Object.keys(normalized).length ? normalized : undefined
}

export function resolveNativeChatAppearanceSettings(
  value: unknown
): ResolvedNativeChatAppearanceSettings {
  const normalized = normalizeNativeChatAppearanceSettings(value)
  return {
    fontFamily: normalized?.fontFamily ?? '',
    fontSize: normalized?.fontSize ?? DEFAULT_NATIVE_CHAT_FONT_SIZE,
    codeFontSize: normalized?.codeFontSize ?? DEFAULT_NATIVE_CHAT_CODE_FONT_SIZE,
    width: normalized?.width ?? 'comfortable',
    contrast: normalized?.contrast ?? DEFAULT_NATIVE_CHAT_CONTRAST,
    matchTerminalInterface: normalized?.matchTerminalInterface ?? false,
    imageOverlayOpacity:
      normalized?.imageOverlayOpacity ?? DEFAULT_NATIVE_CHAT_IMAGE_OVERLAY_OPACITY,
    textColorLight: resolveColor(normalized?.textColorLight),
    textColorDark: resolveColor(normalized?.textColorDark),
    userBubbleColorLight: resolveColor(normalized?.userBubbleColorLight),
    userBubbleColorDark: resolveColor(normalized?.userBubbleColorDark)
  }
}

export function resetNativeChatAppearanceSettings(
  appearance: NativeChatAppearanceSettings | undefined
): NativeChatAppearanceSettings | undefined {
  return normalizeNativeChatAppearanceSettings(
    Object.fromEntries(
      Object.entries(appearance ?? {}).filter(([key]) => !KNOWN_KEYS.includes(key))
    )
  )
}
