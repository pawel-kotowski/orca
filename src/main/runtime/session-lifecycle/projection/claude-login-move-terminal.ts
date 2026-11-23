import { OrcaRuntimeWithClaudeRunningPaneAccountMove } from './claude-running-pane-account-move'
import { isRemoteRuntimePtyId } from '../../../../shared/remote-runtime/remote-runtime-pty-id'
import { recognizeAgentProcess } from '../../../../shared/agent-status/process/agent-process-recognition'
import { isShellProcess } from '../../../../shared/agent-status/process/shell-process-detection'
import { mainAgentState } from '../../../../shared/agent-status/lifecycle/main-agent-status'
import { resolveResumeLaunchRecipe } from '../../../../shared/agent-launch/choices/resume-launch-recipe'
import { agentLaunchQuotingShell } from '../../../../shared/agent-launch/startup/agent-launch-runtime'
import type { AgentStartupShell } from '../../../../shared/agent-launch/startup/tui-agent-startup-shell'
import type { SleepingAgentLaunchConfig } from '../../../../shared/agent-session/lifecycle/agent-session-resume'
import type {
  ClaudeMoveForeground,
  ClaudeMoveTerminal
} from '../../../claude-accounts/session-login/claude-login-move'

/** What moving a chat to another Claude login needs of its terminal (claude-login-move). */
export abstract class OrcaRuntimeWithClaudeLoginMoveTerminal extends OrcaRuntimeWithClaudeRunningPaneAccountMove {
  /** This host's own live terminal and the Claude conversation it holds; null for any other. */
  readClaudeMoveTerminal(handle: string): ClaudeMoveTerminal | null {
    const pty = this.getLivePtyForHandle(handle)?.pty
    if (
      !pty?.connected ||
      pty.connectionId !== null ||
      pty.isWsl ||
      isRemoteRuntimePtyId(pty.ptyId)
    ) {
      return null
    }
    const { paneKey } = this.paneOfPty(pty)
    const session = this.claudePaneOf(pty)?.session ?? null
    const row = paneKey
      ? this.getAgentStatusRowsForPane(paneKey).find(
          (candidate) => candidate.agentType === 'claude' && !candidate.providerSessionOnly
        )
      : undefined
    return {
      ptyId: pty.ptyId,
      paneKey: paneKey ?? null,
      session: session && {
        id: session.id,
        transcriptPath: session.transcriptPath ?? null,
        cwd: session.cwd ?? null
      },
      turnRunning: row !== undefined && mainAgentState(row) !== 'done',
      backgroundWork: row !== undefined && mainAgentState(row) === 'done' && row.state !== 'done'
    }
  }

  async readClaudeMoveForeground(handle: string): Promise<ClaudeMoveForeground> {
    const pty = this.getLivePtyForHandle(handle)?.pty
    if (!pty || !this.ptyController) {
      return 'other'
    }
    const fresh = await this.ptyController.confirmForegroundProcess?.(pty.ptyId).catch(() => null)
    const name =
      fresh ?? (await this.ptyController.getForegroundProcess(pty.ptyId).catch(() => null))
    if (recognizeAgentProcess(name)?.agent === 'claude') {
      return 'claude'
    }
    return name && isShellProcess(name) ? 'shell' : 'other'
  }

  /** How this pane's Claude is launched: its recorded recipe, its shell and its workspace folder. */
  async readClaudeMoveLaunch(
    handle: string
  ): Promise<{ recipe: SleepingAgentLaunchConfig; shell: AgentStartupShell; path: string } | null> {
    const pty = this.getLivePtyForHandle(handle)?.pty
    if (!pty) {
      return null
    }
    const workspace = await this.resolveTerminalWorkspaceLaunchScope(`id:${pty.worktreeId}`)
    const { paneKey } = this.paneOfPty(pty)
    const record = paneKey
      ? this.getWorkspaceSessionForWorktree(pty.worktreeId)?.sleepingAgentSessionsByPaneKey?.[
          paneKey
        ]
      : undefined
    return {
      recipe: resolveResumeLaunchRecipe(
        pty.launchConfig ?? record?.launchConfig,
        'claude',
        this.claudePaneOf(pty)?.session
      ),
      shell: agentLaunchQuotingShell(this.resolveAgentLaunchRuntime(workspace, 'claude')),
      path: workspace.path
    }
  }
}
