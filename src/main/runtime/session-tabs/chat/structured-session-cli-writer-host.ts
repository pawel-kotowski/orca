import {
  terminalLaunchFacts,
  type TerminalLaunchResult
} from '../../../../shared/agent-session/lifecycle/agent-session-resume'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host/execution-host'
import type { StructuredAgentId } from '../../../../shared/agent-session/lifecycle/provider-handles/agent-session-provider-handle'
import { noteStructuredChatTerminalReport } from '../../agent-session/ownership/structured-chat-terminal-holds'
import { agentSessionRefusalError } from '../../../../shared/agent-session/failures/agent-session-wire-refusals'
import { assertCliConversationWritersExited } from '../../agent-session/lifecycle/structured-agent-cli-writers'
import type { EnrichedAgentHookEventPayload } from '../../../agent-hooks/server/server-types'
import type { AgentSessionRecord } from '../../../../shared/agent-session/lifecycle/agent-session-record'
import type { StructuredAgentCliSourceRoute } from '../../../native-chat/conversation-adoption/structured-agent-cli-source'
import { chatConversation } from '../../../native-chat/conversation-adoption/structured-chat-conversation'
import { OrcaRuntimeWithStructuredChatTerminalHolds } from './structured-chat-terminal-hold-host'

export abstract class OrcaRuntimeWithStructuredSessionCliWriterHost extends OrcaRuntimeWithStructuredChatTerminalHolds {
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
      // Only with its process: Orca itself names a resumed conversation before its agent runs.
      noteStructuredChatTerminalReport(pty.ptyId, event.providerSession?.id)
    }
  }

  protected async assertStructuredChatAcquireAdmissible(record: AgentSessionRecord): Promise<void> {
    const key = chatConversation(record)
    if (!key) {
      return
    }
    await this.assertStructuredAdoptionTerminalWritersExited(key.agent, key.id)
    if (await this.structuredChatHeld(record.sessionId, key)) {
      throw agentSessionRefusalError('agent_session_conflict', {
        reason: 'conversationHeldElsewhere'
      })
    }
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
