import { useMemo } from 'react'
import {
  NativeChatForkContext,
  NativeChatForkedFromContext,
  NativeChatForkSlotContext
} from './native-chat-fork-context'
import { NativeChatRewindContext } from './native-chat-rewind-context'
import { useNativeChatTabOwnerWorktreeId } from '../../pane/ownership/use-native-chat-tab-owner'
import { nativeChatTerminalForkAgent } from '../../../../../../shared/native-chat/native-chat-terminal-row-actions'
import type { NativeChatMessage } from '../../../../../../shared/native-chat/native-chat-types'
import type { NativeChatLiveSession } from '../../session/terminal/read/native-chat-live-session-contract'
import {
  useNativeChatTerminalRowActions,
  type NativeChatTerminalRowActionsSource
} from './use-native-chat-terminal-row-actions'
import {
  useNativeChatTerminalForkOrigin,
  withNativeChatTerminalForkDivider
} from './native-chat-terminal-fork-origins'

/** The terminal chat's version of `NativeChatRowActionsProvider`: Fork on responses, "Restart from
 *  here in a new tab" on prompts, and the "Forked from" divider's link back to the source tab. */
export function NativeChatTerminalRowActionsProvider({
  source,
  runtimeEnvironmentId,
  messages,
  children
}: {
  source: NativeChatTerminalRowActionsSource
  runtimeEnvironmentId: string | null
  messages: readonly NativeChatMessage[]
  children: React.ReactNode
}): React.JSX.Element {
  const worktreeId = useNativeChatTabOwnerWorktreeId(source.terminalTabId)
  const actions = useNativeChatTerminalRowActions({
    source,
    worktreeId,
    runtimeEnvironmentId,
    messages
  })
  // Only agents that can fork keep a Fork slot in their responses' actions.
  const keepsForkSlot = nativeChatTerminalForkAgent(source.agent) !== null
  return (
    <NativeChatRewindContext.Provider value={actions.restart}>
      <NativeChatForkContext.Provider value={actions.fork}>
        <NativeChatForkedFromContext.Provider value={actions.openSource}>
          <NativeChatForkSlotContext.Provider value={keepsForkSlot}>
            {children}
          </NativeChatForkSlotContext.Provider>
        </NativeChatForkedFromContext.Provider>
      </NativeChatForkContext.Provider>
    </NativeChatRewindContext.Provider>
  )
}

/** The session with its "Forked from" divider when this chat is a copy this window made. */
export function useNativeChatTerminalForkDivider<T extends Pick<NativeChatLiveSession, 'messages'>>(
  session: T,
  sessionId: string | null
): T {
  const origin = useNativeChatTerminalForkOrigin(sessionId)
  return useMemo(
    () =>
      origin && sessionId
        ? {
            ...session,
            messages: withNativeChatTerminalForkDivider(session.messages, sessionId, origin)
          }
        : session,
    [origin, session, sessionId]
  )
}
