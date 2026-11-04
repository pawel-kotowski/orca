import { useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'

// Why: in the activity view the main area can step aside, like the floating workspace hides:
// the tabs stay mounted and their agents keep running; only the view is hidden.
let hidden = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setActivityHidesWorkbench(next: boolean): void {
  if (hidden === next) {
    return
  }
  hidden = next
  for (const listener of listeners) {
    listener()
  }
}

/** Whether the activity view has the main area's tabs hidden right now. */
export function useActivityHidesWorkbench(): boolean {
  const agentsBody = useAppStore((state) => state.sidebarBody === 'agents')
  return useSyncExternalStore(subscribe, () => hidden) && agentsBody
}

/**
 * The activity button: from the workspace view it opens the activity view with the tabs hidden;
 * in the activity view it hides the tabs a card brought back, and with them hidden it returns to
 * the workspace view.
 */
export function toggleActivityView(): void {
  const state = useAppStore.getState()
  if (state.sidebarBody !== 'agents') {
    state.setSidebarBody('agents')
    setActivityHidesWorkbench(true)
    return
  }
  if (!hidden) {
    setActivityHidesWorkbench(true)
    return
  }
  setActivityHidesWorkbench(false)
  state.setSidebarBody('workspaces')
}
