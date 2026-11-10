import { useMemo, type ComponentProps } from 'react'
import { useAppStore } from '@/store'
import { createNativeChatRuntimeSelector } from './native-chat-runtime-owner'
import { NativeChatMessageList } from './NativeChatMessageList'
import { NativeChatTerminalVisualOwner } from './NativeChatTerminalVisualOwner'
import { useNativeChatClaudeSubagents } from './use-native-chat-claude-subagents'

type Source = {
  agent: string
  sessionId: string | null
  transcriptPath: string | null | undefined
  paneKey: string
  terminalTabId: string
}

/**
 * A terminal-backed chat's transcript with what structured chats draw beside the conversation:
 * Claude's own subagents in their sections, and inline HTML visuals.
 */
export function NativeChatTerminalMessageList({
  source,
  session,
  expandSignal = false,
  ...listProps
}: { source: Source } & Omit<ComponentProps<typeof NativeChatMessageList>, 'expandSignal'> & {
    expandSignal?: boolean
  }): React.JSX.Element {
  // Why the pane's own runtime owner: reads go to the host that runs the agent, as the chat's do.
  const selectOwner = useMemo(
    () => createNativeChatRuntimeSelector(source.terminalTabId),
    [source.terminalTabId]
  )
  const runtimeEnvironmentId = useAppStore(selectOwner)
  const listSession = useNativeChatClaudeSubagents(session, {
    ...source,
    runtimeEnvironmentId,
    isVisible: listProps.isVisible !== false
  })
  return (
    <NativeChatTerminalVisualOwner
      runtimeEnvironmentId={runtimeEnvironmentId}
      terminalTabId={source.terminalTabId}
    >
      <NativeChatMessageList session={listSession} expandSignal={expandSignal} {...listProps} />
    </NativeChatTerminalVisualOwner>
  )
}
