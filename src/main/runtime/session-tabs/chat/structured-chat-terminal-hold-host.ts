import type { AgentSessionRecord } from '../../../../shared/agent-session/lifecycle/agent-session-record'
import type { StructuredAgentId } from '../../../../shared/agent-session/lifecycle/provider-handles/agent-session-provider-handle'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host/execution-host'
import { isAgentSessionRefusalError } from '../../../../shared/agent-session/failures/agent-session-wire-refusals'
import { namesCliConversation } from '../../../../shared/agent-session/view/structured-agent-cli-conversation-adoption'
import { chatConversation } from '../../../native-chat/conversation-adoption/structured-chat-conversation'
import { getStructuredAgentSessionHost } from '../../../native-chat/agent-session-wire/host/structured-agent-session-registry'
import {
  chatTerminalHandoverSubscription,
  forgetUnreadableStructuredChatTerminalHolds,
  heldStructuredChats,
  noteStructuredChatTerminalRan,
  onStructuredChatTerminalHoldEnded,
  releaseStructuredChatTerminalHold,
  releaseUnlaunchedStructuredChatTerminalHolds,
  structuredChatTerminalHold,
  structuredChatTerminalHoldsUnreadable,
  structuredChatTerminalMayWrite,
  structuredChatTerminalStarting,
  type StructuredChatHoldTerminal,
  type StructuredChatTerminalHold,
  type TerminalHoldPane
} from '../../agent-session/ownership/structured-chat-terminal-holds'
import {
  noteStructuredChatReturnSent,
  structuredChatReturns,
  takeStructuredChatReturn
} from '../../agent-session/ownership/structured-chat-returns'
import { readTerminalProcesses } from '../../agent-session/ownership/structured-chat-terminal-process'
import {
  readLiveDaemonSessions,
  readTerminalHoldPane,
  terminalsOfOtherConversations,
  type TerminalHoldReads
} from './structured-chat-terminal-hold-reads'
import { OrcaRuntimeWithGetWorktreePs } from '../../workspaces/process-listing/workspace-process-listing'

const TERMINAL_HOLD_CHECK_MS = 2_000
const TERMINAL_START_CHECK_MS = 250

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
  private async terminalRowsMayWrite(
    key: { agent: StructuredAgentId; id: string },
    reads?: TerminalHoldReads
  ): Promise<boolean> {
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
      const { pane } = await this.readHoldPane(
        {
          ptyId: pty?.ptyId ?? null,
          incarnationId: pty?.incarnationId ?? null,
          paneKey: row.paneKey
        },
        key.id,
        reads ?? (await this.readHoldTerminals())
      )
      if (pane === 'running' || pane === 'unknown') {
        return true
      }
    }
    return false
  }

  private async readHoldTerminals(): Promise<TerminalHoldReads> {
    const listed = this.ptyController?.listProcesses?.(LOCAL_EXECUTION_HOST_ID)
    const processes = listed ? await listed.catch(() => null) : null
    const daemon = processes ? await readLiveDaemonSessions().catch(() => null) : null
    return {
      processes,
      daemon,
      table: await readTerminalProcesses()
    }
  }

  private readHoldPane(
    terminal: Pick<StructuredChatHoldTerminal, 'ptyId' | 'incarnationId' | 'paneKey'>,
    conversationId: string,
    reads: TerminalHoldReads
  ) {
    return readTerminalHoldPane(terminal, conversationId, reads, {
      shellAloneOnWindows: (ptyId) => this.confirmTerminalShellAlone(ptyId),
      verdict: (ptyId) => this.ptyLivenessVerdictByPtyId.get(ptyId)?.verdict
    })
  }

  private async structuredChatTerminalActive(
    sessionId: string,
    hold: StructuredChatTerminalHold
  ): Promise<boolean> {
    if (hold.phase === 'opening' || structuredChatTerminalStarting(hold)) {
      return true
    }
    const { conversationId: id, terminals } = hold
    const inputAt = () =>
      terminals.map(({ ptyId }) =>
        ptyId === null ? null : this.terminalRunFacts.readLastInputAt(ptyId)
      )
    const inputBefore = inputAt()
    const reads = await this.readHoldTerminals()
    const anywhere = reads.table.runsAnywhere(
      id,
      await terminalsOfOtherConversations(hold, reads, this.getAgentProviderSessionRows(), {
        ptyId: (row) => this.getPtyRecordForPaneKey(row.paneKey)?.ptyId,
        live: async (row) =>
          (await this.readHookCliWriterObservationFn?.(row)?.presence()) === 'live'
      })
    )
    const panes: TerminalHoldPane[] = []
    for (const terminal of terminals) {
      const { pane, ran } = await this.readHoldPane(terminal, id, reads)
      panes.push(pane)
      if (ran || (pane === 'shell' && this.launchCommandEnded(terminal, id))) {
        noteStructuredChatTerminalRan(sessionId, terminal.ptyId)
      }
    }
    const rowsMayWrite = await this.terminalRowsMayWrite({ agent: hold.agent, id }, reads)
    const current = structuredChatTerminalHold(sessionId)
    return (
      current?.token !== hold.token ||
      current.terminals.length !== terminals.length ||
      structuredChatTerminalStarting(current) ||
      (process.platform !== 'win32' && anywhere !== false) ||
      rowsMayWrite ||
      // Typed into meanwhile: it may have started the agent again after its processes were read.
      inputAt().some((at, index) => at !== inputBefore[index]) ||
      current.terminals.some(
        (terminal, index) =>
          terminal.ptyId !== terminals[index].ptyId ||
          terminal.incarnationId !== terminals[index].incarnationId ||
          structuredChatTerminalMayWrite(terminal, panes[index])
      )
    )
  }

  /** Its launch command started and finished too soon to be seen (not signed in, not installed): the
   *  shell ran a command, and the launch is among what it was given. */
  private launchCommandEnded(terminal: StructuredChatHoldTerminal, id: string): boolean {
    const pty = terminal.ptyId === null ? undefined : this.ptysById.get(terminal.ptyId)
    return (
      pty?.commandPaint?.ranCommand === true &&
      [...pty.tailBuffer, pty.tailPartialLine].join('').replace(/\s/g, '').includes(id)
    )
  }

  abstract redriveStructuredSessionMail(sessionId: string): void

  private readonly resuming = new Set<string>()

  /** What waited for a chat goes to it once its terminal is done, also when nobody looks at it. */
  private async resumeReturnedChats(): Promise<void> {
    for (const [sessionId, entry] of structuredChatReturns()) {
      if (this.resuming.has(sessionId)) {
        continue
      }
      this.resuming.add(sessionId)
      try {
        await this.ensureStructuredAgentSessionHost()
        const host = getStructuredAgentSessionHost()
        const outcome = await host?.wakeReturnedSession(sessionId, entry)
        if (outcome === 'done') {
          takeStructuredChatReturn(sessionId, entry)
        } else if (outcome === 'sent') {
          noteStructuredChatReturnSent(sessionId, entry)
        }
        if (outcome !== 'later' || !entry.sent) {
          this.redriveStructuredSessionMail(sessionId)
        }
      } catch (error) {
        console.warn('[chat-terminal] waking a returned chat failed', sessionId, error)
      } finally {
        this.resuming.delete(sessionId)
      }
    }
  }

  private terminalHoldWatch: ReturnType<typeof setTimeout> | null = null

  /** While any chat is handed over, from startup on: gives it back once its terminal is done. */
  protected startStructuredChatTerminalHolds(): void {
    onStructuredChatTerminalHoldEnded((ended) => {
      this.cleanupSubscription(chatTerminalHandoverSubscription(ended.hold.token))
      void this.resumeReturnedChats().then(() => this.watchStructuredChatTerminalHolds())
    })
    const first = setTimeout(() => {
      releaseUnlaunchedStructuredChatTerminalHolds()
      this.watchStructuredChatTerminalHolds()
    }, TERMINAL_HOLD_CHECK_MS)
    first.unref?.()
  }

  watchStructuredChatTerminalHolds(): void {
    if (
      this.terminalHoldWatch ||
      (heldStructuredChats().length === 0 &&
        structuredChatReturns().length === 0 &&
        !structuredChatTerminalHoldsUnreadable())
    ) {
      return
    }
    this.terminalHoldWatch = setTimeout(
      () => {
        void this.releaseFinishedTerminalHolds().finally(() => {
          this.terminalHoldWatch = null
          this.watchStructuredChatTerminalHolds()
        })
      },
      this.agentIsStarting() ? TERMINAL_START_CHECK_MS : TERMINAL_HOLD_CHECK_MS
    )
    this.terminalHoldWatch.unref?.()
  }

  /** A handover whose agent was not seen yet, in a terminal that is busy: one that fails at once may
   *  come and go between two slow looks. */
  private agentIsStarting(): boolean {
    return heldStructuredChats().some((sessionId) => {
      const hold = structuredChatTerminalHold(sessionId)
      return (
        hold?.phase === 'opening' ||
        hold?.terminals.some(({ ptyId, ran }) => {
          const pty = ptyId === null || ran ? undefined : this.ptysById.get(ptyId)
          return (
            pty !== undefined &&
            Date.now() - (pty.lastOutputAt ?? Date.now()) < TERMINAL_HOLD_CHECK_MS
          )
        }) === true
      )
    })
  }

  private async releaseFinishedTerminalHolds(): Promise<void> {
    const store = getStructuredAgentSessionHost()?.deps.store
    for (const sessionId of heldStructuredChats()) {
      const hold = structuredChatTerminalHold(sessionId)
      if (!hold) {
        continue
      }
      try {
        const deleted =
          store !== undefined &&
          store.getConversation(sessionId) === null &&
          !store.isSessionUnreadable(sessionId)
        // Only its own handover ends, after the checks' waits.
        if (deleted || !(await this.structuredChatTerminalActive(sessionId, hold))) {
          releaseStructuredChatTerminalHold(sessionId, hold.token)
        }
      } catch (error) {
        console.warn('[chat-terminal] checking a handed-over chat failed', sessionId, error)
      }
    }
    await this.resumeReturnedChats()
    if (structuredChatTerminalHoldsUnreadable()) {
      const { processes, daemon, table } = await this.readHoldTerminals()
      const agents = processes?.map(({ rootProcessId }) =>
        rootProcessId ? table.runsAgentBelow(rootProcessId) : null
      )
      const listed = new Set(processes?.map(({ id }) => id))
      if (
        daemon?.sessions.every(({ sessionId }) => listed.has(sessionId)) &&
        agents?.every((runs) => runs === false)
      ) {
        forgetUnreadableStructuredChatTerminalHolds()
      }
    }
  }
}
