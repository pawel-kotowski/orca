// @vitest-environment happy-dom
// A pull request's description in the Git Graph, rendered the way GitHub shows it (Paweł,
// 2026-11-27): which PR a row stands for, and the Description toggle drawing the body's markdown.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  GitHistoryItem,
  GitHistoryItemRef
} from '../../../../../shared/git/history/git-history-types'

vi.mock('@/store', () => {
  const state = { repos: [{ id: 'repo-1', path: '/repos/app' }], settings: {} }
  const useAppStore = Object.assign((select: (s: typeof state) => unknown) => select(state), {
    getState: () => state
  })
  return { useAppStore }
})
vi.mock('@/store/github/work-items/work-item-routing', () => ({
  findGitHubWorkItemRepo: () => null,
  getGitHubSourceTarget: () => ({ kind: 'local' }),
  getGitHubWorkItemRequestContext: (
    _s: unknown,
    _t: unknown,
    repoId: string,
    repoPath: string
  ) => ({
    repoId,
    repoPath,
    target: { kind: 'local' }
  })
}))

const { GitGraphPullRequestDescription, gitGraphPullRequestRepo, gitGraphRowPullRequest } =
  await import('./git-graph-pr-description')

const branch = (name: string): GitHistoryItemRef => ({
  id: `refs/heads/${name}`,
  name,
  category: 'branches'
})
const commit = (
  subject: string,
  parentIds = ['p'],
  references: GitHistoryItemRef[] = []
): GitHistoryItem => ({ id: 'c', parentIds, subject, message: subject, references })

const prs = (on: boolean) => ({
  on,
  byNumber: new Map([
    [
      12,
      {
        number: 12,
        title: 'Walks',
        state: 'merged' as const,
        url: 'https://github.com/acme/app/pull/12'
      }
    ]
  ]),
  byBranch: new Map([
    [
      'feature-x',
      [
        {
          number: 40,
          title: 'Feature X',
          state: 'open' as const,
          url: 'https://github.com/acme/app/pull/40',
          branchName: 'feature-x'
        }
      ]
    ]
  ]),
  pinned: ['main'],
  loading: false,
  error: null,
  list: [],
  settled: true
})

describe('gitGraphRowPullRequest', () => {
  it('reads a landing from its message in either names view', () => {
    expect(gitGraphRowPullRequest(commit('feat: walks (#12)'), prs(false))).toEqual({ number: 12 })
    expect(gitGraphRowPullRequest(commit('feat: walks (#12)'), prs(true))).toEqual({
      number: 12,
      url: 'https://github.com/acme/app/pull/12'
    })
    expect(
      gitGraphRowPullRequest(commit('Merge pull request #7 from acme/x', ['a', 'b']), prs(false))
    ).toEqual({ number: 7 })
  })

  it("names a branch tip's PR only with PR titles on", () => {
    const tip = commit('work', ['p'], [branch('feature-x')])
    expect(gitGraphRowPullRequest(tip, prs(true))).toEqual({
      number: 40,
      url: 'https://github.com/acme/app/pull/40'
    })
    expect(gitGraphRowPullRequest(tip, prs(false))).toBeUndefined()
    expect(gitGraphRowPullRequest(commit('plain work'), prs(true))).toBeUndefined()
  })

  it('links #N and @user in the body to the PR repository', () => {
    expect(gitGraphPullRequestRepo('https://github.com/acme/app/pull/12')).toEqual({
      owner: 'acme',
      repo: 'app'
    })
    expect(gitGraphPullRequestRepo('https://ghe.corp/acme/app/pull/3')).toEqual({
      owner: 'acme',
      repo: 'app',
      host: 'ghe.corp'
    })
    expect(gitGraphPullRequestRepo(undefined)).toBeNull()
  })
})

describe('GitGraphPullRequestDescription', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('opens on click and renders the body as GitHub markdown, and remembers it is open', async () => {
    const body = [
      '## Why',
      '',
      'Members asked for **walks**.',
      '',
      '- [x] tracked',
      '- [ ] synced',
      '',
      '| Before | After |',
      '| --- | --- |',
      '| 0 | 3 |',
      '',
      '```ts',
      'const steps = 3',
      '```'
    ].join('\n')
    const workItemDetails = vi.fn(async () => ({
      item: { url: 'https://github.com/acme/app/pull/12' },
      body,
      comments: []
    }))
    Object.assign(window, { api: { gh: { workItemDetails } } })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () =>
      root.render(<GitGraphPullRequestDescription repoId="repo-1" number={12} />)
    )
    expect(container.textContent).not.toContain('Members asked')
    expect(workItemDetails).not.toHaveBeenCalled()
    const toggle = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Description'
    )!
    await act(async () => toggle.click())
    await vi.waitFor(() => expect(container.querySelector('table')).toBeTruthy(), { timeout: 5000 })
    expect(workItemDetails).toHaveBeenCalledWith({
      repoPath: '/repos/app',
      repoId: 'repo-1',
      number: 12,
      type: 'pr'
    })
    expect(container.querySelector('h2')?.textContent).toBe('Why')
    expect(container.querySelector('strong')?.textContent).toBe('walks')
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2)
    expect(container.querySelector('pre')?.textContent).toContain('const steps = 3')
    expect(container.textContent).toContain('Open on GitHub')
    expect(localStorage.getItem('orca.gitGraph.prDescription')).toBe('open')
    await act(async () => root.unmount())
  })

  it('says so when the PR has no description, and when it did not load', async () => {
    const workItemDetails = vi
      .fn()
      .mockResolvedValueOnce({ item: { url: 'u' }, body: ' ', comments: [] })
      .mockRejectedValueOnce(new Error('gh: not logged in'))
    Object.assign(window, { api: { gh: { workItemDetails } } })
    localStorage.setItem('orca.gitGraph.prDescription', 'open')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () =>
      root.render(<GitGraphPullRequestDescription repoId="repo-1" number={5} />)
    )
    await vi.waitFor(() => expect(container.textContent).toContain('No description provided.'))
    await act(async () =>
      root.render(<GitGraphPullRequestDescription key="6" repoId="repo-1" number={6} />)
    )
    await vi.waitFor(() =>
      expect(container.textContent).toContain(
        'The description of #6 did not load: gh: not logged in'
      )
    )
    await act(async () => root.unmount())
  })
})
