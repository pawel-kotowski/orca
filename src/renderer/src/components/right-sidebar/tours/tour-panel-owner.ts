import type { Tab } from '../../../../../shared/tab-types'

/**
 * The chat a tour from the panel plays for, as `orca show tour` would own it: the tab of the
 * agent already playing a tour here, else the workspace's most recently used agent chat, else
 * its most recent terminal (an agent there has ORCA_TAB_ID too). Null: no tab can own a tour.
 */
export function pickTourOwnerTab(
  tabs: readonly Pick<Tab, 'id' | 'contentType' | 'viewMode' | 'lastFocusedAt' | 'createdAt'>[],
  playingOwnerTabIds: readonly string[]
): string | null {
  const playing = tabs.find((tab) => playingOwnerTabIds.includes(tab.id))
  if (playing) {
    return playing.id
  }
  const recent = (candidates: typeof tabs): string | null =>
    [...candidates].sort(
      (a, b) => (b.lastFocusedAt ?? b.createdAt) - (a.lastFocusedAt ?? a.createdAt)
    )[0]?.id ?? null
  return (
    recent(
      tabs.filter(
        (tab) =>
          tab.contentType === 'agent-session' ||
          (tab.contentType === 'terminal' && tab.viewMode === 'chat')
      )
    ) ?? recent(tabs.filter((tab) => tab.contentType === 'terminal'))
  )
}
