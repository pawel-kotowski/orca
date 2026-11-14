import { useRef, useState } from 'react'
import { setTourStripSpot } from './tour-strip-spot-store'
import { clampDockBox, spotOfBox, type DockBox } from './tour-strip-spot'

type Size = { width: number; height: number }

/** Pointer handlers for an element that moves the dock; spread them on the strip's title row or a grip. */
export type DockDragHandle = {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void
  onDoubleClick: (event: React.MouseEvent<HTMLElement>) => void
}

// Why a threshold: a plain click on the title must not turn the default spot into a dragged one.
const DRAG_THRESHOLD_PX = 3
const NO_DRAG_SELECTOR = 'button,a,input,textarea,select'

const onControl = (target: EventTarget): boolean =>
  target instanceof Element && target.closest(NO_DRAG_SELECTOR) !== null

type Drag = { pointerId: number; x: number; y: number; origin: DockBox; box: DockBox | null }

/**
 * Drags the dock inside the window and stores where it lands; a double click puts it back at its
 * default spot. While dragging, `dragBox` is where to draw it.
 */
export function useTourDockDrag(
  box: DockBox,
  dock: Size,
  window: Size
): { dragBox: DockBox | null; handle: DockDragHandle } {
  const drag = useRef<Drag | null>(null)
  const [dragBox, setDragBox] = useState<DockBox | null>(null)
  const end = (event: React.PointerEvent<HTMLElement>): void => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) {
      return
    }
    drag.current = null
    setDragBox(null)
    if (current.box) {
      setTourStripSpot(spotOfBox(current.box, dock, window))
    }
  }
  return {
    dragBox,
    handle: {
      onPointerDown: (event) => {
        if (event.button !== 0 || onControl(event.target)) {
          return
        }
        // Why: no text selection and no focus move while the user grabs the dock.
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          origin: box,
          box: null
        }
      },
      onPointerMove: (event) => {
        const current = drag.current
        if (!current || current.pointerId !== event.pointerId) {
          return
        }
        const dx = event.clientX - current.x
        const dy = event.clientY - current.y
        if (!current.box && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
          return
        }
        current.box = clampDockBox(
          { left: current.origin.left + dx, top: current.origin.top + dy },
          dock,
          window
        )
        setDragBox(current.box)
      },
      onPointerUp: end,
      onPointerCancel: end,
      onDoubleClick: (event) => {
        if (!onControl(event.target)) {
          setTourStripSpot(null)
        }
      }
    }
  }
}
