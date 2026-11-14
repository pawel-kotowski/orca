import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { TranslationScopeProvider } from '@/i18n/translation-scope-provider'
import { useAppStore } from '@/store/index'
import type { AppState } from '@/store/types'
import { worktreeDrawn, windowShown } from '../window-drawn'
import { TourCaptionStrip } from './TourCaptionStrip'
import { TourAwayPill } from './TourAwayPill'
import {
  floatingStripRect,
  STRIP_BOTTOM_GAP_PX,
  stripAndPills,
  tourBandPx
} from './tour-strip-placement'
import { setTourBand, TOUR_BAND_RULE } from './tour-band'
import {
  pauseAllTours,
  playingTours,
  subscribeTours,
  toursVersion,
  type PlayingTour
} from './tour-player'

/** The strip is drawn while the window is and the tour's workspace is the one on screen. */
export function tourStripShown(tour: PlayingTour): boolean {
  return windowShown() && worktreeDrawn(useAppStore.getState(), tour.context.worktreeId)
}

/** Which tours' workspaces are on screen, as a string so the selector stays stable between renders. */
const drawnKey = (state: AppState): string =>
  playingTours()
    .map((tour) => (worktreeDrawn(state, tour.context.worktreeId) ? '1' : '0'))
    .join('')

function useWindowSize(): { width: number; height: number } {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  useEffect(() => {
    const onResize = (): void => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

/** Keeps the band as tall as the drawn strip (and reports it), and gives it back when no strip shows. */
function useStripBand(onHeight: (px: number) => void): (element: HTMLElement | null) => void {
  const observer = useRef<ResizeObserver | null>(null)
  useEffect(
    () => () => {
      observer.current?.disconnect()
      setTourBand(0)
    },
    []
  )
  return useCallback(
    (element: HTMLElement | null) => {
      observer.current?.disconnect()
      observer.current = null
      const update = (): void => {
        const px = element?.offsetHeight ?? 0
        setTourBand(tourBandPx(px))
        onHeight(px)
      }
      update()
      if (element) {
        observer.current = new ResizeObserver(update)
        observer.current.observe(element)
      }
    },
    [onHeight]
  )
}

function TourStrips(): React.JSX.Element {
  const version = useSyncExternalStore(subscribeTours, toursVersion)
  const drawn = useAppStore(drawnKey)
  const size = useWindowSize()
  const [stripPx, setStripPx] = useState(0)
  const stripRef = useStripBand(setStripPx)
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
  const rect = floatingStripRect(size)
  return (
    <>
      <style>{TOUR_BAND_RULE}</style>
      {stripTour ? (
        <TourCaptionStrip
          key={`${stripTour.context.worktreeId}:${stripTour.context.ownerTabId}`}
          tour={stripTour}
          index={stripTour.index}
          playing={stripTour.playing}
          advanceAt={stripTour.advanceAt}
          warning={stripTour.warnings[stripTour.index] ?? null}
          rect={rect}
          version={version}
          stripRef={stripRef}
        />
      ) : null}
      {away.length > 0 ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-30 flex justify-center gap-2 px-4"
          style={{ bottom: stripPx > 0 ? stripPx + 2 * STRIP_BOTTOM_GAP_PX : 1 }}
        >
          {away.map((tour) => (
            <TourAwayPill
              key={`${tour.context.worktreeId}:${tour.context.ownerTabId}`}
              tour={tour}
            />
          ))}
        </div>
      ) : null}
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
