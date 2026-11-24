import { getFreshShellForegroundSnapshot } from '../../../../shared/process-observation/tables/process-table-snapshot-reader'
import {
  collectDescendantsFromIndex,
  getProcessTableIndex
} from '../../../../shared/process-observation/tables/process-table-index'
import { isConversationCopyCommand } from './structured-chat-copy-command'
import {
  confirmRootShellAloneFromProcessTable,
  paneAgentProcess
} from '../../terminal/lifecycle/run-terminal-shell-alone'

export type TerminalProcesses = {
  /** An agent process on this machine, wherever it runs (a detached tmux too), has the conversation
   *  in its command line; null when the processes could not be read. `except`: terminals whose agent
   *  is known to have moved on to another. */
  runsAnywhere: (conversationId: string, except?: readonly number[]) => boolean | null
  runsBelow: (rootPid: number, conversationId: string) => boolean
  runsAgentBelow: (rootPid: number) => boolean | null
  /** Proven: the shell has the foreground, and nothing is stopped behind it (Ctrl-Z) or runs any
   *  agent in the background. */
  shellAlone: (rootPid: number) => Promise<boolean>
}

/** This machine's processes, read once for everything that looks at them now. */
export async function readTerminalProcesses(): Promise<TerminalProcesses> {
  try {
    const index = getProcessTableIndex(await getFreshShellForegroundSnapshot())
    const isAgent = paneAgentProcess()
    const names = (row: { command: string; stat?: string }, id: string) =>
      row.command.includes(id) && !isConversationCopyCommand(row.command) && isAgent(row)
    const below = (rootPid: number) => collectDescendantsFromIndex(index, rootPid).filter(isAgent)
    return {
      runsAnywhere: (id, except = []) => {
        const apart = new Set(except.flatMap((pid) => below(pid).map((row) => row.pid)))
        return [...index.byPid.values()].some((row) => !apart.has(row.pid) && names(row, id))
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
