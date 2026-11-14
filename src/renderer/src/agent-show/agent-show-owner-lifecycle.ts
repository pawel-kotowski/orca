import type { AgentShowContext } from '../../../shared/agent-show/agent-show-contract'
import type { Tab } from '../../../shared/tab-types'
import { useAppStore } from '@/store/index'

const ownerKey = (context: AgentShowContext): string =>
  `${context.worktreeId}\u0000${context.ownerTabId ?? ''}`

/** Owners whose tab is no longer open in their worktree. */
export function closedShowOwners(
  owners: Iterable<AgentShowContext>,
  tabsByWorktree: Readonly<Record<string, readonly Tab[] | undefined>>
): AgentShowContext[] {
  return [...owners].filter((context) => {
    const tabs = tabsByWorktree[context.worktreeId] ?? []
    return !tabs.some((tab) => tab.id === context.ownerTabId || tab.entityId === context.ownerTabId)
  })
}

const owners = new Map<string, AgentShowContext>()
let unsubscribe: (() => void) | null = null

/** Every owner that showed something since the window loaded (or was restored). */
export function watchedShowOwners(): AgentShowContext[] {
  return [...owners.values()]
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
  unsubscribe ??= useAppStore.subscribe((state, previous) => {
    if (state.unifiedTabsByWorktree === previous.unifiedTabsByWorktree) {
      return
    }
    for (const closed of closedShowOwners(owners.values(), state.unifiedTabsByWorktree)) {
      owners.delete(ownerKey(closed))
      void clearAll(closed)
    }
    if (owners.size === 0) {
      unsubscribe?.()
      unsubscribe = null
    }
  })
}
