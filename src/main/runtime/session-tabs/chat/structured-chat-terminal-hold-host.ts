import type { AgentSessionRecord } from '../../../../shared/agent-session/lifecycle/agent-session-record'
import type { StructuredAgentId } from '../../../../shared/agent-session/lifecycle/provider-handles/agent-session-provider-handle'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host/execution-host'
import { isAgentSessionRefusalError } from '../../../../shared/agent-session/failures/agent-session-wire-refusals'
import {
  CLI_CONVERSATION_ADOPTING_AGENTS,
  namesCliConversation
} from '../../../../shared/agent-session/view/structured-agent-cli-conversation-adoption'
import { recordConversationKey } from '../../../native-chat/conversation-adoption/structured-conversation-key'
import { getStructuredAgentSessionHost } from '../../../native-chat/agent-session-wire/host/structured-agent-session-registry'
import {
  heldStructuredChats,
  noteStructuredChatTerminalSeen,
  onStructuredChatTerminalHoldEnded,
  releaseStructuredChatTerminalHold,
  releaseUnlaunchedStructuredChatTerminalHolds,
  structuredChatTerminalHold,
  structuredChatTerminalHoldsUnreadable,
  structuredChatTerminalMayWrite,
  structuredChatTerminalSpawning,
  type StructuredChatTerminalHold,
  type TerminalHoldPane
} from '../../agent-session/ownership/structured-chat-terminal-holds'
import { readTerminalProcesses } from '../../agent-session/ownership/structured-chat-terminal-process'
import { OrcaRuntimeWithGetWorktreePs } from '../../workspaces/process-listing/workspace-process-listing'

const TERMINAL_HOLD_CHECK_MS = 2_000

// Lazy: the daemon modules' xterm polyfill defines a global `window` on import.
async function listLiveDaemonSessionIds(): Promise<string[] | null> {
  const { listLiveDaemonPtyIds } =
    await import('../../../daemon/providers/lifecycle/daemon-provider-state')
  return listLiveDaemonPtyIds()
}

/** The provider conversation of a chat whose terminal writers the host can tell. */
export function chatConversation(
  record: AgentSessionRecord
): { agent: StructuredAgentId; id: string } | null {
  const head = record.providerHandleChain.at(-1)
  const key = head ? recordConversationKey(record, head) : null
  return key?.id &&
    Object.values(CLI_CONVERSATION_ADOPTING_AGENTS).some((agents: readonly string[]) =>
      agents.includes(record.provider)
    )
    ? { agent: record.provider, id: key.id }
    : null
}

/** Local: chats handed to a terminal, and the proofs that end a hold. */
export abstract class OrcaRuntimeWithStructuredChatTerminalHolds extends OrcaRuntimeWithGetWorktreePs {
  protected abstract assertStructuredChatAcquireAdmissible(
    record: AgentSessionRecord
  ): Promise<void>

  /** A chat that is not held starts as upstream's does. */
  protected async structuredChatHeld(
    sessionId: string,
    key: { agent: StructuredAgentId; id: string }
  ): Promise<boolean> {
    const hold = structuredChatTerminalHold(sessionId)
    return hold
      ? this.structuredChatTerminalActive(sessionId, hold)
      : structuredChatTerminalHoldsUnreadable() && (await this.terminalRowsMayWrite(key))
  }

  /** Local: whether a terminal runs the conversation of a chat that is about to be handed over. */
  async structuredChatRunsInTerminal(record: AgentSessionRecord): Promise<boolean> {
    const key = chatConversation(record)
    try {
      await this.assertStructuredChatAcquireAdmissible(record)
    } catch (error) {
      if (isAgentSessionRefusalError(error)) {
        return true
      }
      throw error
    }
    return key !== null && (await this.terminalRowsMayWrite(key))
  }

  /** Local: a person asked for the chat back. `false`: its terminal may still write it. */
  async takeBackStructuredChat(record: AgentSessionRecord, holdId?: string): Promise<boolean> {
    const { sessionId } = record
    const hold = structuredChatTerminalHold(sessionId)
    if (!hold) {
      try {
        await this.assertStructuredChatAcquireAdmissible(record)
        return true
      } catch (error) {
        if (isAgentSessionRefusalError(error)) {
          return false
        }
        throw error
      }
    }
    if (holdId !== undefined && hold.id !== holdId) {
      // That handover ended; this one is another client's.
      return true
    }
    // Its terminal was not asked for yet, and cannot be without this hold.
    if (hold.phase !== 'opening' && (await this.structuredChatTerminalActive(sessionId, hold))) {
      return false
    }
    releaseStructuredChatTerminalHold(sessionId, hold.token)
    return true
  }

  /** Whether another terminal may write the conversation. Stricter than upstream's check, which
   *  admits what it cannot judge (Codex reports no process): such a row counts until its terminal is
   *  gone or its shell is alone. */
  private async terminalRowsMayWrite(key: {
    agent: StructuredAgentId
    id: string
  }): Promise<boolean> {
    for (const row of this.getAgentProviderSessionRows()) {
      if (row.structuredHost || !namesCliConversation(row, key.agent, key.id)) {
        continue
      }
      const judged = await this.readHookCliWriterObservationFn?.(row)?.presence()
      if (judged === 'exited') {
        continue
      }
      if (judged === 'live') {
        return true
      }
      const pty = this.getPtyRecordForPaneKey(row.paneKey)
      const { pane } = await this.readTerminalHoldPane(
        {
          ptyId: pty?.ptyId ?? null,
          incarnationId: pty?.incarnationId ?? null,
          paneKey: row.paneKey
        },
        key.id
      )
      if (pane === 'running' || pane === 'unknown') {
        return true
      }
    }
    return false
  }

  /** The terminal as its host has it now, after an Orca restart too: a terminal that was not
   *  reattached yet is in the daemon's own list. */
  private async readTerminalHoldPane(
    terminal: Pick<StructuredChatTerminalHold, 'ptyId' | 'incarnationId' | 'paneKey'>,
    conversationId: string
  ): Promise<{ pane: TerminalHoldPane; ran: boolean }> {
    const { ptyId, incarnationId, paneKey } = terminal
    const same = (other: string | null | undefined) =>
      incarnationId === null || other === incarnationId
    const answer = (pane: TerminalHoldPane, ran = false) => ({ pane, ran })
    const processes = await this.ptyController
      ?.listProcesses?.(LOCAL_EXECUTION_HOST_ID)
      .catch(() => null)
    const listed = processes?.find((process) =>
      ptyId === null
        ? paneKey !== null && process.paneKey === paneKey
        : process.id === ptyId && same(process.incarnationId)
    )
    if (listed) {
      if (process.platform === 'win32') {
        const alone = await this.confirmTerminalShellAlone(listed.id)
        return answer(alone ? 'shell' : 'running')
      }
      const read = listed.rootProcessId
        ? await readTerminalProcesses(listed.rootProcessId, conversationId)
        : { shellAlone: false, runsConversation: false }
      return answer(read.shellAlone ? 'shell' : 'running', read.runsConversation)
    }
    if (ptyId !== null) {
      const verdict = this.ptyLivenessVerdictByPtyId.get(ptyId)?.verdict
      if (verdict?.status === 'exited' && same(verdict.incarnationId)) {
        return answer('absent')
      }
      if (this.ptyController?.hasPty?.(ptyId)) {
        return answer('unknown')
      }
    }
    // Only every daemon's own answer proves a terminal this process does not have is gone.
    const live = processes ? await listLiveDaemonSessionIds().catch(() => null) : null
    return answer(live === null || (ptyId !== null && live.includes(ptyId)) ? 'unknown' : 'absent')
  }

  private async structuredChatTerminalActive(
    sessionId: string,
    hold: StructuredChatTerminalHold
  ): Promise<boolean> {
    if (hold.phase === 'opening' || structuredChatTerminalSpawning(hold.token)) {
      return true
    }
    const { ptyId, conversationId: id } = hold
    const inputAt = () => (ptyId === null ? null : this.terminalRunFacts.readLastInputAt(ptyId))
    const inputBefore = inputAt()
    const { pane, ran } = await this.readTerminalHoldPane(hold, id)
    const launch = ptyId === null ? undefined : this.ptysById.get(ptyId)?.launchEvidence
    noteStructuredChatTerminalSeen(sessionId, { ran, launchHeld: launch?.kind === 'held' })
    const rowsMayWrite = await this.terminalRowsMayWrite({ agent: hold.agent, id })
    const current = structuredChatTerminalHold(sessionId)
    return (
      current?.token !== hold.token ||
      current.ptyId !== ptyId ||
      // Typed into meanwhile: it may have started the agent again after its processes were read.
      inputAt() !== inputBefore ||
      structuredChatTerminalMayWrite(current, {
        pane,
        launchGone: launch?.kind === 'gone',
        rowsMayWrite
      })
    )
  }

  abstract redriveStructuredSessionMail(sessionId: string): void

  /** What waited for a chat goes to it once its terminal is done, also when nobody looks at it. */
  private async resumeReturnedChat(sessionId: string): Promise<void> {
    try {
      await this.ensureStructuredAgentSessionHost()
      await getStructuredAgentSessionHost()?.wakeReturnedSession(sessionId)
    } catch (error) {
      console.warn('[chat-terminal] waking a returned chat failed', error)
    }
    this.redriveStructuredSessionMail(sessionId)
  }

  private terminalHoldWatch: ReturnType<typeof setTimeout> | null = null

  /** While any chat is handed over, from startup on: gives it back once its terminal is done. */
  protected startStructuredChatTerminalHolds(): void {
    onStructuredChatTerminalHoldEnded((sessionId) => void this.resumeReturnedChat(sessionId))
    const first = setTimeout(() => {
      releaseUnlaunchedStructuredChatTerminalHolds()
      this.watchStructuredChatTerminalHolds()
    }, TERMINAL_HOLD_CHECK_MS)
    first.unref?.()
  }

  watchStructuredChatTerminalHolds(): void {
    if (this.terminalHoldWatch || heldStructuredChats().length === 0) {
      return
    }
    this.terminalHoldWatch = setTimeout(() => {
      void this.releaseFinishedTerminalHolds()
        .catch((error: unknown) =>
          console.warn('[chat-terminal] checking handed-over chats failed', error)
        )
        .finally(() => {
          this.terminalHoldWatch = null
          this.watchStructuredChatTerminalHolds()
        })
    }, TERMINAL_HOLD_CHECK_MS)
    this.terminalHoldWatch.unref?.()
  }

  private async releaseFinishedTerminalHolds(): Promise<void> {
    const store = getStructuredAgentSessionHost()?.deps.store
    for (const sessionId of heldStructuredChats()) {
      const hold = structuredChatTerminalHold(sessionId)
      if (!hold) {
        continue
      }
      const deleted =
        store !== undefined &&
        store.getConversation(sessionId) === null &&
        !store.isSessionUnreadable(sessionId)
      // Only its own handover ends, after the checks' waits.
      if (deleted || !(await this.structuredChatTerminalActive(sessionId, hold))) {
        releaseStructuredChatTerminalHold(sessionId, hold.token)
      }
    }
  }
}
