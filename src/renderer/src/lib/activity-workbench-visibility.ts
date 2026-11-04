import { useEffect, useSyncExternalStore } from 'react'
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

/** Whether the activity view has the tabs hidden (outside React). */
export function activityHidesWorkbench(): boolean {
  return hidden && useAppStore.getState().sidebarBody === 'agents'
}

// Escape belongs to whatever has focus there: a terminal (the agent's own interrupt), a chat, a field.
const KEEPS_ESCAPE =
  '.xterm, [data-native-chat-root], input, textarea, select, [contenteditable="true"]'

/**
 * Escape in the activity view hides the tabs a card brought back, when nothing else used it (an
 * open hover chat closes first) and focus is not in a terminal, a chat or a field.
 */
export function useActivityEscapeHidesWorkbench(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) {
        return
      }
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest(KEEPS_ESCAPE)) {
        return
      }
      if (useAppStore.getState().sidebarBody === 'agents' && !hidden) {
        event.preventDefault()
        setActivityHidesWorkbench(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
