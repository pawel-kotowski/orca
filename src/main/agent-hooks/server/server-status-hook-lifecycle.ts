import {
  drainAgentHookSpoolAsync,
  type SpoolRecord
} from '../../../shared/agent-hook-listener/transport/agent-hook-spool'
import { hookRootAnswerDeadline } from '../../../shared/agent-hook-listener/presence/hook-root-attempts'
import { AgentHookServerRuntimeEnv } from './server-runtime-env'
import { ClaudeAgentViewBridge } from '../../claude/agent-view/agent-view-bridge'

/** How often a running server replays hooks its agents spooled while it could not answer. */
const LIVE_SPOOL_DRAIN_INTERVAL_MS = 5000

export abstract class AgentHookServerStatusHookLifecycle extends AgentHookServerRuntimeEnv {
  readonly claudeAgentViews = new ClaudeAgentViewBridge()
  private statusHookInitialization: Promise<void> | null = null
  private liveSpoolTimer: ReturnType<typeof setInterval> | null = null
  private liveSpoolDraining = false

  setStatusHooksEnabled(enabled: boolean): void {
    if (enabled === this.statusHooksEnabled) {
      return
    }
    this.statusHookGeneration += 1
    if (!enabled) {
      this.stopLiveSpoolDrain()
      this.claudeAgentViews.clear()
      this.flushStatusPersistSync()
      this.stopOpenCodeBinderLoop()
      for (const timer of this.assistantMessageRetryTimers.values()) {
        clearTimeout(timer)
      }
      this.assistantMessageRetryTimers.clear()
      this.clearAllTranscriptPolls()
    }
    this.statusHooksEnabled = enabled
    if (enabled && this.server) {
      void this.initializeStatusHookOwner().catch((error: unknown) => {
        console.error('[agent-hooks] status initialization failed', error)
      })
      this.startOpenCodeBinderLoop()
    }
  }

  protected initializeStatusHookOwner(): Promise<void> {
    this.statusHookInitialization ??= this.loadStatusHookOwner().finally(() => {
      this.statusHookInitialization = null
    })
    return this.statusHookInitialization
  }

  private async loadStatusHookOwner(): Promise<void> {
    const token = this.token
    const statusHookGeneration = this.statusHookGeneration
    if (!this.ownerStateInitialized) {
      // Hydrate before binding so the first live hook sees restored ownership.
      if (this.lastStatusFilePath) {
        this.hydrateLastStatusFromDisk()
      }
      this.captureHydratedAuthorityCommitments()
      // Drain before binding so replay cannot race live hooks.
      if (this.endpointDir) {
        const replayedPaneKeys = new Set<string>()
        // Why: records replay in order, so a per-record allowance would add up across panes.
        const answerBy = hookRootAnswerDeadline()
        await drainAgentHookSpoolAsync({
          endpointDir: this.endpointDir,
          getPersistedLaunchTokenHash: (paneKey) =>
            this.hydratedLaunchTokenHashByPaneKey.get(this.resolvePaneKeyAlias(paneKey)),
          ingest: async (record: SpoolRecord) => {
            if (this.token !== token || this.statusHookGeneration !== statusHookGeneration) {
              throw new Error('Status hook spool replay interrupted')
            }
            await this.ingestSpoolRecord(record, answerBy)
            replayedPaneKeys.add(this.resolvePaneKeyAlias(record.paneKey))
          }
        })
        if (this.token !== token || this.statusHookGeneration !== statusHookGeneration) {
          return
        }
        // Replayed owners may have died while Orca was down; probe each pane once.
        for (const paneKey of replayedPaneKeys) {
          void this.checkAgentPresence(paneKey)
        }
      }
      this.ownerStateInitialized = true
      this.activateClaudeHelperObservations()
    }
    this.startLiveSpoolDrain()
  }

  /**
   * A hook posts with a 1.5 s limit and spools its event when Orca does not answer in time. The
   * spool was replayed only at startup, so an event spooled while Orca ran (busy for a moment)
   * waited for the next restart: a lost Stop left a finished agent "working" (2026-11-08). A
   * running server now replays the spool every few seconds.
   */
  private startLiveSpoolDrain(): void {
    if (this.liveSpoolTimer || !this.endpointDir) {
      return
    }
    this.liveSpoolTimer = setInterval(() => {
      void this.drainLiveSpool().catch((error: unknown) => {
        console.warn('[agent-hooks] live spool replay failed', error)
      })
    }, LIVE_SPOOL_DRAIN_INTERVAL_MS)
    this.liveSpoolTimer.unref?.()
  }

  protected stopLiveSpoolDrain(): void {
    if (this.liveSpoolTimer) {
      clearInterval(this.liveSpoolTimer)
      this.liveSpoolTimer = null
    }
  }

  private async drainLiveSpool(): Promise<void> {
    if (this.liveSpoolDraining || !this.endpointDir || !this.ownerStateInitialized) {
      return
    }
    const token = this.token
    const statusHookGeneration = this.statusHookGeneration
    this.liveSpoolDraining = true
    try {
      await drainAgentHookSpoolAsync({
        endpointDir: this.endpointDir,
        getPersistedLaunchTokenHash: (paneKey) =>
          this.hydratedLaunchTokenHashByPaneKey.get(this.resolvePaneKeyAlias(paneKey)),
        ingest: async (record: SpoolRecord) => {
          if (this.token !== token || this.statusHookGeneration !== statusHookGeneration) {
            throw new Error('Status hook spool replay interrupted')
          }
          // Why: a live hook that reached the pane after this one was spooled already says more;
          // replaying the older event would undo it. Spool stamps have whole-second precision.
          // Only live hooks count: this drain's own replays stamp the row with the current time.
          const liveAt = this.liveHookAtByPaneKey.get(this.resolvePaneKeyAlias(record.paneKey))
          if (liveAt !== undefined && record.receivedAt + 1000 <= liveAt) {
            return
          }
          await this.ingestSpoolRecord(record, hookRootAnswerDeadline())
        }
      })
    } finally {
      this.liveSpoolDraining = false
    }
  }
}
