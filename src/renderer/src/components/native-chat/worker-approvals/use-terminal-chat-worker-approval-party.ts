import { useTerminalCrewIdentity } from '../../orchestration-crew/use-terminal-crew-identity'
import { useNativeChatTabOwnerWorktreeId } from '../pane/ownership/use-native-chat-tab-owner'
import { useNativeChatPanePtyId } from '../usage/terminal/use-native-chat-terminal-usage-limit-continue'
import { isWorkerApprovalsTerminalParty } from '../../../../../shared/orchestration/worker-approvals-party'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'

/** The terminal chat's address its workers report to: its terminal handle on this machine.
 *  A pane on another host has none here (v1, as structured chats: the feed is local). */
export function terminalChatWorkerApprovalParty(
  target: RuntimeClientTarget | null,
  party: string | null
): string | null {
  return target?.kind === 'local' && party !== null && isWorkerApprovalsTerminalParty(party)
    ? party
    : null
}

/** A terminal-backed chat's worker-approval party, resolved from the PTY its pane holds now. */
export function useTerminalChatWorkerApprovalParty(
  terminalTabId: string,
  paneKey: string
): string | null {
  const worktreeId = useNativeChatTabOwnerWorktreeId(terminalTabId)
  const ptyId = useNativeChatPanePtyId(paneKey, terminalTabId)
  const { target, party } = useTerminalCrewIdentity(paneKey, ptyId, worktreeId)
  return terminalChatWorkerApprovalParty(target, party)
}
