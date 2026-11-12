import { useMemo, type ComponentProps, type RefObject } from 'react'
import { useAppStore } from '@/store'
import { createNativeChatRuntimeSelector } from './pane/ownership/native-chat-runtime-owner'
import { NativeChatMessageList } from './NativeChatMessageList'
import { NativeChatTerminalVisualOwner } from './NativeChatTerminalVisualOwner'
import { NativeChatTerminalPromptRow } from './NativeChatTerminalPromptRow'
import { useNativeChatClaudeSubagents } from './use-native-chat-claude-subagents'
import {
  NativeChatTerminalRowActionsProvider,
  useNativeChatTerminalForkDivider
} from './messages/actions/NativeChatTerminalRowActionsProvider'
import { NativeChatContextClearFade } from './conversation/projection/NativeChatContextClearFade'
import { useNativeChatTerminalClearFade } from './conversation/projection/use-native-chat-terminal-clear-fade'
import { NativeChatTerminalUsageLimitProvider } from './usage/terminal/NativeChatTerminalUsageLimitProvider'
import type { NativeChatComposerHandle } from './composer/native-chat-composer-types'
import { useNativeChatWorkerApprovalTimedRows } from './worker-approvals/NativeChatWorkerApprovals'
import { useTerminalChatWorkerApprovalParty } from './worker-approvals/use-terminal-chat-worker-approval-party'

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
  stopRequested = false,
  composerRef,
  handOff,
  ...listProps
}: { source: Source } & Omit<ComponentProps<typeof NativeChatMessageList>, 'expandSignal'> & {
    expandSignal?: boolean
    /** The person pressed Stop on the live turn (the view hides its working state at once). */
    stopRequested?: boolean
    /** The composer whose send the usage-limit row's Continue types through. */
    composerRef?: RefObject<NativeChatComposerHandle | null>
    /** The pane's own Hand Off to Another Agent (its right-click item), offered on a usage-limit row. */
    handOff?: () => void
  }): React.JSX.Element {
  // Why the pane's own runtime owner: reads go to the host that runs the agent, as the chat's do.
  const selectOwner = useMemo(
    () => createNativeChatRuntimeSelector(source.terminalTabId),
    [source.terminalTabId]
  )
  const runtimeEnvironmentId = useAppStore(selectOwner)
  // Workers' answered prompts, in the transcript where each asked, as in structured chats.
  const approvalParty = useTerminalChatWorkerApprovalParty(source.terminalTabId, source.paneKey)
  const workerApprovalRows = useNativeChatWorkerApprovalTimedRows(approvalParty)
  // A /clear keeps the old conversation fading out until the agent has cleared it.
  const clearFade = useNativeChatTerminalClearFade(source, session)
  const listSession = useNativeChatTerminalForkDivider(
    useNativeChatClaudeSubagents(clearFade.session, {
      ...source,
      runtimeEnvironmentId,
      isVisible: listProps.isVisible !== false
    }),
    source.sessionId
  )
  // Why: until the hook says the turn ended, its tail line reads "Stopping…", as structured chats'.
  const stopping = stopRequested && (session.hookWorking ?? session.status === 'working')
  return (
    <NativeChatContextClearFade clearing={clearFade.clearing}>
      <NativeChatTerminalVisualOwner
        runtimeEnvironmentId={runtimeEnvironmentId}
        terminalTabId={source.terminalTabId}
      >
        <NativeChatTerminalRowActionsProvider
          source={source}
          runtimeEnvironmentId={runtimeEnvironmentId}
          messages={session.messages}
        >
          <NativeChatTerminalUsageLimitProvider
            paneKey={source.paneKey}
            terminalTabId={source.terminalTabId}
            agent={source.agent}
            transcriptPath={source.transcriptPath ?? null}
            messages={session.messages}
            isWorking={listProps.isWorking === true}
            composerRef={composerRef}
            handOff={handOff}
          >
            <NativeChatMessageList
              // A landed /clear starts the list over, as the structured chat's does.
              key={clearFade.generation}
              session={listSession}
              expandSignal={expandSignal}
              // Why: a wait with no card names nothing; show the terminal's own prompt instead.
              awaitingInputRow={TERMINAL_PROMPT_ROW}
              {...listProps}
              isWorking={listProps.isWorking || stopping}
              stopping={stopping}
              timedRows={workerApprovalRows}
            />
          </NativeChatTerminalUsageLimitProvider>
        </NativeChatTerminalRowActionsProvider>
      </NativeChatTerminalVisualOwner>
    </NativeChatContextClearFade>
  )
}
