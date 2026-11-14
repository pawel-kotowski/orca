import { useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { TranslationScopeProvider } from '@/i18n/translation-scope-provider'
import { useAppStore } from '@/store/index'
import { stripKey, TourCaptionStrip, type StripRect } from './TourCaptionStrip'
import {
  pauseAllTours,
  playingTours,
  subscribeTours,
  toursVersion,
  type PlayingTour
} from './tour-player'

const GAP_PX = 6
// Why: the strip may grow over the transcript but never up into the chat's header.
const HEADER_ROOM_PX = 72

/** The chat's message box for the tour's owner tab, in the terminal chat view or the structured chat. */
function ownerComposer(tour: PlayingTour): HTMLElement | null {
  const state = useAppStore.getState()
  const { worktreeId, ownerTabId } = tour.context
  if (state.activeWorktreeId !== worktreeId || !ownerTabId) {
    return null
  }
  const owner = state.unifiedTabsByWorktree[worktreeId]?.find(
    (tab) => tab.id === ownerTabId || tab.entityId === ownerTabId
  )
  if (!owner) {
    return null
  }
  // Why the scope: the terminal chat view renders in an overlay outside the tab's group body.
  const scopes = [owner.id, owner.entityId]
  for (const element of document.querySelectorAll<HTMLElement>(
    '[data-native-chat-composer-scope]'
  )) {
    const scope = element.dataset.nativeChatComposerScope ?? ''
    // Terminal chat view: `<tab id>:<pane>`; structured chat: `agent-session:<session id>`.
    const parts = scope.split(':')
    if (scopes.some((id) => parts.includes(id))) {
      const column = element.querySelector<HTMLElement>('[data-native-chat-composer-column]')
      if (column && column.getBoundingClientRect().width > 0) {
        return column
      }
    }
  }
  return null
}

/** Just above the chat's message box, as wide as it: the words sit where the user reads the agent. */
export function tourStripRect(tour: PlayingTour): StripRect | null {
  const composer = ownerComposer(tour)?.getBoundingClientRect()
  if (!composer) {
    return null
  }
  return {
    left: composer.left,
    bottom: window.innerHeight - composer.top + GAP_PX,
    width: composer.width,
    maxHeight: Math.max(96, composer.top - GAP_PX - HEADER_ROOM_PX)
  }
}

/** The drawn strip's height, so the transcript under it leaves exactly that much room. */
function stripHeight(tour: PlayingTour): number {
  const key = CSS.escape(stripKey(tour))
  return (
    document.querySelector<HTMLElement>(`[data-orca-tour-strip][data-tour-key="${key}"]`)
      ?.offsetHeight ?? 0
  )
}

/** The nearest element holding both the message box and its transcript, in either chat view. */
function chatAround(composer: HTMLElement | null): HTMLElement | null {
  for (let element = composer?.parentElement; element; element = element.parentElement) {
    if (element.querySelector('[data-native-chat-scroll]')) {
      return element
    }
  }
  return null
}

/** Leaves room under the newest message for the strip in the chats a tour plays beside. */
function markChatsWithTours(tours: PlayingTour[]): void {
  const rooms = new Map<HTMLElement, number>()
  for (const tour of tours) {
    const root = chatAround(ownerComposer(tour))
    if (root) {
      rooms.set(root, stripHeight(tour))
    }
  }
  for (const element of document.querySelectorAll<HTMLElement>('[data-orca-tour-room]')) {
    if (!rooms.has(element)) {
      element.removeAttribute('data-orca-tour-room')
      element.style.removeProperty('--orca-tour-room')
    }
  }
  for (const [root, height] of rooms) {
    const room = `${height + 2 * GAP_PX}px`
    if (
      root.hasAttribute('data-orca-tour-room') &&
      root.style.getPropertyValue('--orca-tour-room') === room
    ) {
      continue
    }
    // Why: a chat read to its end stays at its end when the strip grows, so no row hides under it.
    const scroller = root.querySelector<HTMLElement>('[data-native-chat-scroll]')
    const atEnd =
      !!scroller && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48
    root.setAttribute('data-orca-tour-room', '')
    root.style.setProperty('--orca-tour-room', room)
    if (scroller && atEnd) {
      scroller.scrollTop = scroller.scrollHeight
    }
  }
}

// Why the scroller's box and not its padding: the chat keeps its newest row at the box's bottom
// edge itself, so a shorter box puts that row above the strip with no scrolling of ours.
const TRANSCRIPT_ROOM_RULE =
  '[data-orca-tour-room] div:has(> [data-native-chat-scroll]) { padding-bottom: var(--orca-tour-room, 144px); }'

function TourStrips(): React.JSX.Element {
  // Why both: the version re-renders on any tour change; the tick re-measures when the chat moves.
  const version = useSyncExternalStore(subscribeTours, toursVersion)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const remeasure = (): void => setTick((n) => n + 1)
    const unsubscribe = useAppStore.subscribe(remeasure)
    const timer = setInterval(remeasure, 400)
    window.addEventListener('resize', remeasure)
    return () => {
      unsubscribe()
      clearInterval(timer)
      window.removeEventListener('resize', remeasure)
    }
  }, [])
  useEffect(() => {
    // Why: a click into the code or a key in the chat means the user took over from auto-play.
    const takeOver = (event: Event): void => {
      const target = event.target as Element | null
      if (!target?.closest?.('[data-orca-tour-strip]')) {
        pauseAllTours()
      }
    }
    window.addEventListener('pointerdown', takeOver, true)
    window.addEventListener('keydown', takeOver, true)
    return () => {
      window.removeEventListener('pointerdown', takeOver, true)
      window.removeEventListener('keydown', takeOver, true)
    }
  }, [])
  useEffect(() => markChatsWithTours(playingTours()), [version, tick])
  const strips = playingTours().flatMap((tour) => {
    const rect = tourStripRect(tour)
    return rect ? [{ tour, rect }] : []
  })
  return (
    <>
      <style>{TRANSCRIPT_ROOM_RULE}</style>
      {strips.map(({ tour, rect }) => (
        <TourCaptionStrip
          key={`${tour.context.worktreeId}:${tour.context.ownerTabId}`}
          tour={tour}
          index={tour.index}
          playing={tour.playing}
          advanceAt={tour.advanceAt}
          rect={rect}
          version={version + tick}
        />
      ))}
    </>
  )
}

let mounted = false

/** Mounts the strips once, outside the app shell, the first time a tour plays. */
export function ensureTourStrips(): void {
  if (mounted) {
    return
  }
  mounted = true
  const host = document.createElement('div')
  host.setAttribute('data-orca-tour-strips', '')
  document.body.appendChild(host)
  createRoot(host).render(
    <TranslationScopeProvider>
      <TourStrips />
    </TranslationScopeProvider>
  )
}
