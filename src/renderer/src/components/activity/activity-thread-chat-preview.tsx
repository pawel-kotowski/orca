import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { WORKTREE_NATIVE_CONTEXT_MENU_ATTR } from '../sidebar/workspace-actions/context-menu/worktree-context-menu-policy'

// The window's fade, when it opens a chat and when it closes.
export const CROSSFADE_MS = 200

// v2: only the width is the reader's; older saves held a height too and are dropped.
const SIZE_KEY = 'orca.activityChatPreviewSize.v2'
// The card keeps this much room from the window's top and bottom edges.
const PREVIEW_EDGE_PX = 16

/** The card's height in px: the window's, within its edges. */
function openingHeightPx(): number {
  return window.innerHeight - 2 * PREVIEW_EDGE_PX
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
// Null until the reader resizes a card: the card then fills the room right of the list.
function readSavedSize(): { width: string } | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SIZE_KEY) ?? 'null') as {
      width?: unknown
    } | null
    if (typeof saved?.width === 'number') {
      return { width: `${saved.width}px` }
    }
  } catch {
    // Fall through to the full width.
  }
  return null
}

/** The window itself: placed once, fixed to the window, full height, the reader's width. */
export function ActivityChatPreviewFrame({
  anchorPaneKey,
  closing,
  onClose,
  label,
  children
}: {
  anchorPaneKey: string
  closing: boolean
  onClose: () => void
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  const [size] = useState(readSavedSize)
  // Why: placed once and fixed to the window, so scrolling the list or a send that moves the
  // row up never moves the card.
  const [placement] = useState(() => openingPlacement(anchorPaneKey, openingHeightPx()))
  // Why: by default the chat fills the room right of the list, the window's full height.
  const width = size?.width ?? `calc(100vw - ${placement.left + PREVIEW_EDGE_PX}px)`
  // Why: the chat always takes the window's full height; only its width is the reader's to set.
  const height = `calc(100vh - ${2 * PREVIEW_EDGE_PX}px)`
  const contentRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const closingRef = useRef(closing)
  closingRef.current = closing
  // Why: Escape hides the card wherever focus is, and the chat inside never sees it (there it
  // would stop the agent).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing || closingRef.current) {
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      onCloseRef.current()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])
  useThemeImageCrop(contentRef)
  // Why: the browser's corner resizer sends no pointer release to the page, and a closed card is
  // already detached (it measures 0 x 0); but the resizer writes the new size into the inline
  // style, which still reads after close. Save that size if it differs from the opening one.
  useEffect(() => {
    const content = contentRef.current
    if (!content) {
      return
    }
    const openingWidth = content.style.width
    return () => {
      const { width } = content.style
      const widthPx = /^(\d+(?:\.\d+)?)px$/.exec(width)
      if (!widthPx || width === openingWidth) {
        return
      }
      try {
        window.localStorage.setItem(SIZE_KEY, JSON.stringify({ width: Number(widthPx[1]) }))
      } catch {
        // A blocked store only means the next card opens at the default size.
      }
    }
  }, [])
  return createPortal(
    <div
      ref={contentRef}
      role="dialog"
      aria-label={label}
      style={{
        width,
        height,
        left: placement.left,
        top: placement.top,
        minWidth: '22rem',
        minHeight: '16rem',
        maxWidth: `calc(100vw - ${placement.left + PREVIEW_EDGE_PX}px)`,
        maxHeight: `calc(100vh - ${2 * PREVIEW_EDGE_PX}px)`,
        opacity: closing ? 0 : 1,
        pointerEvents: closing ? 'none' : undefined,
        transition: `opacity ${CROSSFADE_MS}ms ease-out`
      }}
      // Why: the reader can drag the corner to set the width; it is remembered (SIZE_KEY).
      className="fixed z-50 resize-x overflow-hidden rounded-lg border border-black/14 shadow-[0_16px_36px_rgba(0,0,0,0.24)] dark:border-white/14 dark:shadow-[0_20px_44px_rgba(0,0,0,0.42)]"
      {...{ [WORKTREE_NATIVE_CONTEXT_MENU_ATTR]: '' }}
      data-activity-thread-chat-preview=""
      data-closing={closing ? '' : undefined}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="relative flex h-full min-h-0 w-full">{children}</div>
    </div>,
    document.body
  )
}
