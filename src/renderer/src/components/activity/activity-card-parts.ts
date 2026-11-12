import { useAppStore } from '@/store'
import { writeNativeChatAppearance } from '../native-chat/appearance/native-chat-appearance-write'

/**
 * The pieces of an activity card read from its conversation, each of which can be hidden with one
 * click (Paweł, 2026-11-08: "i want to be able to hide and show each piece of activity card").
 */
export const ACTIVITY_CARD_PARTS = [
  'status',
  'repo',
  'machine',
  'time',
  'workspace',
  'conversation',
  'output',
  'latestPrompt',
  'firstPrompt'
] as const
export type ActivityCardPart = (typeof ACTIVITY_CARD_PARTS)[number]

const EMPTY: readonly string[] = []

function hiddenParts(appearance: unknown): readonly string[] {
  const value =
    appearance && typeof appearance === 'object'
      ? (appearance as { activityCardHidden?: unknown }).activityCardHidden
      : undefined
  return Array.isArray(value) ? (value as string[]) : EMPTY
}

/** Saved in settings (`nativeChatAppearance.activityCardHidden`), so it survives a restart. */
export function useActivityCardHiddenParts(): readonly string[] {
  return useAppStore((state) => hiddenParts(state.settings?.nativeChatAppearance))
}

export function toggleActivityCardPart(part: ActivityCardPart): void {
  void writeNativeChatAppearance((current) => {
    const hidden = hiddenParts(current)
    const next = hidden.includes(part)
      ? hidden.filter((entry) => entry !== part)
      : [...hidden, part]
    const rest = { ...current } as Record<string, unknown>
    delete rest.activityCardHidden
    return next.length > 0 ? { ...rest, activityCardHidden: next } : rest
  })
}

function stripHidden(appearance: unknown): boolean {
  return Boolean(
    appearance &&
    typeof appearance === 'object' &&
    (appearance as { activityCardPartsBarHidden?: unknown }).activityCardPartsBarHidden === true
  )
}

/**
 * Whether the strip of card-part switches above the list is hidden (Paweł, 2026-11-09: "make this
 * also hidable"). Saved as `nativeChatAppearance.activityCardPartsBarHidden`; absent = shown.
 */
export function useActivityCardPartsBarHidden(): boolean {
  return useAppStore((state) => stripHidden(state.settings?.nativeChatAppearance))
}

export function toggleActivityCardPartsBar(): void {
  void writeNativeChatAppearance((current) => {
    const rest = { ...current } as Record<string, unknown>
    const hidden = stripHidden(current)
    delete rest.activityCardPartsBarHidden
    return hidden ? rest : { ...rest, activityCardPartsBarHidden: true }
  })
}
