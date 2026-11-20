import { useEffect } from 'react'
import { useAppStore } from '../../../store/index'
import { makePaneKey } from '../../../../../shared/workspace-layout/stable-pane-id'
import type { PaneForegroundAgentEntry } from '../../../store/slices/agent-status/pane-authority/pane-foreground-agent'

/**
 * A chat whose Claude is ended and resumed in the same terminal comes back to its Chat UI.
 * Paweł, 2026-11-20: a box's limit-move (and the Slack bot) restart a session in place on
 * another login; the agent's exit sent the tab to its terminal (so the composer cannot type
 * into a shell) and it stayed there under the new Claude.
 *
 * Only a tab the exit itself moved out of Chat UI is marked; any view change of the tab clears
 * the mark, so a tab put in terminal view by hand stays terminal.
 */
type ReturnMark = {
  /** A shell (or no agent) has been seen in the pane's foreground since the exit. */
  sawShell: boolean
}

const marks = new Map<string, ReturnMark>()

export function markChatRestartReturn(tabId: string, leafId: string): void {
  marks.set(makePaneKey(tabId, leafId), { sawShell: false })
}

export function clearChatRestartReturns(tabId: string): void {
  // Why safe: deleting the current key while iterating a Map does not skip entries.
  for (const key of marks.keys()) {
    if (key.startsWith(`${tabId}:`)) {
      marks.delete(key)
    }
  }
}

export function hasChatRestartReturn(tabId: string, leafId: string): boolean {
  return marks.has(makePaneKey(tabId, leafId))
}

/**
 * What a marked pane's foreground says now: 'wait' while the old agent may still show,
 * 'return' once a new agent runs after the shell was seen. Requiring the shell first keeps a
 * foreground read from before the exit from bouncing the tab straight back.
 */
export function chatRestartReturnStep(
  mark: ReturnMark,
  foreground: PaneForegroundAgentEntry | undefined
): 'wait' | 'saw-shell' | 'return' {
  if (!foreground || foreground.shellForeground || !foreground.agent) {
    return mark.sawShell ? 'wait' : 'saw-shell'
  }
  return mark.sawShell ? 'return' : 'wait'
}

/** Watches the tab's marked panes and puts the tab back in Chat UI when a new agent runs there. */
export function useNativeChatRestartReturn(args: {
  tabId: string
  isChatViewMode: boolean
  isChatEligibleForLeaf: (leafId: string | null) => boolean
  returnToChat: (leafId: string) => void
}): void {
  const { tabId, isChatViewMode, isChatEligibleForLeaf, returnToChat } = args
  useEffect(() => {
    // Why any chat view clears it: the tab is back in Chat UI, by this hook or by hand.
    if (isChatViewMode) {
      clearChatRestartReturns(tabId)
    }
  }, [isChatViewMode, tabId])
  useEffect(() => {
    if (isChatViewMode) {
      return
    }
    const check = (): void => {
      const foregrounds = useAppStore.getState().paneForegroundAgentByPaneKey
      for (const [key, mark] of marks) {
        if (!key.startsWith(`${tabId}:`)) {
          continue
        }
        const leafId = key.slice(tabId.length + 1)
        const step = chatRestartReturnStep(mark, foregrounds[key])
        if (step === 'saw-shell') {
          mark.sawShell = true
        } else if (step === 'return' && isChatEligibleForLeaf(leafId)) {
          marks.delete(key)
          returnToChat(leafId)
          return
        }
      }
    }
    check()
    return useAppStore.subscribe((state, previous) => {
      if (state.paneForegroundAgentByPaneKey !== previous.paneForegroundAgentByPaneKey) {
        check()
      }
    })
  }, [isChatEligibleForLeaf, isChatViewMode, returnToChat, tabId])
}
