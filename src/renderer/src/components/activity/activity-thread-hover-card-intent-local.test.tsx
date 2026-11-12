// @vitest-environment happy-dom

import { act, useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HoverCardContent } from '@/components/ui/hover-card'
import { ActivityThreadHoverCardRoot } from './activity-thread-hover-card-root'
import {
  _resetActivityHoverCardIntentForTest,
  ACTIVITY_HOVER_CARD_REST_MS
} from './activity-thread-hover-card-intent'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Local-only: a card whose right half has its own job opens its chat from the left half only
// (a0774308f4).

function Row({ id }: { id: string }): ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <ActivityThreadHoverCardRoot
      open={open}
      onOpenChange={setOpen}
      openDelay={200}
      closeDelay={120}
      enabled
      opensFromLeftHalf
      trigger={
        <div data-testid={id} data-open={open ? 'true' : 'false'} tabIndex={0}>
          {id}
        </div>
      }
    >
      <HoverCardContent data-testid={`card-${id}`}>card {id}</HoverCardContent>
    </ActivityThreadHoverCardRoot>
  )
}

describe('useActivityThreadHoverCardIntent with opensFromLeftHalf', () => {
  let container: HTMLDivElement
  let root: Root

  const row = (id: string): HTMLElement => {
    const el = container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
    if (!el) {
      throw new Error(`missing row ${id}`)
    }
    return el
  }
  const isOpen = (id: string): boolean => row(id).getAttribute('data-open') === 'true'
  const isResting = (id: string): boolean => row(id).hasAttribute('data-hover-card-resting')

  const pointer = (type: string, target: Element, x: number, y: number): void => {
    act(() => {
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          pointerType: 'mouse'
        })
      )
    })
  }
  const enter = (id: string, x: number, y: number): void => {
    pointer('pointerover', row(id), x, y)
    pointer('pointermove', row(id), x, y)
  }
  const advance = (ms: number): void => {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    _resetActivityHoverCardIntentForTest()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(<Row id="half" />))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
    vi.useRealTimers()
  })

  it('opens a left-half row only from its left half', () => {
    const half = row('half')
    half.getBoundingClientRect = () => new DOMRect(0, 0, 200, 40)
    enter('half', 150, 10)
    advance(ACTIVITY_HOVER_CARD_REST_MS * 2)
    expect(isOpen('half')).toBe(false)
    expect(isResting('half')).toBe(false)

    pointer('pointermove', half, 60, 10)
    advance(ACTIVITY_HOVER_CARD_REST_MS)
    expect(isOpen('half')).toBe(true)
  })

  it('drops a pending open when the pointer crosses into the right half', () => {
    const half = row('half')
    half.getBoundingClientRect = () => new DOMRect(0, 0, 200, 40)
    enter('half', 60, 10)
    advance(300)
    pointer('pointermove', half, 160, 10)
    advance(ACTIVITY_HOVER_CARD_REST_MS * 2)
    expect(isOpen('half')).toBe(false)
  })
})
