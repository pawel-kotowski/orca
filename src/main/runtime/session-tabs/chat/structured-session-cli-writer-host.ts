import {
  terminalLaunchFacts,
  type TerminalLaunchResult
} from '../../../../shared/agent-session/lifecycle/agent-session-resume'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host/execution-host'
import type { StructuredAgentId } from '../../../../shared/agent-session/lifecycle/provider-handles/agent-session-provider-handle'
import {
  heldStructuredChats,
  noteStructuredChatTerminalReport,
  releaseStructuredChatTerminalHold,
  structuredChatTerminalHold,
  structuredChatTerminalMayWrite,
  type TerminalHoldPane
} from '../../agent-session/ownership/structured-chat-terminal-holds'
import { getStructuredAgentSessionHost } from '../../../native-chat/agent-session-wire/host/structured-agent-session-registry'
import {
  agentSessionRefusalError,
  isAgentSessionRefusalError
} from '../../../../shared/agent-session/failures/agent-session-wire-refusals'
import { namesCliConversation } from '../../../../shared/agent-session/view/structured-agent-cli-conversation-adoption'
import { assertCliConversationWritersExited } from '../../agent-session/lifecycle/structured-agent-cli-writers'
import type { EnrichedAgentHookEventPayload } from '../../../agent-hooks/server/server-types'
import type { AgentSessionRecord } from '../../../../shared/agent-session/lifecycle/agent-session-record'
import { CLI_CONVERSATION_ADOPTING_AGENTS } from '../../../../shared/agent-session/view/structured-agent-cli-conversation-adoption'
import { recordConversationKey } from '../../../native-chat/conversation-adoption/structured-conversation-key'
import type { StructuredAgentCliSourceRoute } from '../../../native-chat/conversation-adoption/structured-agent-cli-source'
import { OrcaRuntimeWithGetWorktreePs } from '../../workspaces/process-listing/workspace-process-listing'

const TERMINAL_HOLD_CHECK_MS = 2_000

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
    if (event.connectionId === null && !event.structuredHost) {
      noteStructuredChatTerminalReport(event.providerSession?.id)
    }
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
      if (await this.structuredChatTerminalActive(record)) {
        throw agentSessionRefusalError('agent_session_conflict', {
          reason: 'conversationHeldElsewhere'
        })
      }
    }
  }

  /** Local: whether a terminal runs the chat's conversation, or may be about to. */
  async structuredChatHeldByTerminal(record: AgentSessionRecord): Promise<boolean> {
    this.watchStructuredChatTerminalHolds()
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

  /** Local: a person asked for the chat back; only a terminal that can be running keeps it. */
  async takeBackStructuredChat(record: AgentSessionRecord): Promise<boolean> {
    const hold = structuredChatTerminalHold(record.sessionId)
    if (!hold) {
      return !(await this.structuredChatHeldByTerminal(record))
    }
    const key = { agent: record.provider, id: hold.conversationId }
    if (await this.terminalRowsMayWrite(key)) {
      return false
    }
    const pane = hold.paneKey === null ? null : await this.terminalHoldPane(hold.paneKey)
    const running =
      pane === null
        ? await this.unreportedAgentTerminalRuns(record)
        : pane === 'running' || (pane === 'shell' && !hold.reported)
    if (running) {
      return false
    }
    this.releaseStructuredChatHold(record.sessionId)
    return true
  }

  /** The writer check admits an agent whose process it cannot judge (Codex reports none); here such
   *  a row counts until its pane is gone or its shell is alone. */
  private async terminalRowsMayWrite(key: {
    agent: StructuredAgentId
    id: string
  }): Promise<boolean> {
    for (const row of this.getAgentProviderSessionRows()) {
      if (row.structuredHost || !namesCliConversation(row, key.agent, key.id)) {
        continue
      }
      const judged = await this.readHookCliWriterObservationFn?.(row)?.presence()
      if (judged === 'live') {
        return true
      }
      const pty = judged ? null : this.getPtyRecordForPaneKey(row.paneKey)
      if (pty?.connected && !(await this.confirmTerminalShellAlone(pty.ptyId))) {
        return true
      }
    }
    return false
  }

  private async terminalHoldPane(paneKey: string): Promise<TerminalHoldPane> {
    const pty = this.getPtyRecordForPaneKey(paneKey)
    if (!pty) {
      return 'missing'
    }
    if (!pty.connected) {
      return 'dead'
    }
    return (await this.confirmTerminalShellAlone(pty.ptyId)) ? 'shell' : 'running'
  }

  /** A terminal of this agent in the workspace that runs something and has reported nothing yet. */
  private async unreportedAgentTerminalRuns(record: AgentSessionRecord): Promise<boolean> {
    const reported = new Set(
      this.getAgentProviderSessionRows().map(
        (row) => this.getPtyRecordForPaneKey(row.paneKey)?.ptyId
      )
    )
    for (const pty of this.ptysById.values()) {
      if (
        pty.connected &&
        pty.worktreeId === record.location.workspaceId &&
        pty.launchAgent === record.provider &&
        !reported.has(pty.ptyId) &&
        !(await this.confirmTerminalShellAlone(pty.ptyId))
      ) {
        return true
      }
    }
    return false
  }

  private async structuredChatTerminalActive(record: AgentSessionRecord): Promise<boolean> {
    const hold = structuredChatTerminalHold(record.sessionId)
    const head = record.providerHandleChain.at(-1)
    const id = hold?.conversationId ?? (head ? recordConversationKey(record, head)?.id : undefined)
    const rows = id ? await this.terminalRowsMayWrite({ agent: record.provider, id }) : false
    // A pane never named (a paired host's tab) is judged by what its agent reports.
    const pane =
      hold === null || hold.paneKey === null
        ? hold?.reported
          ? 'shell'
          : 'missing'
        : await this.terminalHoldPane(hold.paneKey)
    return structuredChatTerminalMayWrite(record.sessionId, pane, rows)
  }

  abstract redriveStructuredSessionMail(sessionId: string): void

  private releaseStructuredChatHold(sessionId: string): void {
    releaseStructuredChatTerminalHold(sessionId)
    // What waited for the chat goes to it now, as at an idle edge.
    this.redriveStructuredSessionMail(sessionId)
    getStructuredAgentSessionHost()?.wakeQueuedMessages(sessionId)
  }

  private terminalHoldWatch: ReturnType<typeof setInterval> | null = null

  /** While a chat is handed over: gives it back by itself once its terminal is done. */
  watchStructuredChatTerminalHolds(): void {
    if (this.terminalHoldWatch || heldStructuredChats().length === 0) {
      return
    }
    let checking = false
    this.terminalHoldWatch = setInterval(() => {
      if (checking) {
        return
      }
      checking = true
      void this.releaseFinishedTerminalHolds()
        .catch((error: unknown) =>
          console.warn('[chat-terminal] checking handed-over chats failed', error)
        )
        .finally(() => {
          checking = false
          if (heldStructuredChats().length === 0 && this.terminalHoldWatch) {
            clearInterval(this.terminalHoldWatch)
            this.terminalHoldWatch = null
          }
        })
    }, TERMINAL_HOLD_CHECK_MS)
    this.terminalHoldWatch.unref?.()
  }

  private async releaseFinishedTerminalHolds(): Promise<void> {
    const store = getStructuredAgentSessionHost()?.deps.store
    for (const sessionId of heldStructuredChats()) {
      const hold = structuredChatTerminalHold(sessionId)
      const record = store?.getRecord(sessionId)
      if (hold && record && !(await this.structuredChatTerminalActive(record))) {
        // The same handover still, after the checks' waits.
        if (structuredChatTerminalHold(sessionId)?.token === hold.token) {
          this.releaseStructuredChatHold(sessionId)
        }
      }
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
