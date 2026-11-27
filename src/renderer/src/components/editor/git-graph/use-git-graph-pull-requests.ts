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
  /** The branch the PR merges into. */
  baseName?: string
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
  /** Every PR loaded, read by the branch picker's "hide branches without a pull request". */
  list: readonly GitGraphPullRequest[]
  /** Every page the graph needs has loaded (or failed). */
  settled: boolean
}

const EMPTY: GitGraphPullRequests = {
  on: false,
  byNumber: new Map(),
  byBranch: new Map(),
  pinned: [],
  loading: false,
  error: null,
  list: [],
  settled: false
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
  return prs.on ? gitGraphBranchPullRequest(prs, branch, commitId) : undefined
}

/**
 * A branch's PR whatever the Names switch says, for its state's colour and the picker's PR filter:
 * the one at this commit, else an open or draft one, else the newest. Pinned branches have none.
 */
export function gitGraphBranchPullRequest(
  prs: GitGraphPullRequests,
  branch: string,
  commitId?: string
): GitGraphPullRequest | undefined {
  if (prs.pinned.includes(branch)) {
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
  load = on,
  repoId,
  items,
  pinned,
  refreshToken
}: {
  on: boolean
  /** Load the PRs even with names off (the branch picker's PR filter). */
  load?: boolean
  repoId: string | null
  items: readonly GitHistoryItem[]
  pinned: readonly string[]
  /** Changes when the graph reloads, so a new PR shows after Refresh. */
  refreshToken: unknown
}): GitGraphPullRequests {
  const [loaded, setLoaded] = useState<{
    key: string
    /** The graph load these pages were read for. */
    token: unknown
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
    setError(null)
  }, [key, refreshToken])

  const current = loaded?.key === key ? loaded : null
  // After the graph reloads the PRs are read again from page 1, and the ones read before stay in
  // use until the new ones arrive: dropping them made every branch read "no PR" for a moment, and
  // the branch picker's PR filter redraws the graph each time it changes.
  const stale = !!current && current.token !== refreshToken
  // Another page is needed while GitHub has more and the pages so far end after the oldest
  // loaded commit (a PR touched after a commit may still have merged it).
  const wantMore =
    load &&
    !!repoId &&
    !error &&
    (!current ||
      stale ||
      (!current.done &&
        oldest !== undefined &&
        current.oldestUpdatedAt > oldest &&
        current.pages * PAGE < GITHUB_SEARCH_LIMIT))
  const nextPage = !current || stale ? 1 : current.pages + 1

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
          baseName: item.baseRefName,
          headSha: item.headSha
        }))
        // Epoch milliseconds, like the graph's commit timestamps.
        const times = prItems
          .map((item) => Date.parse(item.updatedAt))
          .filter((time) => Number.isFinite(time))
        const pageOldest = times.length > 0 ? Math.min(...times) : Number.NaN
        setLoaded((previous) => {
          const base =
            nextPage > 1 && previous?.key === key && previous.token === refreshToken
              ? previous
              : null
          const prs = [...(base?.prs ?? []), ...page]
          return {
            key,
            token: refreshToken,
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
  }, [key, nextPage, refreshToken, repoId, wantMore])

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
    return {
      on,
      byNumber,
      byBranch,
      pinned,
      loading: load && loading,
      error: load ? error : null,
      list: current?.prs ?? [],
      settled: load && !loading && (!!error || (!!current && !stale && !wantMore))
    }
  }, [current, error, load, loading, on, pinned, stale, wantMore])
}

/** The Branches view's Names switch and the pull requests it reads, with a line for the toolbar. */
export function useGitGraphPrNames(
  density: GitGraphDensity,
  repoId: string | null,
  items: readonly GitHistoryItem[],
  pinned: readonly string[],
  result: { historyToken?: unknown } | null | undefined,
  /** The branch picker filters by PR state: a failure to load them is worth a line then. */
  stateFilterActive = false
): {
  names: GitGraphNames
  setNames: (next: GitGraphNames) => void
  pullRequests: GitGraphPullRequests
  status: string | null
} {
  const [names, setNames] = useGitGraphNames()
  const pullRequests = useGitGraphPullRequests({
    on: density === 'branches' && names === 'pr',
    // Always: every view colours a branch's name by its PR's state (Paweł, 2026-11-27: "a great
    // way to see merged and not merged prs/branches because we squash merge").
    load: true,
    repoId,
    items,
    pinned,
    refreshToken: result?.historyToken
  })
  // A repo GitHub does not know says so only where PRs were asked for.
  const asked = pullRequests.on || stateFilterActive
  const status = !asked
    ? null
    : pullRequests.error
      ? `PRs unavailable: ${pullRequests.error}`
      : pullRequests.loading
        ? 'Loading PRs…'
        : null
  return { names, setNames, pullRequests, status }
}
