// Local (glass build): the Git Graph's Branches view names branches by their pull requests when
// asked (Paweł, 2026-11-23: "add options to view prs names instead of branch names and landed
// #pr-number for merged stuff"). The repo's pull requests come from Orca's GitHub work-item list
// (`is:pr`, every state, newest first), a page at a time until the pages reach back past the
// oldest commit the graph has loaded, so a merge far down the graph still finds its PR. GitHub's
// search itself stops at 1000 results.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import {
  findGitHubWorkItemRepo,
  getGitHubSourceTarget,
  getGitHubWorkItemRequestContext,
  listGitHubWorkItemsForRepo
} from '@/store/github/work-items/work-item-routing'
import type { GitHistoryItem } from '../../../../../shared/git/history/git-history-types'
import { useGitGraphNames, type GitGraphDensity } from './git-graph-toolbar'

export type GitGraphPullRequest = {
  number: number
  title: string
  state: 'open' | 'closed' | 'merged' | 'draft'
  url: string
  branchName?: string
  headSha?: string
}

export type GitGraphNames = 'branch' | 'pr'

export type GitGraphPullRequests = {
  /** Names read as pull requests (the toolbar's Names switch, Branches view only). */
  on: boolean
  byNumber: Map<number, GitGraphPullRequest>
  byBranch: Map<string, GitGraphPullRequest[]>
  /** Pinned branches (main, development) keep their names: a release PR is not their name. */
  pinned: readonly string[]
  loading: boolean
  error: string | null
}

const EMPTY: GitGraphPullRequests = {
  on: false,
  byNumber: new Map(),
  byBranch: new Map(),
  pinned: [],
  loading: false,
  error: null
}

const PullRequests = createContext<GitGraphPullRequests>(EMPTY)
export const GitGraphPullRequestsProvider = PullRequests.Provider
export function useGitGraphPullRequestContext(): GitGraphPullRequests {
  return useContext(PullRequests)
}

const PAGE = 100
// GitHub's search returns at most 1000 results.
const GITHUB_SEARCH_LIMIT = 1000

/** The pull request a branch name stands for: the one at this commit, else an open one, else the newest. */
export function gitGraphPullRequestForBranch(
  prs: GitGraphPullRequests,
  branch: string,
  commitId?: string
): GitGraphPullRequest | undefined {
  if (!prs.on || prs.pinned.includes(branch)) {
    return undefined
  }
  const list = prs.byBranch.get(branch)
  if (!list?.length) {
    return undefined
  }
  return (
    (commitId && list.find((pr) => pr.headSha === commitId)) ||
    list.find((pr) => pr.state === 'open' || pr.state === 'draft') ||
    list[0]
  )
}

/** The pull request a merge took in: by the number in its message, else its branch's merged PR. */
export function gitGraphPullRequestForMerge(
  prs: GitGraphPullRequests,
  number: string | undefined,
  branch: string | undefined
): GitGraphPullRequest | undefined {
  if (!prs.on) {
    return undefined
  }
  const byNumber = number ? prs.byNumber.get(Number(number.replace('#', ''))) : undefined
  if (byNumber) {
    return byNumber
  }
  if (!branch || prs.pinned.includes(branch)) {
    return undefined
  }
  return prs.byBranch.get(branch)?.find((pr) => pr.state === 'merged')
}

function oldestCommitTime(items: readonly GitHistoryItem[]): number | undefined {
  let oldest: number | undefined
  for (const item of items) {
    if (item.timestamp !== undefined && (oldest === undefined || item.timestamp < oldest)) {
      oldest = item.timestamp
    }
  }
  return oldest
}

export function useGitGraphPullRequests({
  on,
  repoId,
  items,
  pinned,
  refreshToken
}: {
  on: boolean
  repoId: string | null
  items: readonly GitHistoryItem[]
  pinned: readonly string[]
  /** Changes when the graph reloads, so a new PR shows after Refresh. */
  refreshToken: unknown
}): GitGraphPullRequests {
  const [loaded, setLoaded] = useState<{
    key: string
    prs: GitGraphPullRequest[]
    pages: number
    done: boolean
    oldestUpdatedAt: number
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = `${repoId ?? ''}`
  const oldest = oldestCommitTime(items)

  useEffect(() => {
    setLoaded(null)
    setError(null)
  }, [key, refreshToken])

  const current = loaded?.key === key ? loaded : null
  // Another page is needed while GitHub has more and the pages so far end after the oldest
  // loaded commit (a PR touched after a commit may still have merged it).
  const wantMore =
    on &&
    !!repoId &&
    !error &&
    (!current ||
      (!current.done &&
        oldest !== undefined &&
        current.oldestUpdatedAt > oldest &&
        current.pages * PAGE < GITHUB_SEARCH_LIMIT))
  const nextPage = (current?.pages ?? 0) + 1

  useEffect(() => {
    if (!wantMore || !repoId) {
      return
    }
    let cancelled = false
    const state = useAppStore.getState()
    const repo = state.repos.find((entry) => entry.id === repoId)
    if (!repo) {
      return
    }
    const owner = findGitHubWorkItemRepo(state, repo.id, repo.path) ?? repo
    const context = getGitHubWorkItemRequestContext(
      state,
      getGitHubSourceTarget(state, owner),
      repo.id,
      repo.path
    )
    setLoading(true)
    listGitHubWorkItemsForRepo(context, { limit: PAGE, query: 'is:pr', page: nextPage })
      .then((result) => {
        if (cancelled) {
          return
        }
        const failure = result.errors?.prs
        if (failure) {
          setError(failure.message || 'GitHub pull requests unavailable')
          return
        }
        const prItems = result.items.filter((item) => item.type === 'pr')
        const page = prItems.map((item): GitGraphPullRequest => ({
          number: item.number,
          title: item.title,
          state: item.state,
          url: item.url,
          branchName: item.branchName,
          headSha: item.headSha
        }))
        // Epoch milliseconds, like the graph's commit timestamps.
        const times = prItems
          .map((item) => Date.parse(item.updatedAt))
          .filter((time) => Number.isFinite(time))
        const pageOldest = times.length > 0 ? Math.min(...times) : Number.NaN
        setLoaded((previous) => {
          const base = previous?.key === key ? previous : null
          const prs = [...(base?.prs ?? []), ...page]
          return {
            key,
            prs,
            pages: nextPage,
            done: page.length < PAGE,
            oldestUpdatedAt: Number.isFinite(pageOldest)
              ? Math.min(pageOldest, base?.oldestUpdatedAt ?? Infinity)
              : (base?.oldestUpdatedAt ?? 0)
          }
        })
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
      setLoading(false)
    }
  }, [key, nextPage, repoId, wantMore])

  return useMemo(() => {
    const byNumber = new Map<number, GitGraphPullRequest>()
    const byBranch = new Map<string, GitGraphPullRequest[]>()
    for (const pr of current?.prs ?? []) {
      byNumber.set(pr.number, pr)
      if (pr.branchName) {
        const list = byBranch.get(pr.branchName) ?? []
        list.push(pr)
        byBranch.set(pr.branchName, list)
      }
    }
    // Newest first per branch.
    for (const list of byBranch.values()) {
      list.sort((a, b) => b.number - a.number)
    }
    return { on, byNumber, byBranch, pinned, loading: on && loading, error: on ? error : null }
  }, [current, error, loading, on, pinned])
}

/** The Branches view's Names switch and the pull requests it reads, with a line for the toolbar. */
export function useGitGraphPrNames(
  density: GitGraphDensity,
  repoId: string | null,
  items: readonly GitHistoryItem[],
  pinned: readonly string[],
  result: { historyToken?: unknown } | null | undefined
): {
  names: GitGraphNames
  setNames: (next: GitGraphNames) => void
  pullRequests: GitGraphPullRequests
  status: string | null
} {
  const [names, setNames] = useGitGraphNames()
  const pullRequests = useGitGraphPullRequests({
    on: density === 'branches' && names === 'pr',
    repoId,
    items,
    pinned,
    refreshToken: result?.historyToken
  })
  const status = pullRequests.error
    ? `PRs unavailable: ${pullRequests.error}`
    : pullRequests.loading
      ? 'Loading PRs…'
      : null
  return { names, setNames, pullRequests, status }
}
