import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { HoverCardContent } from '@/components/ui/hover-card'
import { useAppStore } from '@/store'
import NativeChatView from '../native-chat/NativeChatView'
import { parsePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'
import { WORKTREE_NATIVE_CONTEXT_MENU_ATTR } from '../sidebar/workspace-actions/context-menu/worktree-context-menu-policy'
import type { AgentPaneThread } from './activity-thread-types'
import type { ActivityThreadConversation } from './use-activity-thread-conversation'

const SIZE_KEY = 'orca.activityChatPreviewSize'
const DEFAULT_SIZE = { width: 'min(46rem, 62vw)', height: 'min(48rem, 88vh)' }
// The card keeps this much room from the window's top and bottom edges.
const PREVIEW_EDGE_PX = 16

function remPx(rem: number): number {
  return rem * Number.parseFloat(getComputedStyle(document.documentElement).fontSize || '16')
}

/** The card's opening height in px: the remembered one, else the default, within the window. */
function openingHeightPx(size: { height: string }): number {
  const remembered = /^(\d+(?:\.\d+)?)px$/.exec(size.height)
  const height = remembered ? Number(remembered[1]) : Math.min(remPx(48), window.innerHeight * 0.88)
  return Math.min(height, window.innerHeight - 2 * PREVIEW_EDGE_PX)
}

/** Shift the card from its row so it sits centred in the window's height, whichever row it is. */
function alignOffsetForPane(paneKey: string, height: number): number {
  const row = document.querySelector<HTMLElement>(
    `[data-activity-thread-pane-key="${CSS.escape(paneKey)}"]`
  )
  const top = Math.max(PREVIEW_EDGE_PX, (window.innerHeight - height) / 2)
  return row ? top - row.getBoundingClientRect().top : 0
}

// Natural sizes of theme images, so the card can crop one the way the window does.
const imageSizes = new Map<string, Promise<{ width: number; height: number } | null>>()

function themeImageSize(url: string): Promise<{ width: number; height: number } | null> {
  let size = imageSizes.get(url)
  if (!size) {
    size = new Promise((resolve) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => resolve(null)
      image.src = url
    })
    imageSizes.set(url, size)
  }
  return size
}

/** Give the card the window's crop of the theme image (centred, cover or contain) for its place. */
function useThemeImageCrop(contentRef: React.RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const content = contentRef.current
    const root = document.documentElement
    if (!content || root.dataset.themeBackground === undefined) {
      return
    }
    const style = getComputedStyle(root)
    const quoted = /^url\((".*")\)$/.exec(
      style.getPropertyValue('--orca-theme-background-image').trim()
    )
    if (!quoted) {
      return
    }
    const url = JSON.parse(quoted[1]) as string
    const fit = style.getPropertyValue('--orca-theme-background-size').trim()
    let current = true
    let frame = 0
    const apply = (): void => {
      void themeImageSize(url).then((image) => {
        if (!current || !image) {
          return
        }
        const viewWidth = window.innerWidth
        const viewHeight = window.innerHeight
        const scale =
          fit === 'contain'
            ? Math.min(viewWidth / image.width, viewHeight / image.height)
            : fit === 'cover'
              ? Math.max(viewWidth / image.width, viewHeight / image.height)
              : 1
        const width = image.width * scale
        const height = image.height * scale
        const box = content.getBoundingClientRect()
        content.style.setProperty('--activity-preview-bg-size', `${width}px ${height}px`)
        content.style.setProperty(
          '--activity-preview-bg-position',
          `${(viewWidth - width) / 2 - box.left}px ${(viewHeight - height) / 2 - box.top}px`
        )
      })
    }
    // Why: the popover places itself after mount; measure once it has.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(apply)
    })
    const observer = new ResizeObserver(apply)
    observer.observe(content)
    window.addEventListener('resize', apply)
    return () => {
      current = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [contentRef])
}

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
  const [alignOffset] = useState(() => alignOffsetForPane(thread.paneKey, openingHeightPx(size)))
  const contentRef = useRef<HTMLDivElement>(null)
  useThemeImageCrop(contentRef)
  // Why: save the size whenever the reader leaves it changed: after any pointer release (the
  // corner drag) and when the card closes; every hovered chat then opens at that size.
  useEffect(() => {
    const content = contentRef.current
    if (!content) {
      return
    }
    let saved = { width: content.offsetWidth, height: content.offsetHeight }
    const save = (): void => {
      const width = content.offsetWidth
      const height = content.offsetHeight
      if (width === 0 || height === 0 || (width === saved.width && height === saved.height)) {
        return
      }
      saved = { width, height }
      try {
        window.localStorage.setItem(SIZE_KEY, JSON.stringify(saved))
      } catch {
        // A blocked store only means the next card opens at the default size.
      }
    }
    window.addEventListener('pointerup', save, true)
    return () => {
      window.removeEventListener('pointerup', save, true)
      save()
    }
  }, [])
  return (
    <HoverCardContent
      ref={contentRef}
      style={{
        ...size,
        minWidth: '22rem',
        minHeight: '16rem',
        maxWidth: '92vw',
        maxHeight: `calc(100vh - ${2 * PREVIEW_EDGE_PX}px)`
      }}
      side="right"
      align="start"
      sideOffset={8}
      alignOffset={alignOffset}
      // Why: a fixed spot; its height is capped to fit, so nothing has to nudge it.
      avoidCollisions={false}
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
      <div className="relative flex h-full min-h-0 w-full">
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
