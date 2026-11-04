import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

/** Where the card opens: just right of its row's column, centred in the window's height. */
function openingPlacement(paneKey: string, height: number): { left: number; top: number } {
  const row = document.querySelector<HTMLElement>(
    `[data-activity-thread-pane-key="${CSS.escape(paneKey)}"]`
  )
  const left = row ? row.getBoundingClientRect().right + 8 : PREVIEW_EDGE_PX
  return { left, top: Math.max(PREVIEW_EDGE_PX, (window.innerHeight - height) / 2) }
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
  onClose,
  onShowTerminal
}: {
  thread: AgentPaneThread
  conversation: ActivityThreadConversation
  onClose: () => void
  /** The chat's terminal switch: open the agent's own terminal. */
  onShowTerminal: () => void
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
  // Why: placed once and fixed to the window, so scrolling the list or a send that moves the
  // row up never moves the card.
  const [placement] = useState(() => openingPlacement(thread.paneKey, openingHeightPx(size)))
  const contentRef = useRef<HTMLDivElement>(null)
  // Why: Escape hides the card wherever focus is, and the chat inside never sees it (there it
  // would stop the agent).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) {
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])
  useThemeImageCrop(contentRef)
  // Why: the browser's corner resizer sends no pointer release to the page, and a closed card is
  // already detached (it measures 0 x 0); but the resizer writes the new size into the inline
  // style, which still reads after close. Save that size if it differs from the opening one.
  useEffect(() => {
    const content = contentRef.current
    if (!content) {
      return
    }
    const opening = { width: content.style.width, height: content.style.height }
    return () => {
      const { width, height } = content.style
      const widthPx = /^(\d+(?:\.\d+)?)px$/.exec(width)
      const heightPx = /^(\d+(?:\.\d+)?)px$/.exec(height)
      if (!widthPx || !heightPx || (width === opening.width && height === opening.height)) {
        return
      }
      try {
        window.localStorage.setItem(
          SIZE_KEY,
          JSON.stringify({ width: Number(widthPx[1]), height: Number(heightPx[1]) })
        )
      } catch {
        // A blocked store only means the next card opens at the default size.
      }
    }
  }, [])
  return createPortal(
    <div
      ref={contentRef}
      role="dialog"
      aria-label={thread.paneTitle || 'Chat'}
      style={{
        ...size,
        left: placement.left,
        top: placement.top,
        minWidth: '22rem',
        minHeight: '16rem',
        maxWidth: `calc(100vw - ${placement.left + PREVIEW_EDGE_PX}px)`,
        maxHeight: `calc(100vh - ${2 * PREVIEW_EDGE_PX}px)`
      }}
      // Why: the reader can drag the corner; the size is remembered (SIZE_KEY).
      className="fixed z-50 resize overflow-hidden rounded-lg border border-black/14 shadow-[0_16px_36px_rgba(0,0,0,0.24)] dark:border-white/14 dark:shadow-[0_20px_44px_rgba(0,0,0,0.42)]"
      {...{ [WORKTREE_NATIVE_CONTEXT_MENU_ATTR]: '' }}
      data-activity-thread-chat-preview=""
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
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
          onSwitchToTerminal={onShowTerminal}
        />
      </div>
    </div>,
    document.body
  )
}
