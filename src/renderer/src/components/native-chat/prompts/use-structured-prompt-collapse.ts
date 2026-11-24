import { useCallback, useSyncExternalStore } from 'react'
import { createStructuredPromptCollapses } from './structured-prompt-collapses'

const collapses = createStructuredPromptCollapses()

/** A folded prompt keeps its request open and gives the message box back, as a terminal chat's does. */
export function useStructuredPromptCollapse(
  sessionId: string,
  prompt: { itemId: string; revision: number } | null
): { collapsed: boolean; collapse: () => void; expand: () => void } {
  // A new prompt, or a new revision of this one, arrives expanded.
  const occurrence = prompt ? `${prompt.itemId}:${prompt.revision}` : null
  const collapsed = useSyncExternalStore(
    collapses.subscribe,
    () => occurrence !== null && collapses.isCollapsed(sessionId, occurrence)
  )
  const collapse = useCallback(() => {
    if (occurrence !== null) {
      collapses.collapse(sessionId, occurrence)
    }
  }, [sessionId, occurrence])
  const expand = useCallback(() => collapses.expand(sessionId), [sessionId])
  return { collapsed, collapse, expand }
}
