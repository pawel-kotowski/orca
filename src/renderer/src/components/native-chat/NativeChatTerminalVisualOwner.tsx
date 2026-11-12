import { useMemo, type ReactNode } from 'react'
import { TERMINAL_CHATS_VISUAL_SESSION_ID } from '../../../../shared/native-chat/native-chat-visual-directive'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { NativeChatVisualOwnerProvider } from './media/visuals/native-chat-visual-owner'

/**
 * Inline HTML visuals in a terminal-backed chat (Paweł, 2026-11-10: the terminal Chat UI should
 * show HTML as structured chats do): its pages are read from the pane's host's shared terminal
 * chats folder, where terminal Claude's visuals skill saves them.
 */
export function NativeChatTerminalVisualOwner({
  runtimeEnvironmentId,
  terminalTabId,
  children
}: {
  runtimeEnvironmentId: string | null
  terminalTabId: string
  children: ReactNode
}): React.JSX.Element {
  const target = useMemo<RuntimeClientTarget>(
    () =>
      runtimeEnvironmentId
        ? { kind: 'environment', environmentId: runtimeEnvironmentId }
        : { kind: 'local' },
    [runtimeEnvironmentId]
  )
  return (
    <NativeChatVisualOwnerProvider
      target={target}
      sessionId={TERMINAL_CHATS_VISUAL_SESSION_ID}
      tabId={terminalTabId}
    >
      {children}
    </NativeChatVisualOwnerProvider>
  )
}
