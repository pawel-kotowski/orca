// Local (glass build): a pull request's description in the Git Graph, rendered the way GitHub
// shows it (Paweł, 2026-11-27: "also add option to view pr description nicely rendered as in
// github"). A Branches row that stands for a pull request (one that landed it, or with PR titles
// on, a branch tip that has one) opens a Description toggle above its commits. The body comes from
// Orca's own pull request details (a box's repo asks its host) and is drawn by the same GitHub
// markdown renderer as Orca's pull request page: tables, task lists, callouts, code, images. The
// toggle's state is remembered, so once open every PR row shows its description.
import React, { useEffect, useState } from 'react'
import { ChevronRight, ExternalLink, LoaderCircle } from 'lucide-react'
import CommentMarkdown from '@/components/comment-markdown/CommentMarkdown'
import { cn } from '@/lib/class-names'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { useAppStore } from '@/store'
import {
  findGitHubWorkItemRepo,
  getGitHubSourceTarget,
  getGitHubWorkItemRequestContext
} from '@/store/github/work-items/work-item-routing'
import type { GitHubWorkItemDetails } from '../../../../../shared/github/work-items/work-item-types'
import type { GitHistoryItem } from '../../../../../shared/git/history/git-history-types'
import { gitGraphBranchName, gitGraphMergedPullRequest } from './git-graph-lane-names'
import {
  gitGraphPullRequestForBranch,
  gitGraphPullRequestForMerge,
  type GitGraphPullRequests
} from './use-git-graph-pull-requests'

const OPEN_KEY = 'orca.gitGraph.prDescription'

export type GitGraphRowPullRequest = { number: number; url?: string }

/**
 * The pull request a commit stands for: the one its message landed ("… (#12)", "Merge pull request
 * #12 …"), a merge's branch's merged PR, or with PR titles on, a branch tip's PR.
 */
export function gitGraphRowPullRequest(
  item: GitHistoryItem,
  prs: GitGraphPullRequests,
  mergedName?: string
): GitGraphRowPullRequest | undefined {
  const fromMessage = gitGraphMergedPullRequest(item.subject)
  const merged = item.parentIds.length > 1
  const landed = gitGraphPullRequestForMerge(prs, fromMessage, merged ? mergedName : undefined)
  if (landed) {
    return { number: landed.number, url: landed.url }
  }
  if (fromMessage) {
    return { number: Number(fromMessage.slice(1)) }
  }
  for (const ref of item.references ?? []) {
    const name = gitGraphBranchName(ref)
    const pr = name ? gitGraphPullRequestForBranch(prs, name, item.id) : undefined
    if (pr) {
      return { number: pr.number, url: pr.url }
    }
  }
  return undefined
}

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === 'open'
  } catch {
    return false
  }
}

/** The pull request's details, read the way the graph's PR list reads its repo. */
export function loadGitGraphPullRequestDetails(
  repoId: string,
  number: number
): Promise<GitHubWorkItemDetails | null> {
  const state = useAppStore.getState()
  const repo = state.repos.find((entry) => entry.id === repoId)
  if (!repo) {
    return Promise.reject(new Error('This repository is not in Orca.'))
  }
  const owner = findGitHubWorkItemRepo(state, repo.id, repo.path) ?? repo
  const context = getGitHubWorkItemRequestContext(
    state,
    getGitHubSourceTarget(state, owner),
    repo.id,
    repo.path
  )
  if (context.target.kind === 'environment') {
    return callRuntimeRpc<GitHubWorkItemDetails | null>(
      { kind: 'environment', environmentId: context.target.environmentId },
      'github.workItemDetails',
      { repo: context.target.runtimeRepoId, number, type: 'pr' },
      { timeoutMs: 30_000 }
    )
  }
  return window.api.gh.workItemDetails({
    repoPath: context.repoPath,
    repoId: context.repoId,
    number,
    type: 'pr'
  })
}

/** `https://github.com/acme/app/pull/12` → acme/app, so `#34` and `@user` in the body link there. */
export function gitGraphPullRequestRepo(
  url: string | undefined
): { owner: string; repo: string; host?: string } | null {
  const match = url ? /^https?:\/\/([^/]+)\/([^/]+)\/([^/]+)\/pull\/\d+/.exec(url) : null
  if (!match) {
    return null
  }
  const [, host, owner, repo] = match
  return host === 'github.com'
    ? { owner: owner!, repo: repo! }
    : { owner: owner!, repo: repo!, host }
}

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; details: GitHubWorkItemDetails | null }

function useGitGraphPullRequestDetails(repoId: string | null, number: number): Loaded {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })
  useEffect(() => {
    if (!repoId) {
      return
    }
    let live = true
    setLoaded({ status: 'loading' })
    loadGitGraphPullRequestDetails(repoId, number)
      .then((details) => live && setLoaded({ status: 'ready', details }))
      .catch((error: unknown) => {
        if (live) {
          setLoaded({
            status: 'error',
            message: error instanceof Error ? error.message : String(error)
          })
        }
      })
    return () => {
      live = false
    }
  }, [number, repoId])
  return loaded
}

export function GitGraphPullRequestDescription({
  repoId,
  number,
  url
}: {
  repoId: string
  number: number
  /** The PR's page, when the graph's PR list knows it; otherwise it comes with the details. */
  url?: string
}): React.JSX.Element {
  const [open, setOpenState] = useState(readOpen)
  const setOpen = (next: boolean): void => {
    setOpenState(next)
    try {
      localStorage.setItem(OPEN_KEY, next ? 'open' : 'closed')
    } catch {
      // A blocked storage only forgets the choice.
    }
  }
  const loaded = useGitGraphPullRequestDetails(open ? repoId : null, number)
  const details = loaded.status === 'ready' ? loaded.details : null
  const link = url ?? details?.item.url
  return (
    <div className="pb-1" data-git-graph-pr-description={number}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-medium text-foreground/85 hover:bg-accent/50"
          onClick={(event) => {
            event.stopPropagation()
            setOpen(!open)
          }}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
          Description
        </button>
        {link && (
          <button
            type="button"
            title={link}
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation()
              openAppHttpLink(link, { event })
            }}
          >
            <ExternalLink className="size-3" />
            Open on GitHub
          </button>
        )}
      </div>
      {open && (
        <div
          className="mt-1 mr-1 rounded-md border border-border bg-background/70 px-4 py-3 text-sm leading-relaxed text-foreground"
          onClick={(event) => event.stopPropagation()}
        >
          {loaded.status === 'loading' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              Loading the description of #{number}…
            </div>
          )}
          {loaded.status === 'error' && (
            <div className="text-xs text-destructive">
              The description of #{number} did not load: {loaded.message}
            </div>
          )}
          {loaded.status === 'ready' && !details && (
            <div className="text-xs text-muted-foreground">
              GitHub has no pull request #{number} for this repository.
            </div>
          )}
          {details &&
            (details.body.trim() ? (
              <CommentMarkdown
                content={details.body}
                bodyImageUrls={details.bodyImageUrls}
                variant="document"
                githubRepo={gitGraphPullRequestRepo(link)}
                className="min-w-0 max-w-full overflow-hidden break-words [&_a]:break-all [&_code]:break-words [&_pre]:max-w-full"
              />
            ) : (
              <span className="italic text-muted-foreground">No description provided.</span>
            ))}
        </div>
      )}
    </div>
  )
}
