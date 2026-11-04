import { HoverCardContent } from '@/components/ui/hover-card'
import { cn } from '@/lib/utils'
import { NativeChatMessageList } from '../native-chat/NativeChatMessageList'
import { NATIVE_CHAT_APPEARANCE_ROOT_CLASS } from '../native-chat/native-chat-appearance-style'
import { useNativeChatStoreAppearanceStyle } from '../native-chat/use-native-chat-store-appearance-style'
import { useNativeChatTerminalTurnTiming } from '../native-chat/use-native-chat-terminal-turn-timing'
import { NativeChatFileLinkExistenceProvider } from '../native-chat/use-native-chat-file-link-existence'
import { NativeChatMarkdownImageOwnerProvider } from '../native-chat/native-chat-markdown-image-owner'
import { WORKTREE_NATIVE_CONTEXT_MENU_ATTR } from '../sidebar/workspace-actions/context-menu/worktree-context-menu-policy'
import type { AgentPaneThread } from './activity-thread-types'
import type { ActivityThreadConversation } from './use-activity-thread-conversation'

/**
 * The card's conversation as the chat shows it, live and read-only: the transcript without a
 * message box, so hovering a card shows what the agent is doing right now.
 */
export function ActivityThreadChatPreview({
  thread,
  conversation
}: {
  thread: AgentPaneThread
  conversation: ActivityThreadConversation
}): React.JSX.Element {
  const appearanceStyle = useNativeChatStoreAppearanceStyle()
  const turnTiming = useNativeChatTerminalTurnTiming(
    conversation.paneKey,
    conversation.session.messages,
    conversation.working
  )
  return (
    <HoverCardContent
      side="right"
      align="start"
      sideOffset={8}
      className="h-[min(36rem,80vh)] w-[min(32rem,60vw)] overflow-hidden p-0"
      {...{ [WORKTREE_NATIVE_CONTEXT_MENU_ATTR]: '' }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <NativeChatFileLinkExistenceProvider tabId={thread.tab.id}>
        <NativeChatMarkdownImageOwnerProvider
          tabId={thread.tab.id}
          isVisible
          sessionId={conversation.sessionId}
        >
          <div
            data-native-chat-root="true"
            data-native-chat-preview="true"
            data-native-chat-working={conversation.working ? 'true' : 'false'}
            // Why: the chat's own canvas, so the preview looks like the chat it shows.
            className={cn(
              NATIVE_CHAT_APPEARANCE_ROOT_CLASS,
              'flex h-full min-h-0 w-full flex-col bg-chat-canvas'
            )}
            style={appearanceStyle}
            data-native-chat-scheme={appearanceStyle.colorScheme}
          >
            <NativeChatMessageList
              session={conversation.session}
              isVisible
              isWorking={conversation.working}
              expandSignal={false}
              {...turnTiming}
            />
          </div>
        </NativeChatMarkdownImageOwnerProvider>
      </NativeChatFileLinkExistenceProvider>
    </HoverCardContent>
  )
}
