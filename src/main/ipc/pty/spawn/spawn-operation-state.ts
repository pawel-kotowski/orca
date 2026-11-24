import type { PtyRuntimeControllerDeps } from '../runtime/controller-deps'
import type { RuntimePtySpawnState, RuntimePtySpawnArgs } from '../runtime/spawn-state'
import type { StructuredChatTerminalSpawn } from '../../../runtime/agent-session/ownership/structured-chat-terminal-holds'
import type { PtySpawnTiming } from './pty-spawn-timing'
import type { PaneSpawnOperation } from '../pane/pane-spawn-operation'
import type { ReplacedPaneOwner } from '../pane/replaced-pane-owner'
import type { SleepingAgentLaunchConfig } from '../../../../shared/agent-session/lifecycle/agent-session-resume'

export type PtySpawnOperationState = Pick<
  RuntimePtySpawnState,
  | 'spawnOptions'
  | 'cwd'
  | 'provider'
  | 'result'
  | 'codexHomeLaunchStartedAt'
  | 'codexHomeLaunchStartedSequence'
  | 'reattachedCodexHomeRoutes'
  | 'preAdoptedStablePane'
  | 'stablePaneOwner'
  | 'stablePaneBindingPersisted'
  | 'pendingRegistrationPtyId'
  | 'pendingRegistrationClaim'
  | 'rejectedRegistrationCandidate'
  | 'provedSnapshotSeq'
  | 'preparedProvisionalExecutionContext'
  | 'paneSpawnReservationKey'
  | 'paneSpawnReservation'
  | 'finishTerminalInstall'
  | 'releaseWorktreeSpawn'
  | 'effectiveSessionAppId'
  | 'isDaemonHostSpawn'
  | 'expectedWslDistro'
  | 'isClaudeLaunch'
  | 'provisionalPtySize'
  | 'ownsNewIncarnation'
  | 'resumeAdmission'
> & {
  deps: Pick<
    PtyRuntimeControllerDeps,
    | 'runtime'
    | 'store'
    | 'adoptStablePane'
    | 'trustedTerminalHandleEnv'
    | 'getLocalPtyStartupPromise'
    | 'resolvePtySpawnStartupCwd'
    | 'options'
  >
  args: Omit<
    RuntimePtySpawnArgs,
    'spawnIntent' | 'terminalColorQueryReplies' | 'placement' | 'launchToken' | 'resumeOrigin'
  > & {
    attachOnlyView?: unknown
    launchToken?: unknown
    resumeOrigin?: unknown
  }
  replacedPaneOwner?: ReplacedPaneOwner | null
  paneSpawnOperation?: PaneSpawnOperation
  spawnTiming?: PtySpawnTiming
  /** Local: the held chat this start is for (spawn-chat-handover). */
  chatHandover?: StructuredChatTerminalSpawn | null
}

export type PtySpawnExecutionFacts = {
  sessionId: string | undefined
  paneKey: string | null
  preAllocatedHandle?: string | null
  replacedPaneOwner?: ReplacedPaneOwner | null
  attachOnlyView?: true
  savedResumePaneKey?: string | null
  launchConfig?: SleepingAgentLaunchConfig
  suppressRefusedLaunch?: () => void
  validateDispatch?: () => void
  beforeProviderSpawn?: () => void
  reportPtySpawnCommitted?: () => void
}
