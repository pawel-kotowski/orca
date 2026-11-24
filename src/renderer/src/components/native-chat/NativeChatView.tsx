import { BotChatRoom } from '../bots/use-bot-chat-composer-room'
import { NativeChatSessionGate } from './host-access/NativeChatSessionGate'
import { NativeChatTerminalBridgeProvider } from './native-chat-terminal-bridge'
import { NativeChatStructuredSession } from './NativeChatStructuredSession'
import { NativeChatResolvedView } from './NativeChatResolvedView'
import { useNativeChatStatusEntry } from './session/status/use-native-chat-status-entry'
import type { NativeChatViewProps } from './native-chat-view-types'
import { NativeChatPaneFileDropSurface } from './attachments/intake/NativeChatPaneFileDropSurface'
import { NativeChatWorkersProvider } from './native-chat-workers-context'
import {
  NativeChatAccountScopeProvider,
  NativeChatStructuredAccountScopeProvider
} from './native-chat-account-scope'
import { NativeChatTabTranscriptScope } from './native-chat-transcript-scope'

export type { NativeChatViewProps } from './native-chat-view-types'

export default function NativeChatView(props: NativeChatViewProps): React.JSX.Element {
  return (
    <NativeChatPaneFileDropSurface className="relative flex h-full min-h-0 min-w-0 w-full">
      {props.mode === 'structured' ? (
        <NativeChatTabTranscriptScope
          key={props.sessionId}
          tabId={props.tabId}
          isVisible={props.isVisible}
          sessionId={props.sessionId}
          target={props.target}
        >
          <NativeChatWorkersProvider
            target={props.target}
            sessionId={props.sessionId}
            visible={props.isVisible}
          >
            <BotChatRoom tabId={props.tabId} sessionId={props.sessionId}>
              <NativeChatStructuredAccountScopeProvider chat={props}>
                <NativeChatStructuredSession {...props} />
              </NativeChatStructuredAccountScopeProvider>
            </BotChatRoom>
          </NativeChatWorkersProvider>
        </NativeChatTabTranscriptScope>
      ) : (
        <NativeChatBridgeView {...props} />
      )}
    </NativeChatPaneFileDropSurface>
  )
}

function NativeChatBridgeView({
  terminalTabId,
  isVisible,
  isFocusedGroup,
  paneKey: preferredPaneKey,
  targetPtyId = null,
  launchAgent,
  resolvedAgent,
  ownsTabWideLaunchDraft,
  onSwitchToTerminal,
  readTerminalDraft,
  readTerminalScreen,
  contextMenuActions
}: Exclude<NativeChatViewProps, { mode: 'structured' }>): React.JSX.Element {
  const {
    entry: agentStatusEntry,
    paneKey,
    sleepingSession
  } = useNativeChatStatusEntry(terminalTabId, preferredPaneKey)
  return (
    <NativeChatSessionGate
      paneKey={paneKey}
      launchAgent={launchAgent}
      resolvedAgent={resolvedAgent}
      agentStatusEntry={agentStatusEntry}
      sleepingSession={sleepingSession}
      ptyId={targetPtyId}
    >
      {(resolution) => (
        <NativeChatAccountScopeProvider
          agent={resolution.agent}
          transcriptPath={resolution.transcriptPath}
          terminalTabId={terminalTabId}
        >
          <NativeChatTerminalBridgeProvider
            readScreen={readTerminalScreen}
            show={onSwitchToTerminal}
          >
            <NativeChatTabTranscriptScope
              sessionId={resolution.sessionId}
              tabId={terminalTabId}
              isVisible={isVisible}
            >
              <NativeChatResolvedView
                paneKey={resolution.paneKey}
                agent={resolution.agent}
                sessionId={resolution.sessionId}
                transcriptPath={resolution.transcriptPath}
                isVisible={isVisible}
                isFocusedGroup={isFocusedGroup}
                targetPtyId={targetPtyId}
                terminalTabId={terminalTabId}
                ownsTabWideLaunchDraft={ownsTabWideLaunchDraft}
                onSwitchToTerminal={onSwitchToTerminal}
                readTerminalDraft={readTerminalDraft}
                readTerminalScreen={readTerminalScreen}
                contextMenuActions={contextMenuActions}
              />
            </NativeChatTabTranscriptScope>
          </NativeChatTerminalBridgeProvider>
        </NativeChatAccountScopeProvider>
      )}
    </NativeChatSessionGate>
  )
}
