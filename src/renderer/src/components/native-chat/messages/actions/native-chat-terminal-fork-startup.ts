import { buildAgentResumeStartupPlan } from '../../../../../../shared/agent-launch/startup/tui-agent-resume-startup'
import { resolveResumeLaunchRecipe } from '../../../../../../shared/agent-launch/choices/resume-launch-recipe'
import { buildAiVaultResumeShellCommand } from '../../../../../../shared/ai-vault/resume/ai-vault-resume-command'
import {
  normalizeAgentProviderSession,
  type AgentProviderSessionMetadata,
  type SleepingAgentLaunchConfig
} from '../../../../../../shared/agent-session/lifecycle/agent-session-resume'
import { resolveAccountRestartLaunchTarget } from '@/lib/agent-session/accounts/agent-account-restart-startup'
import { getLocalProjectExecutionRuntimeContext } from '@/runtime/hosts/preflight/local-preflight-context'
import type { AppState } from '@/store/types'
import type { NativeChatTerminalForkAgent } from '../../../../../../shared/native-chat/native-chat-terminal-row-actions'

/** `fork`: the CLI copies the whole conversation itself; `resume`: a copy Orca already wrote;
 *  `new`: a fresh conversation (a restart from the first prompt). */
export type NativeChatTerminalForkMode = 'fork' | 'resume' | 'new'

export type NativeChatTerminalForkStartup = {
  command: string
  cwd?: string
  env?: Record<string, string>
  launchConfig?: SleepingAgentLaunchConfig
  providerSession?: AgentProviderSessionMetadata
}

/** Codex keeps its sessions under `<CODEX_HOME>/sessions/…`, so the path names the home to fork in. */
export function codexHomeOfTranscript(transcriptPath: string | null | undefined): string | null {
  const match = transcriptPath?.match(/^(.*?)[\\/]sessions[\\/]/)
  return match?.[1] || null
}

/**
 * The new tab's command for a terminal chat's fork, built from the source pane's own launch: its
 * arguments, its host's shell, and (for Claude) the account the transcript path names.
 */
export function buildNativeChatTerminalForkStartup(input: {
  state: AppState
  paneKey: string
  tabId: string
  worktreeId: string
  agent: NativeChatTerminalForkAgent
  mode: NativeChatTerminalForkMode
  /** The conversation the new tab opens: the source for `fork`, the copy for `resume`. */
  session: { id: string; transcriptPath: string | null }
}): NativeChatTerminalForkStartup | null {
  const { state, agent } = input
  const entry = state.agentStatusByPaneKey[input.paneKey]
  const source = normalizeAgentProviderSession(entry?.providerSession)
  const launchConfig = entry ? state.getAgentLaunchConfigForStatusEntry(entry) : undefined
  const providerSession: AgentProviderSessionMetadata = {
    key: 'session_id',
    id: input.session.id,
    ...(input.session.transcriptPath ? { transcriptPath: input.session.transcriptPath } : {})
  }
  const sourceTab = state.tabsByWorktree[input.worktreeId]?.find((tab) => tab.id === input.tabId)
  const target = resolveAccountRestartLaunchTarget(
    state,
    { worktreeId: input.worktreeId, shellOverride: sourceTab?.shellOverride },
    getLocalProjectExecutionRuntimeContext(state, input.worktreeId)
  )
  const plan = buildAgentResumeStartupPlan({
    agent,
    providerSession,
    cmdOverrides: state.settings?.agentCmdOverrides ?? {},
    // Why the source's recipe: the copy keeps its launch mode (permissions, model arguments).
    ...resolveResumeLaunchRecipe(launchConfig, agent, source),
    platform: target.platform,
    agentHostPlatform: target.agentHostPlatform,
    shell: target.shell,
    resumeInLaunchCwd: true,
    fork: input.mode === 'fork',
    claudeNewSession: input.mode === 'new'
  })
  if (!plan) {
    return null
  }
  // Why the source's folder: Claude finds a conversation by the project folder it ran in.
  const cwd = source?.cwd ?? sourceTab?.startupCwd
  return {
    command: buildAiVaultResumeShellCommand({
      resumeCommand: plan.launchCommand,
      cwd: null,
      platform: target.platform,
      codexHome: agent === 'codex' ? codexHomeOfTranscript(input.session.transcriptPath) : null,
      shell: target.shell
    }),
    ...(cwd ? { cwd } : {}),
    ...(plan.env ? { env: plan.env } : {}),
    launchConfig: plan.launchConfig,
    // A CLI fork owns a new id the source never had, so cold restore must not resume the source.
    ...(input.mode === 'fork' ? {} : { providerSession })
  }
}
