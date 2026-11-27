// Local (glass build): one copy of a repo's pull requests for every Git Graph tab, kept across
// restarts (Paweł, 2026-11-27, of the toolbar's "Loading PRs…": "remove this shit and make loading
// more efficient and smooth"). A graph shows names in their PR colours and applies the PR filter at
// once from this copy, then brings it up to date without a word:
// - the first time, a page at a time (100, newest created first) until the pages reach back past
//   the oldest commit the graph has loaded (GitHub's search stops at 1000);
// - after that only when the repo's branches change (a fetch, a push, a new branch) or Refresh is
//   pressed, and then only the pages that still hold an open or draft PR: merged ones do not
//   change, so a refresh is usually one request. A refresh never empties what is shown.
import {
  findGitHubWorkItemRepo,
  getGitHubSourceTarget,
  getGitHubWorkItemRequestContext,
  listGitHubWorkItemsForRepo
} from '@/store/github/work-items/work-item-routing'
import { useAppStore } from '@/store'
import type { GitHistoryItemRef } from '../../../../../shared/git/history/git-history-types'

export const GIT_GRAPH_PR_PAGE = 100
/** GitHub's search returns at most 1000 results. */
export const GIT_GRAPH_PR_SEARCH_LIMIT = 1000

export type GitGraphPullRequest = {
  number: number
  title: string
  state: 'open' | 'closed' | 'merged' | 'draft'
  url: string
  branchName?: string
  /** The branch the PR merges into. */
  baseName?: string
  headSha?: string
  /** Epoch milliseconds. */
  updatedAt?: number
}

export type GitGraphPrCacheEntry = {
  /** Newest first (by number, as GitHub pages them: newest created first). */
  prs: GitGraphPullRequest[]
  /** Pages read by the first pass. */
  pages: number
  done: boolean
  /** The oldest update among the PRs read: the first pass reads on while commits are older. */
  oldestUpdatedAt: number
  /** The branches' state (gitGraphRefsToken) the copy was last brought up to date for. */
  refreshedFor: string | null
  error: string | null
}

const STORAGE_PREFIX = 'orca.gitGraph.prCache.'
const entries = new Map<string, GitGraphPrCacheEntry>()
const busy = new Set<string>()
const listeners = new Set<() => void>()

export function subscribeGitGraphPrCache(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function readGitGraphPrCache(repoId: string): GitGraphPrCacheEntry | undefined {
  if (!entries.has(repoId)) {
    try {
      const stored = localStorage.getItem(STORAGE_PREFIX + repoId)
      if (stored) {
        // A copy from an earlier run is complete but may be behind: its error is not.
        entries.set(repoId, { ...(JSON.parse(stored) as GitGraphPrCacheEntry), error: null })
      }
    } catch {
      // Unreadable or blocked storage: read from GitHub.
    }
  }
  return entries.get(repoId)
}

export function isGitGraphPrCacheBusy(repoId: string): boolean {
  return busy.has(repoId)
}

function write(repoId: string, entry: GitGraphPrCacheEntry): void {
  entries.set(repoId, entry)
  try {
    localStorage.setItem(STORAGE_PREFIX + repoId, JSON.stringify({ ...entry, error: null }))
  } catch {
    // Full or blocked storage: the copy lasts for this run only.
  }
  for (const listener of listeners) {
    listener()
  }
}

/** A short fingerprint of the repo's branches and where they point. */
export function gitGraphRefsToken(refs: readonly GitHistoryItemRef[]): string | undefined {
  if (refs.length === 0) {
    return undefined
  }
  let hash = 0x811c9dc5
  for (const line of refs.map((ref) => `${ref.id}@${ref.revision ?? ''}`).sort()) {
    for (let index = 0; index < line.length; index += 1) {
      hash = Math.imul(hash ^ line.charCodeAt(index), 0x01000193)
    }
  }
  return `${refs.length}:${(hash >>> 0).toString(36)}`
}

/** PRs read from a page replace the copies of the same numbers; newest first. */
export function mergeGitGraphPrs(
  current: readonly GitGraphPullRequest[],
  page: readonly GitGraphPullRequest[]
): GitGraphPullRequest[] {
  const byNumber = new Map(current.map((pr) => [pr.number, pr]))
  for (const pr of page) {
    byNumber.set(pr.number, pr)
  }
  return [...byNumber.values()].sort((a, b) => b.number - a.number)
}

/** How many pages, from the first, hold a PR whose state can still change (open or draft). */
export function gitGraphPrPagesToRefresh(prs: readonly GitGraphPullRequest[]): number {
  let last = -1
  prs.forEach((pr, index) => {
    if (pr.state === 'open' || pr.state === 'draft') {
      last = index
    }
  })
  return Math.max(1, Math.floor(last / GIT_GRAPH_PR_PAGE) + 1)
}

async function readPage(
  repoId: string,
  page: number
): Promise<{ prs: GitGraphPullRequest[] } | { error: string }> {
  const state = useAppStore.getState()
  const repo = state.repos.find((entry) => entry.id === repoId)
  if (!repo) {
    return { error: 'This repository is not in Orca.' }
  }
  const owner = findGitHubWorkItemRepo(state, repo.id, repo.path) ?? repo
  const context = getGitHubWorkItemRequestContext(
    state,
    getGitHubSourceTarget(state, owner),
    repo.id,
    repo.path
  )
  try {
    const result = await listGitHubWorkItemsForRepo(context, {
      limit: GIT_GRAPH_PR_PAGE,
      query: 'is:pr',
      page
    })
    const failure = result.errors?.prs
    if (failure) {
      return { error: failure.message || 'GitHub pull requests unavailable' }
    }
    return {
      prs: result.items
        .filter((item) => item.type === 'pr')
        .map((item) => {
          const updatedAt = Date.parse(item.updatedAt)
          return {
            number: item.number,
            title: item.title,
            state: item.state,
            url: item.url,
            branchName: item.branchName,
            baseName: item.baseRefName,
            headSha: item.headSha,
            ...(Number.isFinite(updatedAt) ? { updatedAt } : {})
          }
        })
    }
  } catch (reason) {
    return { error: reason instanceof Error ? reason.message : String(reason) }
  }
}

function oldestUpdate(prs: readonly GitGraphPullRequest[], fallback: number): number {
  const times = prs.map((pr) => pr.updatedAt).filter((time): time is number => time !== undefined)
  return times.length > 0 ? Math.min(fallback, ...times) : fallback
}

/** The first pass: the next page, back past the graph's oldest commit. */
export async function extendGitGraphPrs(repoId: string, token: string | undefined): Promise<void> {
  if (busy.has(repoId)) {
    return
  }
  busy.add(repoId)
  try {
    const entry = readGitGraphPrCache(repoId)
    const page = (entry?.pages ?? 0) + 1
    const read = await readPage(repoId, page)
    const current = readGitGraphPrCache(repoId)
    if ('error' in read) {
      write(repoId, {
        prs: current?.prs ?? [],
        pages: current?.pages ?? 0,
        done: current?.done ?? false,
        oldestUpdatedAt: current?.oldestUpdatedAt ?? Infinity,
        refreshedFor: current?.refreshedFor ?? null,
        error: read.error
      })
      return
    }
    write(repoId, {
      prs: mergeGitGraphPrs(current?.prs ?? [], read.prs),
      pages: page,
      done: read.prs.length < GIT_GRAPH_PR_PAGE,
      oldestUpdatedAt: oldestUpdate(read.prs, current?.oldestUpdatedAt ?? Infinity),
      // The first page read is as fresh as a refresh.
      refreshedFor: page === 1 ? (token ?? null) : (current?.refreshedFor ?? null),
      error: null
    })
  } finally {
    busy.delete(repoId)
  }
}

/** Brings the copy up to date: the pages that hold an open or draft PR, from the first. */
export async function refreshGitGraphPrs(repoId: string, token: string | undefined): Promise<void> {
  if (busy.has(repoId)) {
    return
  }
  const entry = readGitGraphPrCache(repoId)
  if (!entry) {
    return
  }
  busy.add(repoId)
  try {
    const pages = gitGraphPrPagesToRefresh(entry.prs)
    for (let page = 1; page <= pages; page += 1) {
      const read = await readPage(repoId, page)
      const current = readGitGraphPrCache(repoId) ?? entry
      if ('error' in read) {
        write(repoId, { ...current, refreshedFor: token ?? null, error: read.error })
        return
      }
      write(repoId, {
        ...current,
        prs: mergeGitGraphPrs(current.prs, read.prs),
        refreshedFor: page === pages ? (token ?? null) : current.refreshedFor,
        error: null
      })
    }
  } finally {
    busy.delete(repoId)
  }
}

/** Refresh asks for the PRs again whatever the branches say. */
export function invalidateGitGraphPrs(repoId: string | null): void {
  const entry = repoId ? readGitGraphPrCache(repoId) : undefined
  if (repoId && entry) {
    write(repoId, { ...entry, refreshedFor: null })
  }
}
