import { useAppStore } from '@/store'
import { writeNativeChatAppearance } from '../native-chat/appearance/native-chat-appearance-write'

/** Hours a seen, finished card stays in the Inbox before it stands by on its own; null = never. */
export function activityAutoStandByHours(appearance: unknown): number | null {
  const value =
    appearance && typeof appearance === 'object'
      ? (appearance as { activityAutoStandByHours?: unknown }).activityAutoStandByHours
      : undefined
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/** Saved in settings (`nativeChatAppearance.activityAutoStandByHours`), off when absent. */
export function useActivityAutoStandByHours(): number | null {
  return useAppStore((state) => activityAutoStandByHours(state.settings?.nativeChatAppearance))
}

export function setActivityAutoStandByHours(hours: number | null): void {
  void writeNativeChatAppearance((current) => {
    const rest = { ...current } as Record<string, unknown>
    delete rest.activityAutoStandByHours
    return hours !== null && hours > 0 ? { ...rest, activityAutoStandByHours: hours } : rest
  })
}
