// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { useActivityProjectColor } from './activity-project-color'

describe('useActivityProjectColor', () => {
  it('follows a colour changed in the project settings, not the thread copy', () => {
    const repo = { id: 'repo-live', badgeColor: '#737373' }
    act(() => {
      useAppStore.setState({ repos: [repo] } as never)
    })
    const { result } = renderHook(() => useActivityProjectColor(repo))
    const picked = result.current
    expect(picked).not.toBe('#737373')

    act(() => {
      useAppStore.setState({ repos: [{ ...repo, badgeColor: '#ef4444' }] } as never)
    })
    expect(result.current).toBe('#ef4444')
  })
})
