import { describe, expect, it } from 'vitest'
import { clampDockBox, dockBox, parseTourStripSpot, spotOfBox } from './tour-strip-spot'

const strip = { width: 600, height: 80 }
const small = { width: 1280, height: 800 }
const large = { width: 1600, height: 1000 }

describe('dockBox at the default spot', () => {
  it('centres the strip 8 px above the bottom', () => {
    expect(dockBox(null, strip, small, true)).toEqual({ left: 340, top: 712 })
    expect(dockBox(null, strip, large, true)).toEqual({ left: 500, top: 912 })
  })

  it('puts a pill alone on the status bar, 1 px above the bottom', () => {
    expect(dockBox(null, { width: 300, height: 22 }, small, false)).toEqual({
      left: 490,
      top: 777
    })
  })
})

describe('a dragged spot', () => {
  it('stores the middle of the bottom edge as fractions of the window, and draws back to the same box', () => {
    const spot = spotOfBox({ left: 100, top: 200 }, strip, large)
    expect(spot).toEqual({ x: 0.25, y: 0.28 })
    expect(dockBox(spot, strip, large, true)).toEqual({ left: 100, top: 200 })
  })

  it('keeps the same part of the window after a resize', () => {
    expect(dockBox({ x: 0.25, y: 0.28 }, strip, small, true)).toEqual({ left: 20, top: 144 })
  })

  it('snaps back inside, 4 px from the edges, when a smaller window would push it out', () => {
    const corner = spotOfBox({ left: 996, top: 916 }, strip, large)
    expect(corner).toEqual({ x: 0.81, y: 0.996 })
    expect(dockBox(corner, strip, small, true)).toEqual({ left: 676, top: 716 })
  })

  it('keeps the top-left corner in view when the window is narrower than the dock', () => {
    expect(dockBox({ x: 0.5, y: 0.5 }, strip, { width: 500, height: 400 }, true)).toEqual({
      left: 4,
      top: 120
    })
  })
})

describe('clampDockBox', () => {
  it('stops a drag at the window edges', () => {
    expect(clampDockBox({ left: -50, top: -10 }, strip, small)).toEqual({ left: 4, top: 4 })
    expect(clampDockBox({ left: 900, top: 790 }, strip, small)).toEqual({ left: 676, top: 716 })
  })
})

describe('parseTourStripSpot', () => {
  it('reads a stored spot and drops anything else', () => {
    expect(parseTourStripSpot('{"x":0.25,"y":0.28}')).toEqual({ x: 0.25, y: 0.28 })
    expect(parseTourStripSpot('{"x":1.4,"y":0.28}')).toBeNull()
    expect(parseTourStripSpot('{"x":"0.2","y":0.28}')).toBeNull()
    expect(parseTourStripSpot('not json')).toBeNull()
    expect(parseTourStripSpot(null)).toBeNull()
  })
})
