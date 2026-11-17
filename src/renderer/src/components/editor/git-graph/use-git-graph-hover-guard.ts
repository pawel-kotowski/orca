// Local (glass build): the Git Graph's hover background (main.css) stays off while the list
// scrolls under a still pointer, where a two-finger trackpad scroll made it race down the rows, and
// comes back once the pointer itself moves (Paweł, 2026-11-17: "it should not move along with
// scroll on touchpad, only when i scroll with one finger it should reappear - that's what made me
// nervous"). Chrome sends pointer events at an unmoved position after a scroll, so only real
// movement counts. The flag is a data attribute on the list, set without a re-render.
import { useCallback, useRef } from 'react'
import type React from 'react'

export function useGitGraphHoverGuard(): {
  hideHover: (list: HTMLElement) => void
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
} {
  const last = useRef<{ x: number; y: number } | null>(null)
  const hideHover = useCallback((list: HTMLElement) => {
    list.dataset.gitGraphHoverOff = ''
  }, [])
  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const previous = last.current
    last.current = { x: event.clientX, y: event.clientY }
    const list = event.currentTarget
    if (
      'gitGraphHoverOff' in list.dataset &&
      previous &&
      Math.abs(event.clientX - previous.x) + Math.abs(event.clientY - previous.y) > 2
    ) {
      delete list.dataset.gitGraphHoverOff
    }
  }, [])
  return { hideHover, onPointerMove }
}
