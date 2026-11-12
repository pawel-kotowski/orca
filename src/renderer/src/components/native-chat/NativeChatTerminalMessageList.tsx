import { useMemo, type ComponentProps } from 'react'
import { useAppStore } from '@/store'
import { createNativeChatRuntimeSelector } from './pane/ownership/native-chat-runtime-owner'
import { NativeChatMessageList } from './NativeChatMessageList'
import { NativeChatTerminalVisualOwner } from './NativeChatTerminalVisualOwner'
import { NativeChatTerminalPromptRow } from './NativeChatTerminalPromptRow'
import { useNativeChatClaudeSubagents } from './use-native-chat-claude-subagents'

// One element for every render: the row reads its terminal through context.
const TERMINAL_PROMPT_ROW = <NativeChatTerminalPromptRow />

type Source = {
  agent: string
  sessionId: string | null
  transcriptPath: string | null | undefined
  paneKey: string
  terminalTabId: string
}

/**
 * A terminal-backed chat's transcript with what structured chats draw beside the conversation:
 * Claude's own subagents in their sections, inline HTML visuals, and a prompt only the terminal
 * shows, read from its screen.
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
      <NativeChatMessageList
        session={listSession}
        expandSignal={expandSignal}
        // Why: a wait with no card names nothing; show the terminal's own prompt instead.
        awaitingInputRow={TERMINAL_PROMPT_ROW}
        {...listProps}
      />
    </NativeChatTerminalVisualOwner>
  )
}
