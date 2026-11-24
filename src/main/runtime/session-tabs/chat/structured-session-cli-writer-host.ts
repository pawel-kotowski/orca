import {
  terminalLaunchFacts,
  type TerminalLaunchResult
} from '../../../../shared/agent-session/lifecycle/agent-session-resume'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host/execution-host'
import type { StructuredAgentId } from '../../../../shared/agent-session/lifecycle/provider-handles/agent-session-provider-handle'
import { structuredChatTerminalHeld } from '../../agent-session/ownership/structured-chat-terminal-holds'
import {
  agentSessionRefusalError,
  isAgentSessionRefusalError
} from '../../../../shared/agent-session/failures/agent-session-wire-refusals'
import { isShellProcess } from '../../../../shared/agent-status/process/shell-process-detection'
import { namesCliConversation } from '../../../../shared/agent-session/view/structured-agent-cli-conversation-adoption'
import { assertCliConversationWritersExited } from '../../agent-session/lifecycle/structured-agent-cli-writers'
import type { EnrichedAgentHookEventPayload } from '../../../agent-hooks/server/server-types'
import type { AgentSessionRecord } from '../../../../shared/agent-session/lifecycle/agent-session-record'
import { CLI_CONVERSATION_ADOPTING_AGENTS } from '../../../../shared/agent-session/view/structured-agent-cli-conversation-adoption'
import { recordConversationKey } from '../../../native-chat/conversation-adoption/structured-conversation-key'
import type { StructuredAgentCliSourceRoute } from '../../../native-chat/conversation-adoption/structured-agent-cli-source'
import { OrcaRuntimeWithGetWorktreePs } from '../../workspaces/process-listing/workspace-process-listing'

export abstract class OrcaRuntimeWithStructuredSessionCliWriterHost extends OrcaRuntimeWithGetWorktreePs {
  getStructuredAgentCliSourceRoute(source: {
    workspaceId: string
    paneKey: string
  }): StructuredAgentCliSourceRoute {
    const pty = this.getPtyRecordForPaneKey(source.paneKey)
    if (!pty) {
      return 'unknown'
    }
    const pane = this.resolveTerminalPane(source.paneKey, source.workspaceId)
    if (pane.ptyId !== pty.ptyId || pty.worktreeId !== source.workspaceId) {
      return 'unknown'
    }
    return pty.connectionId ||
      pty.isWsl ||
      pty.wslDistro ||
      pane.executionHostId !== LOCAL_EXECUTION_HOST_ID
      ? 'unsupported'
      : 'native-local'
  }

  rememberSavedTerminalLaunchResult(ptyId: string, result: TerminalLaunchResult): void {
    const pty = this.ptysById.get(ptyId)
    if (pty && result.savedResumeDecision) {
      pty.savedTerminalLaunchResult = {
        incarnationId: pty.incarnationId,
        launchConfig: pty.launchConfig,
        launchToken: pty.launchToken,
        result: terminalLaunchFacts(result)
      }
    }
  }

  getTerminalLaunchResult(ptyId: string): TerminalLaunchResult | undefined {
    const pty = this.ptysById.get(ptyId)
    const saved = pty?.savedTerminalLaunchResult
    if (!pty) {
      return undefined
    }
    return terminalLaunchFacts({
      ...(saved?.incarnationId === pty.incarnationId &&
      saved.launchConfig === pty.launchConfig &&
      saved.launchToken === pty.launchToken
        ? saved.result
        : {}),
      launchAgent: pty.launchAgent ?? undefined,
      launchToken: pty.launchToken ?? undefined,
      launchConfig: pty.launchConfig ?? undefined
    })
  }

  /** A local hook that names its agent process supersedes the launch result saved for this PTY. */
  clearSavedTerminalLaunchOnAgentHook(event: EnrichedAgentHookEventPayload): void {
    const pty = this.getPtyRecordForPaneKey(event.paneKey)
    if (
      pty &&
      event.connectionId === null &&
      !event.structuredHost &&
      event.agentPresence?.process
    ) {
      delete pty.savedTerminalLaunchResult
    }
  }

  protected async assertStructuredChatAcquireAdmissible(record: AgentSessionRecord): Promise<void> {
    const head = record.providerHandleChain.at(-1)
    const key = head ? recordConversationKey(record, head) : null
    if (
      key?.id &&
      Object.values(CLI_CONVERSATION_ADOPTING_AGENTS).some((agents: readonly string[]) =>
        agents.includes(record.provider)
      )
    ) {
      await this.assertStructuredAdoptionTerminalWritersExited(record.provider, key.id)
      await this.assertNoUnjudgedTerminalWriter(record.sessionId, record.provider, key.id)
    }
  }

  /** Local: whether the terminal a chat was handed to may still write its conversation. */
  async structuredChatHeldByTerminal(record: AgentSessionRecord): Promise<boolean> {
    try {
      await this.assertStructuredChatAcquireAdmissible(record)
      return false
    } catch (error) {
      if (isAgentSessionRefusalError(error)) {
        return true
      }
      throw error
    }
  }

  /**
   * Local: the writer check admits an agent whose process it cannot judge (Codex reports none), and
   * one not yet reported; here those hold the chat until their pane is gone or back at its shell.
   */
  private async assertNoUnjudgedTerminalWriter(
    sessionId: string,
    agent: StructuredAgentId,
    providerSessionId: string
  ): Promise<void> {
    const rows = this.getAgentProviderSessionRows().filter(
      (row) => !row.structuredHost && namesCliConversation(row, agent, providerSessionId)
    )
    const settled: number[] = []
    let held = false
    for (const row of rows) {
      const observation = this.readHookCliWriterObservationFn?.(row)
      const judged = observation ? await observation.presence() : null
      const pty = this.getPtyRecordForPaneKey(row.paneKey)
      // A record outlives its terminal; only a connected one can still run the agent.
      if (judged !== null || !pty?.connected || (await this.terminalAtShell(pty.ptyId))) {
        settled.push(row.receivedAt)
      } else {
        held = true
      }
    }
    if (
      held ||
      structuredChatTerminalHeld(sessionId, {
        reportedAt: settled.length > 0 ? Math.max(...settled) : null,
        paneAlive: (paneKey) => this.getPtyRecordForPaneKey(paneKey)?.connected === true
      })
    ) {
      throw agentSessionRefusalError('agent_session_conflict', {
        reason: 'conversationHeldElsewhere'
      })
    }
  }

  private async terminalAtShell(ptyId: string): Promise<boolean> {
    const foreground = await this.ptyController?.getForegroundProcess(ptyId).catch(() => null)
    return typeof foreground === 'string' && isShellProcess(foreground)
  }

  async assertStructuredAdoptionTerminalWritersExited(
    agent: StructuredAgentId,
    providerSessionId: string,
    closingPaneKeys?: readonly string[]
  ): Promise<void> {
    await assertCliConversationWritersExited(
      {
        rows: () => this.getAgentProviderSessionRows(),
        observation: (row) => this.readHookCliWriterObservationFn?.(row) ?? null,
        ptyResolver: () => {
          // One identity read for every key, rather than a scan of all terminals per key.
          const context = this.createTerminalIdentityReadContext()
          return (paneKey) => this.getPtyRecordForPaneKey(paneKey, context)?.ptyId ?? null
        }
      },
      agent,
      providerSessionId,
      closingPaneKeys
    )
  }
}
