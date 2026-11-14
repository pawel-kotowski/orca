import { useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { TranslationScopeProvider } from '@/i18n/translation-scope-provider'
import { useAppStore } from '@/store/index'
import { TourCaptionStrip, type StripRect } from './TourCaptionStrip'
import {
  pauseAllTours,
  playingTours,
  subscribeTours,
  toursVersion,
  type PlayingTour
} from './tour-player'

// Why: the strip grows with its caption (up to four lines); the transcript keeps room for the tallest.
const MAX_STRIP_PX = 132
const GAP_PX = 6

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
    width: composer.width
  }
}

/** Leaves room under the newest message for the strip in the chats a tour plays beside. */
function markChatsWithTours(tours: PlayingTour[]): void {
  const roots = new Set(
    tours.flatMap((tour) => {
      const root = ownerComposer(tour)?.closest<HTMLElement>('[data-native-chat-root]')
      return root ? [root] : []
    })
  )
  for (const element of document.querySelectorAll<HTMLElement>('[data-orca-tour-room]')) {
    if (!roots.has(element)) {
      element.removeAttribute('data-orca-tour-room')
    }
  }
  for (const root of roots) {
    root.setAttribute('data-orca-tour-room', '')
  }
}

const TRANSCRIPT_ROOM_RULE = `[data-orca-tour-room] [data-native-chat-scroll] { padding-bottom: ${MAX_STRIP_PX + 2 * GAP_PX}px !important; }`

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
