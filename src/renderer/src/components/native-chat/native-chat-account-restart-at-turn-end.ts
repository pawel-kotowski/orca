import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { makePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'
import { mainAgentState } from '../../../../shared/agent-status/lifecycle/main-agent-status'

/** Each pane's waiting restart; a newer pick for the pane replaces it. */
const waiting = new Map<string, () => void>()

function ptyTurnRunning(state: AppState, terminalTabId: string, leafId: string): boolean {
  const entry = state.agentStatusByPaneKey.get(makePaneKey(terminalTabId, leafId))
  return entry?.agentType === 'claude' && mainAgentState(entry) !== 'done'
}

/**
 * Restarts a chat's Claude on its new account once the running turn ends (an account switch
 * elsewhere in Orca interrupts the turn; a chat's own switch promises not to).
 */
export function queueClaudeRestartsAtTurnEnd(
  terminalTabId: string,
  ptyIds: readonly string[]
): void {
  for (const ptyId of ptyIds) {
    waiting.get(ptyId)?.()
    waiting.delete(ptyId)
    const leafId = (): string | undefined =>
      Object.entries(
        useAppStore.getState().terminalLayoutsByTabId[terminalTabId]?.ptyIdsByLeafId ?? {}
      ).find(([, bound]) => bound === ptyId)?.[0]
    const settle = (): boolean => {
      const leaf = leafId()
      if (leaf && ptyTurnRunning(useAppStore.getState(), terminalTabId, leaf)) {
        return false
      }
      waiting.get(ptyId)?.()
      waiting.delete(ptyId)
      // A pane closed or rebound meanwhile has nothing left to restart.
      if (leaf) {
        useAppStore.getState().queuePaneAccountRestarts([ptyId], 'claude')
      }
      return true
    }
    if (!settle()) {
      waiting.set(
        ptyId,
        useAppStore.subscribe(() => void settle())
      )
    }
  }
}
