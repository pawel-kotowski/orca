import { describe, expect, it, vi } from 'vitest'

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('./git-graph-tab', () => ({ openGitGraph: vi.fn() }))
const { savedGitGraphTabs } = await import('./restore-git-graph-tabs')

describe('savedGitGraphTabs', () => {
  it('finds each saved Git Graph tab with its group, place and whether it was active', () => {
    const tab = (id: string, contentType: string, groupId: string) => ({ id, contentType, groupId })
    const session = {
      unifiedTabs: {
        w1: [tab('t1', 'terminal', 'g1'), tab('w1::git-graph', 'git-graph', 'g1')],
        w2: [tab('t2', 'terminal', 'g2'), tab('w2::git-graph', 'git-graph', 'g2')]
      },
      tabGroups: {
        w1: [{ id: 'g1', tabOrder: ['t1', 'w1::git-graph'], activeTabId: 'w1::git-graph' }],
        w2: [{ id: 'g2', tabOrder: ['w2::git-graph', 't2'], activeTabId: 't2' }]
      }
    } as never
    expect(savedGitGraphTabs(session)).toEqual([
      { worktreeId: 'w1', groupId: 'g1', index: 1, wasActive: true, activeTabId: 'w1::git-graph' },
      { worktreeId: 'w2', groupId: 'g2', index: 0, wasActive: false, activeTabId: 't2' }
    ])
  })
})
