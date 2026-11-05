import { describe, expect, it } from 'vitest'
import { activityCardTintStyle, activityProjectColor } from './activity-project-color'

describe('activity project colour', () => {
  it('ignores the default grey every project starts with', () => {
    expect(activityProjectColor('#737373')).toBeNull()
    expect(activityProjectColor(undefined)).toBeNull()
    expect(activityProjectColor('#EF4444')).toBe('#ef4444')
  })

  it('tints over the card background instead of replacing it', () => {
    expect(activityCardTintStyle(null)).toBeUndefined()
    expect(activityCardTintStyle('#ef4444')?.backgroundImage).toContain('#ef4444 9%')
  })
})
