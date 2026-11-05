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

  it("gives a remote workspace its project's colour, not its host's grey record", () => {
    const identity = {
      canonicalKey: 'github.com/mos-health/mos',
      remoteName: 'origin',
      remoteUrl: 'git@github.com:mos-health/mos.git'
    }
    const local = {
      id: 'local-mos',
      path: '/Users/me/mos',
      displayName: 'mos',
      kind: 'git',
      badgeColor: '#f97316',
      gitRemoteIdentity: identity,
      addedAt: 1
    }
    const remote = {
      ...local,
      id: 'devbox-mos',
      path: '/home/me/mos',
      badgeColor: '#737373',
      connectionId: 'devbox'
    }
    act(() => {
      useAppStore.setState({
        repos: [local, remote],
        projects: [
          {
            id: 'github:mos-health/mos',
            displayName: 'mos',
            badgeColor: '#f97316',
            kind: 'git',
            sourceRepoIds: ['local-mos'],
            createdAt: 1,
            updatedAt: 1
          }
        ],
        projectHostSetups: [
          {
            id: 'local-mos',
            projectId: 'github:mos-health/mos',
            hostId: 'local',
            repoId: 'local-mos',
            path: '/Users/me/mos',
            displayName: 'mos',
            kind: 'git',
            setupState: 'ready',
            setupMethod: 'legacy-repo',
            createdAt: 1,
            updatedAt: 1
          }
        ]
      } as never)
    })
    const { result } = renderHook(() => useActivityProjectColor(remote))
    expect(result.current).toBe('#f97316')
  })
})
