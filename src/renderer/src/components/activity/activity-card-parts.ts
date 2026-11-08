import { useAppStore } from '@/store'
import { writeNativeChatAppearance } from '../native-chat/native-chat-appearance-write'

/**
 * The pieces of an activity card read from its conversation, each of which can be hidden with one
 * click (Paweł, 2026-11-08: "i want to be able to hide and show each piece of activity card").
 */
export const ACTIVITY_CARD_PARTS = [
  'status',
  'repo',
  'machine',
  'time',
  'buttons',
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
