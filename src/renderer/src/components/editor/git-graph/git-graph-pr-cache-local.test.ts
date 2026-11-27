// @vitest-environment happy-dom
// One copy of a repo's PRs for every graph, kept across restarts, brought up to date quietly
// (Paweł, 2026-11-27, of "Loading PRs…": "remove this shit and make loading more efficient and
// smooth").
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listGitHubWorkItemsForRepo = vi.fn()
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      repos: ['repo-1', 'repo-2', 'repo-3'].map((id) => ({ id, path: `/repos/${id}` })),
      settings: {}
    })
  }
}))
vi.mock('@/store/github/work-items/work-item-routing', () => ({
  findGitHubWorkItemRepo: () => null,
  getGitHubSourceTarget: () => ({ kind: 'local' }),
  getGitHubWorkItemRequestContext: () => ({ repoId: 'repo-1', repoPath: '/repos/app' }),
  listGitHubWorkItemsForRepo: (...args: unknown[]) => listGitHubWorkItemsForRepo(...args)
}))

const cache = await import('./git-graph-pr-cache')

type State = 'open' | 'draft' | 'merged' | 'closed'
const item = (number: number, state: State) => ({
  type: 'pr',
  number,
  title: `PR ${number}`,
  state,
  url: `https://github.com/acme/app/pull/${number}`,
  branchName: `b${number}`,
  baseRefName: 'test',
  headSha: `s${number}`,
  updatedAt: new Date(2026, 10, number % 28).toISOString()
})
const page = (...items: ReturnType<typeof item>[]) => ({ items })

describe('the shared PR copy', () => {
  beforeEach(() => {
    localStorage.clear()
    listGitHubWorkItemsForRepo.mockReset()
  })

  it('reads page 1 first, and a refresh re-reads only the pages holding open or draft PRs', async () => {
    listGitHubWorkItemsForRepo.mockResolvedValueOnce(
      page(item(12, 'draft'), item(11, 'open'), item(10, 'merged'))
    )
    await cache.extendGitGraphPrs('repo-1', 'refs-a')
    const first = cache.readGitGraphPrCache('repo-1')!
    expect(first.prs.map((pr) => pr.number)).toEqual([12, 11, 10])
    expect(first.done).toBe(true)
    expect(first.refreshedFor).toBe('refs-a')
    expect(listGitHubWorkItemsForRepo).toHaveBeenCalledWith(expect.anything(), {
      limit: 100,
      query: 'is:pr',
      page: 1
    })

    // The branches moved: #12 merged meanwhile. One request, and what was shown stays until then.
    let release!: (value: unknown) => void
    listGitHubWorkItemsForRepo.mockReturnValueOnce(new Promise((resolve) => (release = resolve)))
    const refreshing = cache.refreshGitGraphPrs('repo-1', 'refs-b')
    expect(cache.readGitGraphPrCache('repo-1')!.prs).toHaveLength(3)
    expect(cache.isGitGraphPrCacheBusy('repo-1')).toBe(true)
    release(page(item(12, 'merged'), item(11, 'open'), item(10, 'merged')))
    await refreshing
    const after = cache.readGitGraphPrCache('repo-1')!
    expect(after.prs.find((pr) => pr.number === 12)!.state).toBe('merged')
    expect(after.refreshedFor).toBe('refs-b')
    expect(listGitHubWorkItemsForRepo).toHaveBeenCalledTimes(2)
  })

  it('keeps the copy across restarts', async () => {
    listGitHubWorkItemsForRepo.mockResolvedValueOnce(page(item(7, 'open')))
    await cache.extendGitGraphPrs('repo-2', 'refs-a')
    const stored = JSON.parse(localStorage.getItem('orca.gitGraph.prCache.repo-2')!)
    expect(stored.prs.map((pr: { number: number }) => pr.number)).toEqual([7])
  })

  it('keeps what it has when GitHub fails, and says why', async () => {
    listGitHubWorkItemsForRepo.mockResolvedValueOnce(page(item(5, 'open')))
    await cache.extendGitGraphPrs('repo-3', 'refs-a')
    listGitHubWorkItemsForRepo.mockRejectedValueOnce(new Error('gh: not logged in'))
    await cache.refreshGitGraphPrs('repo-3', 'refs-b')
    const entry = cache.readGitGraphPrCache('repo-3')!
    expect(entry.prs.map((pr) => pr.number)).toEqual([5])
    expect(entry.error).toBe('gh: not logged in')
  })
})

describe('helpers', () => {
  const pr = (number: number, state: State) => ({ number, title: '', state, url: '' })

  it('counts the pages that still hold a PR whose state can change', () => {
    const prs = Array.from({ length: 250 }, (_, index) =>
      pr(1000 - index, index === 120 ? 'draft' : 'merged')
    )
    expect(cache.gitGraphPrPagesToRefresh(prs)).toBe(2)
    expect(cache.gitGraphPrPagesToRefresh([pr(1, 'merged')])).toBe(1)
  })

  it('merges a page over the copy by number, newest first', () => {
    expect(
      cache.mergeGitGraphPrs([pr(3, 'open'), pr(1, 'merged')], [pr(3, 'merged'), pr(4, 'open')])
    ).toEqual([pr(4, 'open'), pr(3, 'merged'), pr(1, 'merged')])
  })

  it('fingerprints the branches, not their order', () => {
    const a = { id: 'refs/heads/a', name: 'a', revision: '1' }
    const b = { id: 'refs/heads/b', name: 'b', revision: '2' }
    expect(cache.gitGraphRefsToken([a, b])).toBe(cache.gitGraphRefsToken([b, a]))
    expect(cache.gitGraphRefsToken([a, { ...b, revision: '3' }])).not.toBe(
      cache.gitGraphRefsToken([a, b])
    )
    expect(cache.gitGraphRefsToken([])).toBeUndefined()
  })
})
