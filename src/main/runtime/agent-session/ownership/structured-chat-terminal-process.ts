import { getFreshShellForegroundSnapshot } from '../../../../shared/process-observation/tables/process-table-snapshot-reader'
import {
  collectDescendantsFromIndex,
  getProcessTableIndex
} from '../../../../shared/process-observation/tables/process-table-index'
import {
  confirmRootShellAloneFromProcessTable,
  paneAgentProcess
} from '../../terminal/lifecycle/run-terminal-shell-alone'

/** A terminal's processes, read fresh. `shellAlone` needs proof: the shell has the foreground, and
 *  nothing is stopped behind it (Ctrl-Z) or runs any agent in the background. */
export async function readTerminalProcesses(
  rootPid: number,
  conversationId: string
): Promise<{ shellAlone: boolean; runsConversation: boolean }> {
  try {
    const index = getProcessTableIndex(await getFreshShellForegroundSnapshot())
    const below = collectDescendantsFromIndex(index, rootPid)
    const isAgent = paneAgentProcess()
    return {
      shellAlone:
        !below.some((row) => isAgent(row)) &&
        (await confirmRootShellAloneFromProcessTable(rootPid)),
      runsConversation: below.some((row) => isAgent(row) && row.command.includes(conversationId))
    }
  } catch {
    return { shellAlone: false, runsConversation: false }
  }
}
