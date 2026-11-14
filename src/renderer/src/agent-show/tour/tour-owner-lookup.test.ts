import { describe, expect, it } from 'vitest'
import { findOwnerTour } from './tour-owner-lookup'

describe('findOwnerTour', () => {
  const tour = { name: 'features', context: { ownerTabId: 'tab-1' } }
  const tours = new Map([['wt-a\u0000tab-1', tour]])

  it('finds the tour from the worktree it was started in', () => {
    expect(findOwnerTour(tours, 'wt-a\u0000tab-1', 'tab-1')).toBe(tour)
  })

  it('still finds it when the agent asks from another folder, by its tab', () => {
    expect(findOwnerTour(tours, 'wt-home\u0000tab-1', 'tab-1')).toBe(tour)
  })

  it("never hands one agent another agent's tour", () => {
    expect(findOwnerTour(tours, 'wt-a\u0000tab-2', 'tab-2')).toBeUndefined()
    expect(findOwnerTour(tours, 'wt-a\u0000', null)).toBeUndefined()
  })
})
