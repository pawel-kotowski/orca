import { useEffect, useState } from 'react'
import type { ClearRect } from './tour-strip-spot'

// Why polling: the chips live in other libraries' shadow roots and move without telling us.
const MEASURE_MS = 500

/**
 * Chips other code floats over the whole window, which the tour's dock must not cover: the dev
 * build's React Grab toolbar (copy a component's source; draggable along any edge).
 */
function floatingChipRects(): ClearRect[] {
  const toolbar = document
    .querySelector('[data-react-grab]')
    ?.shadowRoot?.querySelector('[data-react-grab-toolbar]')
  const rect = toolbar?.getBoundingClientRect()
  return rect && rect.width > 0 && rect.height > 0
    ? [{ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }]
    : []
}

const sameRects = (a: readonly ClearRect[], b: readonly ClearRect[]): boolean =>
  a.length === b.length &&
  a.every(
    (rect, index) =>
      rect.left === b[index]!.left &&
      rect.top === b[index]!.top &&
      rect.right === b[index]!.right &&
      rect.bottom === b[index]!.bottom
  )

/** Where those chips are now, re-measured while `enabled`; the same array while they stay put. */
export function useFloatingChipRects(enabled: boolean): readonly ClearRect[] {
  const [rects, setRects] = useState<readonly ClearRect[]>([])
  useEffect(() => {
    if (!enabled) {
      return
    }
    const measure = (): void => {
      const next = floatingChipRects()
      setRects((was) => (sameRects(was, next) ? was : next))
    }
    measure()
    const timer = setInterval(measure, MEASURE_MS)
    return () => clearInterval(timer)
  }, [enabled])
  return rects
}
