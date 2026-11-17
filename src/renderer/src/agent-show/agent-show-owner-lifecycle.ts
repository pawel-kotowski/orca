import type { AgentShowContext } from '../../../shared/agent-show/agent-show-contract'
import type { Tab } from '../../../shared/tab-types'
import { useAppStore } from '@/store/index'
import { isShowOwnerTab } from './agent-show-owner-tab'

type TabsByWorktree = Readonly<Record<string, readonly Pick<Tab, 'id' | 'entityId'>[] | undefined>>

const ownerKey = (context: AgentShowContext): string =>
  `${context.worktreeId}\u0000${context.ownerTabId ?? ''}`

const ownerTabOpen = (context: AgentShowContext, tabsByWorktree: TabsByWorktree): boolean =>
  (tabsByWorktree[context.worktreeId] ?? []).some((tab) => isShowOwnerTab(tab, context.ownerTabId))

/**
 * Owners whose tab is no longer open in their worktree. With `seen`, only owners whose tab this
 * window has had open: a box agent's tab can reach this window late, or not while it is hidden,
 * and a tab never seen has not closed.
 */
export function closedShowOwners(
  owners: Iterable<AgentShowContext>,
  tabsByWorktree: TabsByWorktree,
  seen?: ReadonlySet<string>
): AgentShowContext[] {
  return [...owners].filter(
    (context) =>
      !ownerTabOpen(context, tabsByWorktree) && (seen === undefined || seen.has(ownerKey(context)))
  )
}

const owners = new Map<string, AgentShowContext>()
const seenOwners = new Set<string>()
let unsubscribe: (() => void) | null = null

/** Every owner that showed something since the window loaded (or was restored). */
export function watchedShowOwners(): AgentShowContext[] {
  return [...owners.values()]
}

function noteOpenOwners(tabsByWorktree: TabsByWorktree): void {
  for (const [key, context] of owners) {
    if (ownerTabOpen(context, tabsByWorktree)) {
      seenOwners.add(key)
    }
  }
}

/** Clears an agent's marks and the panes it opened once its tab closes, as `orca show clear` would. */
export function watchShowOwner(
  context: AgentShowContext,
  clearAll: (context: AgentShowContext) => unknown
): void {
  if (!context.ownerTabId) {
    return
  }
  owners.set(ownerKey(context), { ...context, focus: false })
  noteOpenOwners(useAppStore.getState().unifiedTabsByWorktree)
  unsubscribe ??= useAppStore.subscribe((state, previous) => {
    if (state.unifiedTabsByWorktree === previous.unifiedTabsByWorktree) {
      return
    }
    noteOpenOwners(state.unifiedTabsByWorktree)
    for (const closed of closedShowOwners(
      owners.values(),
      state.unifiedTabsByWorktree,
      seenOwners
    )) {
      owners.delete(ownerKey(closed))
      seenOwners.delete(ownerKey(closed))
      void clearAll(closed)
    }
    if (owners.size === 0) {
      unsubscribe?.()
      unsubscribe = null
    }
  })
}
