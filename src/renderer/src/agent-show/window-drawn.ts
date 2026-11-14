import type { AppState } from '@/store/types'
import { onScreenWorkspaceIds } from '@/hooks/agent-auto-ack-targets'
import { selectFloatingWorkspacePanelVisible } from '@/store/workspaces/floating/floating-workspace-panel-selector'
import { isFloatingWorkspaceId } from '../../../shared/floating-workspace-worktree'

/** Said whenever a show lands while the window is not drawn, so the agent never claims the user saw it. */
export const WINDOW_HIDDEN_DETAIL =
  'the Orca window is hidden (minimized, on another desktop or covered by other windows), so nothing is drawn yet; the user sees it when they bring Orca forward'

/**
 * The workspace view shows this worktree (or the floating panel shows it): not Activity, not another
 * workspace, and not under the floating panel, which covers the stage beside the chat.
 */
export function worktreeDrawn(state: AppState, worktreeId: string): boolean {
  if (!isFloatingWorkspaceId(worktreeId) && selectFloatingWorkspacePanelVisible(state)) {
    return false
  }
  return onScreenWorkspaceIds(state).includes(worktreeId)
}

/** False while the window is minimized, on another desktop or fully covered: Chromium paints nothing then. */
export function windowShown(): boolean {
  return document.visibilityState === 'visible'
}

const pending = new Map<string, () => void>()

function runPending(): void {
  if (!windowShown()) {
    return
  }
  document.removeEventListener('visibilitychange', runPending)
  const runs = [...pending.values()]
  pending.clear()
  for (const run of runs) {
    run()
  }
}

/**
 * Runs `run` once the window is drawn again; a later call with the same key replaces it, so only
 * the newest staging of a tab is finished.
 */
export function afterWindowShown(key: string, run: () => void): void {
  if (windowShown()) {
    run()
    return
  }
  if (pending.size === 0) {
    document.addEventListener('visibilitychange', runPending)
  }
  pending.set(key, run)
}
