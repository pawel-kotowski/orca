// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeActivityCardClick, useActivityChatCardControls } from './activity-chat-card-controls'

const controls = { toggle: vi.fn(), hide: vi.fn() }

function Registered({ enabled = true }: { enabled?: boolean }): null {
  useActivityChatCardControls('pane', enabled, controls)
  return null
}

const card = { getBoundingClientRect: () => new DOMRect(100, 0, 200, 80) } as Element
const click = (
  clientX: number,
  extra: Partial<Parameters<typeof routeActivityCardClick>[2]> = {}
) =>
  routeActivityCardClick('pane', card, {
    clientX,
    detail: 1,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...extra
  })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('activity card click halves', () => {
  it('toggles the hover chat from the left half and opens nothing else', () => {
    render(<Registered />)
    expect(click(150)).toBe('chat')
    expect(controls.toggle).toHaveBeenCalledTimes(1)
  })

  it('opens the workspace from the right half and moves the chat aside', () => {
    render(<Registered />)
    expect(click(250)).toBe('workspace')
    expect(controls.hide).toHaveBeenCalledTimes(1)
    expect(controls.toggle).not.toHaveBeenCalled()
  })

  it('leaves keyboard activation, multi-select and cards without a chat to the workspace', () => {
    render(<Registered />)
    expect(click(150, { detail: 0 })).toBe('workspace')
    expect(click(150, { metaKey: true })).toBe('workspace')
    cleanup()
    render(<Registered enabled={false} />)
    expect(click(150)).toBe('workspace')
    expect(controls.toggle).not.toHaveBeenCalled()
  })
})
