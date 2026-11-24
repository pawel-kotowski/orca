import type { SessionInfo } from '../../../daemon/protocol/daemon-session-info'
import type { AgentStatusIpcPayload } from '../../../../shared/agent-status/contracts/agent-status-ipc-payload'
import type { PtyProcessInfo } from '../../../providers/pty/process-info'
import type { PtyLivenessVerdict } from '../../../../shared/terminal/pty/lifecycle/pty-liveness-verdict'
import {
  structuredChatTerminalAskedHere,
  type StructuredChatHoldTerminal,
  type StructuredChatTerminalHold,
  type TerminalHoldPane
} from '../../agent-session/ownership/structured-chat-terminal-holds'
import type { TerminalProcesses } from '../../agent-session/ownership/structured-chat-terminal-process'

// Lazy: the daemon modules' xterm polyfill defines a global `window` on import.
export async function readLiveDaemonSessions(): Promise<TerminalHoldReads['daemon']> {
  const { getDaemonProvider, listLiveDaemonSessions } =
    await import('../../../daemon/providers/lifecycle/daemon-provider-state')
  if (getDaemonProvider() === null) {
    return { installed: false, sessions: [] }
  }
  const sessions = await listLiveDaemonSessions()
  return sessions && { installed: true, sessions: sessions.filter(({ isAlive }) => isAlive) }
}

/** What every look of one pass shares. */
export type TerminalHoldReads = {
  processes: PtyProcessInfo[] | null
  /** Null while any daemon generation does not answer. */
  daemon: {
    installed: boolean
    sessions: Pick<SessionInfo, 'sessionId' | 'incarnationId' | 'paneKey'>[]
  } | null
  table: TerminalProcesses
}

/** The terminal as its host has it now, after an Orca restart too: a terminal that was not
 *  reattached yet is in the daemon's own list. */
export async function readTerminalHoldPane(
  terminal: Pick<StructuredChatHoldTerminal, 'ptyId' | 'incarnationId' | 'paneKey'>,
  conversationId: string,
  { processes, daemon, table }: TerminalHoldReads,
  host: {
    shellAloneOnWindows: (ptyId: string) => Promise<boolean>
    verdict: (ptyId: string) => PtyLivenessVerdict | undefined
  }
): Promise<{ pane: TerminalHoldPane; ran: boolean }> {
  const { ptyId, incarnationId, paneKey } = terminal
  const same = (other: string | null | undefined) =>
    incarnationId === null || other === incarnationId
  const answer = (pane: TerminalHoldPane, ran = false) => ({ pane, ran })
  const listed = processes?.find((candidate) =>
    ptyId === null
      ? paneKey !== null && candidate.paneKey === paneKey
      : candidate.id === ptyId && same(candidate.incarnationId)
  )
  if (listed) {
    const root = listed.rootProcessId
    if (process.platform === 'win32') {
      const alone = await host.shellAloneOnWindows(listed.id)
      return answer(alone ? 'shell' : 'running')
    }
    return root
      ? answer(
          (await table.shellAlone(root)) ? 'shell' : 'running',
          table.runsBelow(root, conversationId)
        )
      : answer('running')
  }
  if (processes === null) {
    return answer('unknown')
  }
  const verdict = ptyId === null ? undefined : host.verdict(ptyId)
  if (verdict?.status === 'exited' && same(verdict.incarnationId)) {
    return answer('absent')
  }
  if (daemon === null) {
    return answer('unknown')
  }
  if (!daemon.installed) {
    // No daemon keeps terminals, so this process's own list is all there is of its terminals.
    return answer(ptyId !== null && structuredChatTerminalAskedHere(ptyId) ? 'absent' : 'unknown')
  }
  // Every daemon answered; a shell that took the id since (a cold restore) is another process.
  const lives = daemon.sessions.some((session) =>
    ptyId === null
      ? paneKey !== null && session.paneKey === paneKey
      : session.sessionId === ptyId && same(session.incarnationId)
  )
  return answer(lives ? 'unknown' : 'absent')
}

/** Terminals whose live agent was started on the conversation and reported another since (`/clear`).
 *  Only a row whose own process lives says so: a row outlives its agent, and Codex names none. */
export async function terminalsOfOtherConversations(
  hold: StructuredChatTerminalHold,
  { processes }: TerminalHoldReads,
  rows: readonly AgentStatusIpcPayload[],
  host: {
    ptyId: (row: AgentStatusIpcPayload) => string | undefined
    live: (row: AgentStatusIpcPayload) => Promise<boolean>
  }
): Promise<number[]> {
  const own = new Set(hold.terminals.map(({ ptyId }) => ptyId))
  const named = new Map<string, boolean>()
  for (const row of rows) {
    const ptyId = host.ptyId(row)
    if (ptyId && !row.structuredHost && !own.has(ptyId)) {
      const other =
        row.providerSession !== undefined &&
        row.providerSession.id !== hold.conversationId &&
        (await host.live(row))
      named.set(ptyId, other && named.get(ptyId) !== false)
    }
  }
  return (processes ?? []).flatMap(({ id, rootProcessId }) =>
    rootProcessId && named.get(id) ? [rootProcessId] : []
  )
}
