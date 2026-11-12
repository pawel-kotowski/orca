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
  /** Whether a run of tool calls shows each step without a click; absent = off. */
  toolStepsOpen?: boolean
  /**
   * Whether a finished turn stays open with every message the agent wrote while working, instead
   * of folding behind its answer; absent = on.
   */
  finishedTurnsOpen?: boolean
  /** Whether a bare "Working…" line trails the live turn under its ticking bar; absent = off. */
  bareWorkingLine?: boolean
  /** Whether a settled run of one call draws as that call's own line; absent = on. */
  soleCallAsLine?: boolean
  /**
   * Whether activity-view cards read from the conversation (first and last prompt, steps, answer)
   * and hover to a live chat; absent = on.
   */
  activityFollowsConversation?: boolean
  /** Whether hovering an activity card shows its details card (Orca's own, no live chat); absent = off. */
  activityHoverChat?: boolean
  /** Whether hovering a workspace card in the Projects view shows its details card; absent = off. */
  workspaceHoverDetails?: boolean
  /** Whether the message box is one line with only Attach, the option pickers and Stop; absent = on. */
  compactComposer?: boolean
  /**
   * Whether Ctrl+Enter in a terminal-backed Claude chat sends the message now, reaching Claude while
   * it works instead of waiting for its turn to end, as Ctrl+Enter does in Claude's terminal; absent = on.
   */
  ctrlEnterSendsNow?: boolean
  /**
   * Whether the chat takes colour from the terminal theme's palette: step icons by kind, links,
   * code, headings, list markers, the person's bubbles; absent = on.
   */
  chatColors?: boolean
  /**
   * Whether upstream's line under the message box (machine, folder, Worktree, branch) shows; absent =
   * off. The local footer already names the machine, project and workspace.
   */
  composerWorkspaceLine?: boolean
}

/**
 * Upstream's machine / folder / branch line under the message box, only when turned on. Why off by
 * default: Paweł, 2026-11-12: "i dont need it I implemented better version myself".
 */
export function nativeChatShowsComposerWorkspaceLine(
  settings: { nativeChatAppearance?: NativeChatAppearanceSettings } | null | undefined
): boolean {
  // Why: until settings load (and in a bare store) the line shows, as upstream draws it.
  return settings == null || settings.nativeChatAppearance?.composerWorkspaceLine === true
}

/** Colour from the terminal palette in the chat, unless the user turned it off. */
export function nativeChatColors(
  settings: { nativeChatAppearance?: NativeChatAppearanceSettings } | null | undefined
): boolean {
  // Why: until settings load (and in a bare store) the chat keeps upstream's monochrome look.
  return settings != null && settings.nativeChatAppearance?.chatColors !== false
}

/** Ctrl+Enter sends a terminal Claude chat's message now, unless the user turned that off. */
export function nativeChatCtrlEnterSendsNow(
  settings: { nativeChatAppearance?: NativeChatAppearanceSettings } | null | undefined
): boolean {
  return settings?.nativeChatAppearance?.ctrlEnterSendsNow !== false
}

/** The one-line message box, unless the user turned it off. */
export function nativeChatCompactComposer(
  settings: { nativeChatAppearance?: NativeChatAppearanceSettings } | null | undefined
): boolean {
  // Why: until settings load (and in a bare store) the box keeps upstream's full layout.
  return settings != null && settings.nativeChatAppearance?.compactComposer !== false
}

/** Activity cards read from the conversation and hover to a live chat, unless turned off. */
export function nativeChatActivityFollowsConversation(
  settings: { nativeChatAppearance?: NativeChatAppearanceSettings } | null | undefined
): boolean {
  // Why: until settings load (and in a bare store) cards keep upstream's copy and hover details.
  return settings != null && settings.nativeChatAppearance?.activityFollowsConversation !== false
}

/**
 * Hovering an activity card shows its live chat, only when turned on. Why off by default: Paweł,
 * 2026-11-05: "let's disable hover behavior for now completely, so cards click anywhere should
 * show normal tabs, maybe we will go back to it".
 */
export function nativeChatActivityHoverChat(
  settings: { nativeChatAppearance?: NativeChatAppearanceSettings } | null | undefined
): boolean {
  // Why: in a bare store (settings not loaded) cards keep upstream's hover details.
  return settings == null || settings.nativeChatAppearance?.activityHoverChat === true
}

/**
 * Hovering a workspace card in the Projects view shows its details card, only when turned on.
 * Why off by default: Paweł, 2026-11-09: "disable hover card in projects view".
 */
export function nativeChatWorkspaceHoverDetails(
  settings: { nativeChatAppearance?: NativeChatAppearanceSettings } | null | undefined
): boolean {
  // Why: in a bare store (settings not loaded) cards keep upstream's hover details.
  return settings == null || settings.nativeChatAppearance?.workspaceHoverDetails === true
}

/** A run of one call is that call's line, one click from its detail, unless the user turned it off. */
export function nativeChatSoleCallAsLine(
  settings: { nativeChatAppearance?: NativeChatAppearanceSettings } | null | undefined
): boolean {
  // Why: until settings load (and in a bare store) the run keeps its header, as upstream draws it.
  return settings != null && settings.nativeChatAppearance?.soleCallAsLine !== false
}

/** The live turn's bare "Working…" tail line, which repeats its bar, only when asked for. */
export function nativeChatShowsBareWorkingLine(
  settings: { nativeChatAppearance?: NativeChatAppearanceSettings } | null | undefined
): boolean {
  // Why: until settings load (and in a bare store) the line shows, as upstream draws it.
  return settings == null || settings.nativeChatAppearance?.bareWorkingLine === true
}

/** Tool runs open to their steps only when the user asked for it. */
export function nativeChatToolStepsOpen(
  settings: { nativeChatAppearance?: NativeChatAppearanceSettings } | null | undefined
): boolean {
  return settings?.nativeChatAppearance?.toolStepsOpen === true
}

/** A finished turn keeps all the agent said in it unless the user turned that off. */
export function nativeChatFinishedTurnsOpen(
  settings: { nativeChatAppearance?: NativeChatAppearanceSettings } | null | undefined
): boolean {
  // Why: until settings load (and in a bare store) turns fold, as upstream draws them.
  return settings != null && settings.nativeChatAppearance?.finishedTurnsOpen !== false
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
  /** The changed-files card under each turn that edited files. Absent means on. */
  nativeChatTurnDiffSummary?: boolean
  /** Lines saying how CI went on a pull request the chat opened or pushed to. Absent means on. */
  nativeChatCiResultLines?: boolean
  /** A "New" line above what arrived while the reader was away. Absent follows the default below. */
  nativeChatMarkNewMessages?: boolean
}

/** Not written into default settings, so flipping this reaches everyone who never chose. */
const NATIVE_CHAT_MARKS_NEW_MESSAGES_BY_DEFAULT = true

export function nativeChatMarksNewMessages(
  settings: { readonly nativeChatMarkNewMessages?: unknown } | null | undefined
): boolean {
  const value = settings?.nativeChatMarkNewMessages
  return typeof value === 'boolean' ? value : NATIVE_CHAT_MARKS_NEW_MESSAGES_BY_DEFAULT
}

/** Only explicit OFF keeps a reader's place on send. */
export function nativeChatScrollsToLatestOnSend(
  settings: { readonly nativeChatScrollToLatestOnSend?: unknown } | null | undefined
): boolean {
  return settings?.nativeChatScrollToLatestOnSend !== false
}

/** Only explicit OFF hides the per-turn changed-files card. */
export function nativeChatShowsTurnDiffSummary(
  settings: { readonly nativeChatTurnDiffSummary?: unknown } | null | undefined
): boolean {
  return settings?.nativeChatTurnDiffSummary !== false
}

/** Only explicit OFF hides CI result lines; the host keeps recording them either way. */
export function nativeChatShowsCiResultLines(
  settings: { readonly nativeChatCiResultLines?: unknown } | null | undefined
): boolean {
  return settings?.nativeChatCiResultLines !== false
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
