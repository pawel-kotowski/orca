import type { AgentShowContext } from '../../../../shared/agent-show/agent-show-contract'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import {
  HOST_TERMINAL_SURFACE_SEPARATOR,
  toHostSessionTabId
} from '../../../../shared/workspace-layout/terminal-surface-id'

type TabFacts = { id: string; entityId?: string }

/**
 * This window's tab for a server's tab id. A box's terminal tab is mirrored here as
 * `web-terminal-<tab>` (or `web-terminal-<tab::leaf>` per pane), so the box agent's `ORCA_TAB_ID`
 * never equals this window's id for it; an agent-session tab keeps its id or entity id.
 */
export function relayedOwnerTab(
  ownerTabId: string,
  tabs: readonly TabFacts[] | undefined
): TabFacts | undefined {
  return (tabs ?? []).find(
    (tab) =>
      tab.id === ownerTabId ||
      tab.entityId === ownerTabId ||
      toHostSessionTabId(tab.id).split(HOST_TERMINAL_SURFACE_SEPARATOR)[0] === ownerTabId
  )
}

/**
 * The context to show a server's relayed request with in this window, or null when this window
 * does not show that workspace for that server (the server then asks another desktop). The owner
 * becomes this window's id for the agent's tab, so every owner check here (the tab closing, where
 * the strip and code go, which tour a `next` means) works as for a local agent.
 */
export function relayedShowContext(
  environmentId: string,
  context: AgentShowContext,
  facts: {
    /** Where this window sends the workspace's file and git calls; null when it does not know it. */
    ownerTarget: RuntimeClientTarget | null
    tabs: readonly TabFacts[] | undefined
  }
): AgentShowContext | null {
  const target = facts.ownerTarget
  if (target?.kind !== 'environment' || target.environmentId !== environmentId) {
    return null
  }
  const owner = context.ownerTabId ? relayedOwnerTab(context.ownerTabId, facts.tabs) : undefined
  // Why null for an unseen owner: it would read as closed and clear the show at once.
  return { ...context, ownerTabId: owner?.id ?? null }
}
