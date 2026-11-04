import { useEffect, useRef, useState } from 'react'
import { HoverCardContent } from '@/components/ui/hover-card'
import { useAppStore } from '@/store'
import NativeChatView from '../native-chat/NativeChatView'
import { parsePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'
import { WORKTREE_NATIVE_CONTEXT_MENU_ATTR } from '../sidebar/workspace-actions/context-menu/worktree-context-menu-policy'
import type { AgentPaneThread } from './activity-thread-types'
import type { ActivityThreadConversation } from './use-activity-thread-conversation'

const SIZE_KEY = 'orca.activityChatPreviewSize'
const DEFAULT_SIZE = { width: 'min(46rem, 62vw)', height: 'min(48rem, 88vh)' }

// The reader's own resize, kept per window; storage can be unavailable, so it is only a convenience.
function readSavedSize(): { width: string; height: string } {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SIZE_KEY) ?? 'null') as {
      width?: unknown
      height?: unknown
    } | null
    if (typeof saved?.width === 'number' && typeof saved.height === 'number') {
      return { width: `${saved.width}px`, height: `${saved.height}px` }
    }
  } catch {
    // Fall through to the default size.
  }
  return DEFAULT_SIZE
}

/**
 * The card's conversation as the chat itself: live, on the chat's canvas, with its message box,
 * so hovering a card shows what the agent is doing and a prompt can go to it from here.
 */
export function ActivityThreadChatPreview({
  thread,
  onClose
}: {
  thread: AgentPaneThread
  conversation: ActivityThreadConversation
  onClose: () => void
}): React.JSX.Element {
  const leafId = parsePaneKey(thread.paneKey)?.leafId ?? null
  // Why: the composer sends to the pane's live PTY, which the card finds in the tab's layout.
  const ptyId = useAppStore(
    (state) =>
      (leafId
        ? state.terminalLayoutsByTabId[thread.tab.id]?.ptyIdsByLeafId?.[leafId]
        : undefined) ??
      state.ptyIdsByTabId[thread.tab.id]?.[0] ??
      null
  )
  const [size] = useState(readSavedSize)
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const content = contentRef.current
    if (!content) {
      return
    }
    let initial = true
    const observer = new ResizeObserver(() => {
      // Why: the first report is the opening size, not the reader's resize.
      if (initial) {
        initial = false
        return
      }
      try {
        window.localStorage.setItem(
          SIZE_KEY,
          JSON.stringify({ width: content.offsetWidth, height: content.offsetHeight })
        )
      } catch {
        // A blocked store only means the next card opens at the default size.
      }
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])
  return (
    <HoverCardContent
      ref={contentRef}
      style={{
        ...size,
        minWidth: '22rem',
        minHeight: '16rem',
        maxWidth: '92vw',
        maxHeight: '94vh'
      }}
      side="right"
      align="start"
      sideOffset={8}
      // Why: the reader can drag the corner; the size is remembered (SIZE_KEY).
      className="resize overflow-hidden p-0"
      {...{ [WORKTREE_NATIVE_CONTEXT_MENU_ATTR]: '' }}
      data-activity-thread-chat-preview=""
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          onClose()
        }
      }}
    >
      <div className="relative flex h-full min-h-0 w-full bg-chat-canvas">
        <NativeChatView
          terminalTabId={thread.tab.id}
          paneKey={thread.paneKey}
          isVisible
          isFocusedGroup
          targetPtyId={ptyId}
          launchAgent={thread.tab.launchAgent ?? null}
          resolvedAgent={null}
          ownsTabWideLaunchDraft={false}
        />
      </div>
    </HoverCardContent>
  )
}
