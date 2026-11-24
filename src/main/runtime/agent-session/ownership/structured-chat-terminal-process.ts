import { getFreshShellForegroundSnapshot } from '../../../../shared/process-observation/tables/process-table-snapshot-reader'
import {
  collectDescendantsFromIndex,
  getProcessTableIndex
} from '../../../../shared/process-observation/tables/process-table-index'
import { recognizeAgentProcessFromCommandLine } from '../../../../shared/agent-status/process/agent-process-recognition'
import { readClaudeSessionRecords } from './claude-session-records'
import { commandResumesConversation } from './structured-chat-conversation-command'
import {
  confirmRootShellAloneFromProcessTable,
  paneAgentProcess
} from '../../terminal/lifecycle/run-terminal-shell-alone'

export type TerminalProcesses = {
  /** An agent process on this machine, wherever it runs (a detached tmux too), has the conversation
   *  in its command line or, for Claude, in its own record; null when that could not be read. `except`: terminals whose agent
   *  is known to have moved on to another. */
  runsAnywhere: (conversationId: string, except?: readonly number[]) => boolean | null
  runsBelow: (rootPid: number, conversationId: string) => boolean
  runsAgentBelow: (rootPid: number) => boolean | null
  /** Proven: the shell has the foreground, and nothing is stopped behind it (Ctrl-Z) or runs any
   *  agent in the background. */
  shellAlone: (rootPid: number) => Promise<boolean>
}

const CLAUDE_SERVICE = /\bclaude(\.exe)? daemon run\b|\/claude\/versions\/\S+ daemon run\b/
const CLAUDE_BACKGROUND = /\bbg-(spare|pty-host)\b/

/** This machine's processes, read once for everything that looks at them now. */
export async function readTerminalProcesses(): Promise<TerminalProcesses> {
  try {
    const index = getProcessTableIndex(await getFreshShellForegroundSnapshot())
    // After the processes, so that one on its way to the background was still in the foreground
    // there or has its record by now.
    const records = await readClaudeSessionRecords()
    const interactive = paneAgentProcess()
    // A one-shot `claude -p --resume … &` writes the conversation too.
    const isAgent = (row: { command: string; stat?: string }) =>
      interactive(row) ||
      recognizeAgentProcessFromCommandLine(row.command, { includeHeadlessOneShot: true }) !== null
    const names = (row: { command: string; stat?: string }, id: string) =>
      commandResumesConversation(row.command, id) && isAgent(row)
    const below = (rootPid: number) => collectDescendantsFromIndex(index, rootPid).filter(isAgent)
    /** Claude's background sessions run below whichever Claude started their service. */
    const ownBelow = (rootPid: number) => {
      const serviced = new Set(
        collectDescendantsFromIndex(index, rootPid)
          .filter((row) => CLAUDE_SERVICE.test(row.command))
          .flatMap((row) => collectDescendantsFromIndex(index, row.pid).map(({ pid }) => pid))
      )
      return below(rootPid).filter((row) => !serviced.has(row.pid))
    }
    return {
      runsAnywhere: (id, except = []) => {
        const apart = new Set(except.flatMap((pid) => ownBelow(pid).map((row) => row.pid)))
        if ([...index.byPid.values()].some((row) => !apart.has(row.pid) && names(row, id))) {
          return true
        }
        const runs = (pid: number, kind: RegExp) => kind.test(index.byPid.get(pid)?.command ?? '')
        return (
          records.some(({ pid, sessionId }) => sessionId === id && runs(pid, /claude/i)) ||
          // Any background session may be the one its unreadable record is of.
          (records.some(({ pid, sessionId }) => sessionId === null && runs(pid, CLAUDE_BACKGROUND))
            ? null
            : false)
        )
      },
      runsBelow: (rootPid, id) => below(rootPid).some((row) => names(row, id)),
      runsAgentBelow: (rootPid) => below(rootPid).length > 0,
      shellAlone: async (rootPid) =>
        below(rootPid).length === 0 && (await confirmRootShellAloneFromProcessTable(rootPid))
    }
  } catch {
    return {
      runsAnywhere: () => null,
      runsBelow: () => false,
      runsAgentBelow: () => null,
      shellAlone: async () => false
    }
  }
}
