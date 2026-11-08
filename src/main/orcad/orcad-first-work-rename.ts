import type { firstWorkRenameDeps as FirstWorkRenameDeps } from '../agent-hooks/first-work-rename-runtime'
import type { AgentHookServer } from '../agent-hooks/server'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'

type RenameStore = Parameters<typeof FirstWorkRenameDeps>[0]

/**
 * First-work auto-naming on an orcad host. The Electron server arms it in
 * main-process-ready-runtime (installFirstWorkRenameHookSubscription), but where orcad hosts the
 * hook server (a box such as the devbox) nothing did, so its workspaces kept their creature names
 * (sandperch, seabass, wolfeel) and no attempt was ever logged. Same filter as the Electron hook;
 * the rename code (git, text generation) loads on the first turn, not at startup.
 */
export function installOrcadFirstWorkRename(
  server: Pick<AgentHookServer, 'subscribeEnrichedStatus'>,
  store: RenameStore,
  runtime: Parameters<typeof FirstWorkRenameDeps>[1]
): () => void {
  let loaded: Promise<
    (event: Parameters<Parameters<AgentHookServer['subscribeEnrichedStatus']>[0]>[0]) => void
  > | null = null
  const load = () =>
    (loaded ??= Promise.all([
      import('../agent-hooks/first-work-branch-rename'),
      import('../agent-hooks/first-work-rename-runtime')
    ]).then(([{ maybeAutoRenameBranchOnFirstWork }, { firstWorkRenameDeps }]) => {
      const deps = firstWorkRenameDeps(store, runtime)
      return (event) =>
        void maybeAutoRenameBranchOnFirstWork(
          {
            paneKey: event.paneKey,
            tabId: event.tabId,
            worktreeId: event.worktreeId,
            state: event.payload.state,
            prompt: event.payload.prompt,
            assistantMessage: event.payload.lastAssistantMessage,
            isReplay: event.isReplay
          },
          deps
        )
    }))
  return server.subscribeEnrichedStatus((event) => {
    // Identity refreshes and restored history are not new turns; structured sessions rename elsewhere.
    if (event.providerSessionOnly || event.restoredUnconfirmed || event.structuredHost) {
      return
    }
    void load()
      .then((rename) => rename(event))
      .catch((error: unknown) => console.warn('[auto-branch-rename] orcad rename failed:', error))
  })
}

/**
 * What follows orcad's hook server once the runtime exists: status changes republish session.tabs
 * to paired clients, the runtime's agent status store attaches, and first-work naming arms.
 */
export async function attachOrcadAgentStatusFollowers(
  server: AgentHookServer,
  store: RenameStore,
  runtime: OrcaRuntimeService
): Promise<() => void> {
  const { installHookStatusSessionTabsRepublish } =
    await import('../agent-hooks/hook-status-session-tabs-republish')
  const uninstallRepublish = installHookStatusSessionTabsRepublish(server, () => runtime)
  const detachStatusStore = runtime.attachAgentStatusStore(server)
  const uninstallRename = installOrcadFirstWorkRename(server, store, runtime)
  return () => {
    uninstallRename()
    detachStatusStore()
    uninstallRepublish()
  }
}
