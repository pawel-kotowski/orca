import type { RuntimeTerminalCreate } from '../../shared/terminal/runtime/runtime-terminal-create-contract'
/**
 * The factories `executeAgentLaunch` is handed: how a surface and a workspace are BUILT once the
 * executor has decided which. Separate from the executor because they are the contract each caller
 * implements, not part of the sequencing it runs.
 */

import type {
  AgentLaunchIntent,
  AgentLaunchPrompt,
  AgentLaunchMode
} from '../../shared/agent-launch/contracts/agent-launch-intent'
import type { StructuredAgentId } from '../../shared/agent-session/lifecycle/provider-handles/agent-session-provider-handle'
import type { StructuredAgentSessionFirstMessage } from '../../shared/agent-session/lifecycle/operations/structured-agent-session-create'
import type { TuiAgent } from '../../shared/agent-launch/catalog/tui-agent'
import type { SetupTrustMismatch } from '../../shared/worktree/create-types'
import type { AgentLaunchParams } from '../../shared/rpc-contract/agent-launch/agent-launch-params'
import { claudeChatProfileArgsRefusal } from '../claude/structured/launch/claude-chat-launch-profile'
import { toAgentLaunchPreferences } from '../../shared/agent-launch/choices/agent-launch-preferences'
import { assertOpenCodeModelLaunchPreferencesAbsent } from '../opencode/model-launch/opencode-model-startup-plan'

/** Inject creation so orchestration can add subscriptions without duplicating launch sequencing. */
export type AgentLaunchSurfaceFactory = {
  createStructuredSession(args: {
    worktreeId: string
    agent: StructuredAgentId
    chatOptions?: Readonly<Record<string, string>>
    options?: Readonly<Record<string, unknown>>
    /** Caller-minted ID; reject with AgentLaunchSessionAlreadyExistsError if taken. */
    sessionId?: string
    /** Caller-reserved tab ID; omit to use the ID clients derive. */
    tabId?: string
    /** Keep chat idle until the caller submits its first message. */
    withoutPrompt?: true
    firstMessage?: StructuredAgentSessionFirstMessage
    signal?: AbortSignal
  }): Promise<AgentLaunchStructuredSurface>
  createTerminalAgent(args: {
    worktreeId: string
    agent: TuiAgent
    options?: Readonly<Record<string, unknown>>
    /** Offer on argv; promptRodeLaunchCommand confirms whether the typed line carried it. */
    startupPrompt?: string
    /** Replaces the settings default for this launch only; `null` means no arguments at all. */
    agentArgs?: string | null
    cwd?: string
    launchSource?: string
    /** Caller-minted pane; reject with AgentLaunchPaneAlreadyLiveError if live. */
    paneKey?: string
    viewMode?: 'terminal' | 'chat'
    /** Account routing overrides merged over the agent environment. */
    accountEnv?: Readonly<Record<string, string>>
  }): Promise<{
    handle: string
    /** Omit when the runtime reports no pane; never invent one. */
    paneKey?: string
    warning?: string
    terminalCreation?: RuntimeTerminalCreate
    promptRodeLaunchCommand?: boolean
  }>
  /** Paste into a live PTY; return false on failure without failing the running launch. */
  deliverTerminalPrompt?(args: {
    handle: string
    agent: TuiAgent
    /** Reused terminals have no fresh launch readiness signal to await. */
    freshLaunch: boolean
    terminalCreation?: RuntimeTerminalCreate
    prompt: AgentLaunchPrompt
    /** Abort readiness waits and refuse pending pastes. */
    signal?: AbortSignal
  }): Promise<boolean>
}

/** The created chat and its committed opening submission. */
export type AgentLaunchStructuredSurface = {
  sessionId: string
  handle: string
  fence: number
  firstMessage?: { clientMessageId: string }
  /** Older hosts may omit the host-owned tab ID. */
  tabId?: string
}

/** Proves no session was committed, permitting terminal fallback. */
export class AgentLaunchStructuredSessionRefusedError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AgentLaunchStructuredSessionRefusedError'
    this.code = code
  }
}

export type AgentLaunchWorkspaceFactory = {
  createWorktree(args: {
    create: Readonly<Record<string, unknown>>
    /** Register before announcing the workspace. */
    onWorkspaceCreated?: (worktreeId: string) => void
    promisedAgentChat?: boolean
    /** Terminal startup runs behind setup; structured launches must await setup explicitly. */
    startupAgent: TuiAgent | undefined
    /** The startup command builder measures whether this argv prompt fits. */
    startupPrompt?: string
    /** Legacy delivery lets the create own all prompt lengths and agents. */
    legacyPrompt?: AgentLaunchPrompt
    agentArgs?: string | null
    cwd?: string
    launchSource?: string
    paneKey?: string
    options?: Readonly<Record<string, unknown>>
    /** Account routing overrides merged over the startup agent environment. */
    accountEnv?: Readonly<Record<string, string>>
  }): Promise<{
    worktreeId: string
    /** Host-resolved root, available only after creation. */
    workspacePath?: string
    /** Null means local; absent means unresolved. */
    connectionId?: string | null
    startupTerminalHandle: string | undefined
    startupTerminalCreation?: RuntimeTerminalCreate
    startupTerminalPaneKey?: string
    setupTrustMismatch?: SetupTrustMismatch
    warning?: string
    promptRodeLaunchCommand?: boolean
  }>
  /** Leave a usable workspace when chat creation has an indeterminate outcome. */
  createRecoveryShell?: (worktreeId: string) => Promise<void>
  createFolderWorkspace?: AgentLaunchWorkspaceFactory['createWorktree']
}

/** The options a terminal leg starts with: a caller's saved chat choice applies to it too. */
function terminalLaunchOptions(intent: Pick<AgentLaunchIntent, 'sessionOptions' | 'chatOptions'>) {
  return intent.sessionOptions ?? intent.chatOptions
}

/** Refuses, before anything exists, an OpenCode terminal its host cannot verify, read as that
 *  terminal will receive it, after the shared preflight determines the actual route. */
export function assertTerminalLaunchAdmissible(
  intent: AgentLaunchIntent | AgentLaunchParams,
  mode: AgentLaunchMode
): void {
  if (intent.reuseTerminal || intent.target.kind === 'create-worktree') {
    const options = mode === 'terminal' ? terminalLaunchOptions(intent) : intent.sessionOptions
    const preferences = toAgentLaunchPreferences(options, intent.agent)
    assertOpenCodeModelLaunchPreferencesAbsent(intent.agent, preferences)
  }
}

/** The chat's own launch profile and the conversation it resumes (`agent.launch`). */
export function chatLaunchProfileInputs(
  intent: AgentLaunchIntent
): Pick<AgentLaunchIntent, 'chatLaunchProfile' | 'resumeFrom'> {
  return {
    ...(intent.chatLaunchProfile ? { chatLaunchProfile: intent.chatLaunchProfile } : {}),
    ...(intent.resumeFrom ? { resumeFrom: intent.resumeFrom } : {})
  }
}

/** A chat's launch profile and resume start only that agent as a chat, never a terminal. */
export function assertChatLaunchProfileAdmissible(
  intent: AgentLaunchIntent,
  mode: AgentLaunchMode
): void {
  if (!intent.chatLaunchProfile && !intent.resumeFrom) {
    return
  }
  if (intent.agent !== 'claude') {
    throw new AgentLaunchStructuredSessionRefusedError(
      'invalid_argument',
      'A chat launch profile and --resume are for Claude chats only.'
    )
  }
  if (intent.surface !== 'chat' || mode !== 'structured') {
    throw new AgentLaunchStructuredSessionRefusedError(
      'invalid_argument',
      'A chat launch profile and --resume need --surface chat, and a host that opens Claude as a chat here.'
    )
  }
  const refusal = claudeChatProfileArgsRefusal(intent.chatLaunchProfile?.args ?? [])
  if (refusal) {
    throw new AgentLaunchStructuredSessionRefusedError('invalid_argument', refusal)
  }
}

/** What every route that builds a terminal agent passes on, so the startup terminal of a new
 *  workspace and the terminal of an existing one start the same agent. */
export function terminalLaunchInputs(intent: AgentLaunchIntent) {
  return {
    // Projected for this agent by each terminal builder, which keeps only what has a flag.
    options: terminalLaunchOptions(intent),
    // `null` is a value the caller meant, so this tests for absence rather than falsiness.
    ...(intent.agentArgs !== undefined ? { agentArgs: intent.agentArgs } : {}),
    ...(intent.cwd ? { cwd: intent.cwd } : {}),
    ...(intent.launchSource ? { launchSource: intent.launchSource } : {}),
    ...(intent.paneKey ? { paneKey: intent.paneKey } : {}),
    ...(intent.accountEnv ? { accountEnv: intent.accountEnv } : {})
  }
}
