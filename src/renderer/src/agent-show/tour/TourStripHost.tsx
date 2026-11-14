import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { TranslationScopeProvider } from '@/i18n/translation-scope-provider'
import { useAppStore } from '@/store/index'
import type { AppState } from '@/store/types'
import { worktreeDrawn, windowShown } from '../window-drawn'
import { TourCaptionStrip } from './TourCaptionStrip'
import { TourAwayPill } from './TourAwayPill'
import { stripAndPills, tourStripSize } from './tour-strip-placement'
import { dockBox } from './tour-strip-spot'
import { subscribeTourStripSpot, tourStripSpot } from './tour-strip-spot-store'
import { useTourDockDrag } from './use-tour-dock-drag'
import {
  pauseAllTours,
  playingTours,
  subscribeTours,
  toursVersion,
  type PlayingTour
} from './tour-player'

type Size = { width: number; height: number }

// Why 48: over the floating workspace (45, its launcher 46) and toasts (47), under modals (50).
const DOCK_LAYER = 'z-[48]'

/** The strip is drawn while the window is and the tour's workspace is the one on screen. */
export function tourStripShown(tour: PlayingTour): boolean {
  return windowShown() && worktreeDrawn(useAppStore.getState(), tour.context.worktreeId)
}

/** Which tours' workspaces are on screen, as a string so the selector stays stable between renders. */
const drawnKey = (state: AppState): string =>
  playingTours()
    .map((tour) => (worktreeDrawn(state, tour.context.worktreeId) ? '1' : '0'))
    .join('')

function useWindowSize(): Size {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  useEffect(() => {
    const onResize = (): void => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

/** An element's drawn size; the first measure lands before paint, so the dock never flashes elsewhere. */
function useDrawnSize(): [(element: HTMLElement | null) => void, Size] {
  const observer = useRef<ResizeObserver | null>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  useEffect(() => () => observer.current?.disconnect(), [])
  const ref = useCallback((element: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    const update = (): void => {
      const width = element?.offsetWidth ?? 0
      const height = element?.offsetHeight ?? 0
      setSize((was) => (was.width === width && was.height === height ? was : { width, height }))
    }
    update()
    if (element) {
      observer.current = new ResizeObserver(update)
      observer.current.observe(element)
    }
  }, [])
  return [ref, size]
}

function TourStrips(): React.JSX.Element | null {
  const version = useSyncExternalStore(subscribeTours, toursVersion)
  const spot = useSyncExternalStore(subscribeTourStripSpot, tourStripSpot)
  const drawn = useAppStore(drawnKey)
  const size = useWindowSize()
  const [dockRef, dock] = useDrawnSize()
  useEffect(() => {
    // Why: a click into the code or a key in the chat means the user took over from auto-play.
    const takeOver = (event: Event): void => {
      const target = event.target as Element | null
      if (!target?.closest?.('[data-orca-tour-strip],[data-orca-tour-pill]')) {
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
  const tours = playingTours()
  const { strip: stripTour, pills: away } = stripAndPills(
    tours,
    (tour) => drawn[tours.indexOf(tour)] === '1'
  )
  const box = dockBox(spot, dock, size, stripTour !== undefined)
  const { dragBox, handle } = useTourDockDrag(box, dock, size)
  const at = dragBox ?? box
  if (!stripTour && away.length === 0) {
    return null
  }
  return (
    <div
      ref={dockRef}
      data-orca-tour-dock=""
      className={`pointer-events-none fixed ${DOCK_LAYER} flex max-w-[calc(100vw-8px)] flex-col items-center gap-2`}
      // Why no-drag: Electron's titlebar drag ignores z-index, so a dock moved up there must opt out.
      style={{ left: at.left, top: at.top, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {away.map((tour) => (
        <TourAwayPill
          key={`${tour.context.worktreeId}:${tour.context.ownerTabId}`}
          tour={tour}
          handle={handle}
        />
      ))}
      {stripTour ? (
        <TourCaptionStrip
          key={`${stripTour.context.worktreeId}:${stripTour.context.ownerTabId}`}
          tour={stripTour}
          index={stripTour.index}
          playing={stripTour.playing}
          advanceAt={stripTour.advanceAt}
          warning={stripTour.warnings[stripTour.index] ?? null}
          size={tourStripSize(size)}
          version={version}
          handle={handle}
        />
      ) : null}
    </div>
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
