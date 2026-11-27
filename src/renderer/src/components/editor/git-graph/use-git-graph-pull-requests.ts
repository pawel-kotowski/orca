// Local (glass build): the Git Graph's Branches view names branches by their pull requests when
// asked (Paweł, 2026-11-23: "add options to view prs names instead of branch names and landed
// #pr-number for merged stuff"), and every view colours names by their PR's state. The repo's
// pull requests come from one copy shared by every graph and kept across restarts
// (git-graph-pr-cache.ts), so they show at once and are brought up to date quietly.
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { GitHistoryItem } from '../../../../../shared/git/history/git-history-types'
import { useGitGraphNames, type GitGraphDensity } from './git-graph-toolbar'
import {
  GIT_GRAPH_PR_PAGE,
  GIT_GRAPH_PR_SEARCH_LIMIT,
  extendGitGraphPrs,
  isGitGraphPrCacheBusy,
  readGitGraphPrCache,
  refreshGitGraphPrs,
  subscribeGitGraphPrCache,
  type GitGraphPullRequest
} from './git-graph-pr-cache'

export type { GitGraphPullRequest } from './git-graph-pr-cache'

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
  /** Load the PRs even with names off (colours, the branch picker's PR filter). */
  load?: boolean
  repoId: string | null
  items: readonly GitHistoryItem[]
  pinned: readonly string[]
  /** The repo's branches' state (gitGraphRefsToken): when it changes the PRs are read again. */
  refreshToken: string | undefined
}): GitGraphPullRequests {
  const entry = useSyncExternalStore(subscribeGitGraphPrCache, () =>
    repoId ? readGitGraphPrCache(repoId) : undefined
  )
  const oldest = oldestCommitTime(items)
  // The first pass reads another page while GitHub has more and the pages so far end after the
  // oldest loaded commit (a PR touched after a commit may still have merged it).
  const wantMore =
    load &&
    !!repoId &&
    (!entry ||
      (!entry.error &&
        !entry.done &&
        oldest !== undefined &&
        entry.oldestUpdatedAt > oldest &&
        entry.pages * GIT_GRAPH_PR_PAGE < GIT_GRAPH_PR_SEARCH_LIMIT))
  const wantRefresh =
    load &&
    !!repoId &&
    !!entry &&
    !wantMore &&
    !!refreshToken &&
    entry.refreshedFor !== refreshToken
  const pages = entry?.pages ?? 0
  useEffect(() => {
    if (wantMore && repoId) {
      void extendGitGraphPrs(repoId, refreshToken)
    }
  }, [pages, refreshToken, repoId, wantMore])
  useEffect(() => {
    if (wantRefresh && repoId) {
      void refreshGitGraphPrs(repoId, refreshToken)
    }
  }, [refreshToken, repoId, wantRefresh])

  return useMemo(() => {
    const byNumber = new Map<number, GitGraphPullRequest>()
    const byBranch = new Map<string, GitGraphPullRequest[]>()
    for (const pr of entry?.prs ?? []) {
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
    const error = load ? (entry?.error ?? null) : null
    return {
      on,
      byNumber,
      byBranch,
      pinned,
      loading: load && !!repoId && isGitGraphPrCacheBusy(repoId),
      error,
      list: entry?.prs ?? [],
      // A copy the first pass has finished reading is good to filter by; refreshes come quietly.
      settled: load && !!entry && (!!error || !wantMore)
    }
  }, [entry, load, on, pinned, repoId, wantMore])
}

/** The Branches view's Names switch and the pull requests it reads, with a line for the toolbar. */
export function useGitGraphPrNames(
  density: GitGraphDensity,
  repoId: string | null,
  items: readonly GitHistoryItem[],
  pinned: readonly string[],
  /** The repo's branches' state (gitGraphRefsToken). */
  refreshToken: string | undefined,
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
    refreshToken
  })
  // No word while PRs load: names take their colours when they arrive (Paweł, 2026-11-27, of
  // "Loading PRs…": "remove this shit"). A repo GitHub does not know says so where PRs were asked
  // for, since names and the PR filter cannot work then.
  const asked = pullRequests.on || stateFilterActive
  const status = asked && pullRequests.error ? `PRs unavailable: ${pullRequests.error}` : null
  return { names, setNames, pullRequests, status }
}
