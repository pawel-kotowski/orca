import {
  HOST_TERMINAL_SURFACE_SEPARATOR,
  toHostSessionTabId
} from '../../../shared/workspace-layout/terminal-surface-id'

/**
 * Whether `tab` is the tab of the agent that showed something (`ownerTabId`, its `ORCA_TAB_ID`).
 * A box's terminal tab is mirrored in this window as `web-terminal-<tab>` (or
 * `web-terminal-<tab::leaf>` per pane), so a box agent's own id names it only through the mirror;
 * an agent-session tab is named by its id or its entity id.
 */
export function isShowOwnerTab(
  tab: { id: string; entityId?: string },
  ownerTabId: string | null | undefined
): boolean {
  if (!ownerTabId) {
    return false
  }
  return (
    tab.id === ownerTabId ||
    tab.entityId === ownerTabId ||
    toHostSessionTabId(tab.id).split(HOST_TERMINAL_SURFACE_SEPARATOR)[0] === ownerTabId
  )
}
