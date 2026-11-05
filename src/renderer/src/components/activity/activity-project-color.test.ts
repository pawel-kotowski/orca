import { describe, expect, it } from 'vitest'
import { REPO_COLORS } from '../../../../shared/repo-badge-color'
import { activityCardTintStyle, activityProjectColor } from './activity-project-color'

describe('activity project colour', () => {
  it('uses the colour set in the project settings', () => {
    expect(activityProjectColor({ id: 'repo-1', badgeColor: '#EF4444' })).toBe('#ef4444')
  })

  it('picks a stable palette colour, never the grey, for a project left on the default', () => {
    const first = activityProjectColor({ id: 'repo-1', badgeColor: '#737373' })
    expect(first).not.toBe('#737373')
    expect(REPO_COLORS).toContain(first)
    expect(activityProjectColor({ id: 'repo-1' })).toBe(first)
  })

  it('gives different projects different colours', () => {
    const colors = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => activityProjectColor({ id: `repo-${id}` }))
    )
    expect(colors.size).toBeGreaterThan(2)
  })

  it('has no colour for a card without a project', () => {
    expect(activityProjectColor(null)).toBeNull()
  })

  it('tints over the card background instead of replacing it', () => {
    expect(activityCardTintStyle(null)).toBeUndefined()
    expect(activityCardTintStyle('#ef4444')?.backgroundImage).toContain('#ef4444 9%')
  })
})
