// Local (glass build): what a Branches-view row says instead of a commit message (Paweł,
// 2026-11-17: "an easy way to see just branches without commit messages to understand the big
// merging picture"). A merge names the branch it took in, a fork point says nothing (Paweł,
// 2026-11-17, of "fork on main": "what does it even mean, is it necessary?"; 2026-11-27, of the
// "start of <branches>" that replaced it: "remove also these start of markers it doesnt make
// sense"; the lines leaving the row already show it), and a
// quiet number says how many commits the row stands for ("the number of commits could stay
// visible always ... but not with word commits - it repeats too much"). Nothing here is a button:
// the whole row opens its commits.
import React from 'react'
import { GitMerge } from 'lucide-react'
import type { GitHistoryGraphColorId } from '../../../../../shared/git/history/git-history-types'
import { graphColor } from '@/components/right-sidebar/source-control/sync/git-history-graph-svg'
import type { GitGraphLaneRow } from './git-graph-branch-layout'
import { useGitGraphBranchColour } from './git-graph-branch-colour-context'
import type { GitGraphSegment } from './git-graph-segment-commits'
import { gitGraphMergedPullRequest } from './git-graph-lane-names'
import { GitGraphPullRequestName } from './git-graph-ref-chips'
import { GitGraphPrStateIcon, gitGraphPrStateText } from './git-graph-pr-state'
import { cn } from '@/lib/class-names'
import {
  gitGraphPullRequestForBranch,
  gitGraphPullRequestForMerge,
  useGitGraphPullRequestContext,
  type GitGraphPullRequest
} from './use-git-graph-pull-requests'

export function GitGraphCount({
  count,
  title
}: {
  count: number
  title: string
}): React.JSX.Element {
  return (
    <span
      title={title}
      className="rounded-full bg-foreground/10 px-1.5 text-[10.5px] leading-4 text-foreground/85 tabular-nums"
    >
      {count}
    </span>
  )
}

function BranchName({
  name,
  color,
  pr
}: {
  name: string
  color?: GitHistoryGraphColorId
  /** Names read as pull requests: this branch's. */
  pr?: GitGraphPullRequest
}): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 font-medium text-foreground">
      {color && (
        <span
          aria-hidden
          className="size-1.5 rounded-full"
          style={{ background: graphColor(color) }}
        />
      )}
      {pr ? (
        <span title={name}>
          <GitGraphPullRequestName pr={pr} />
        </span>
      ) : (
        <span className="break-all">{name}</span>
      )}
    </span>
  )
}

/** A landed pull request: its icon, then "#12 Title" in full (no "landed": Paweł, 2026-11-23). */
function LandedPullRequest({
  pr,
  color
}: {
  pr: GitGraphPullRequest
  color?: GitHistoryGraphColorId
}): React.JSX.Element {
  // One run of text, so a long title wraps after "#N" instead of dropping below it. Landed is
  // merged: the merge icon and colour, as on a merged branch's name (git-graph-pr-state.tsx).
  return (
    <span className="min-w-0 break-words" title={pr.url}>
      <GitGraphPrStateIcon state="merged" className="mr-1 inline size-3.5 align-[-2px]" />
      {color && (
        <span
          aria-hidden
          className="mr-1 inline-block size-1.5 rounded-full align-middle"
          style={{ background: graphColor(color) }}
        />
      )}
      <span className={cn('font-medium', gitGraphPrStateText('merged'))}>
        <span className="font-semibold tabular-nums">#{pr.number}</span> {pr.title}
      </span>
    </span>
  )
}

export function GitGraphOutlineSummary({
  row,
  laneName,
  mergedName,
  pinned,
  segments,
  hasRefs
}: {
  row: GitGraphLaneRow
  laneName?: string
  mergedName?: string
  /** A merge into a pinned branch needs no "into": its line already says so. */
  pinned: string[]
  segments: GitGraphSegment[]
  hasRefs: boolean
}): React.JSX.Element {
  const branchColour = useGitGraphBranchColour()
  const prs = useGitGraphPullRequestContext()
  const merged = row.historyItem.parentIds.length > 1
  // The merged line's lane: the last one to that parent (a short PR's line ends where main's does).
  const mergedColor = merged
    ? row.outputSwimlanes.findLast((lane) => lane.id === row.historyItem.parentIds[1])?.color
    : undefined
  const pullRequest = gitGraphMergedPullRequest(row.historyItem.subject)
  // A pull request squashed onto a pinned branch is that branch's merge in a squash workflow. A
  // fork point with no branch on it reads the same: on an unpinned base (a test branch every PR
  // starts from) it is the PR that landed there, and with "start of" gone it says nothing else.
  const landed =
    !merged && pullRequest && ((laneName && pinned.includes(laneName)) || !hasRefs)
      ? pullRequest
      : undefined
  // Names read as pull requests: a merge or a squash is the PR it landed.
  const landedPr = merged
    ? gitGraphPullRequestForMerge(prs, pullRequest, mergedName)
    : landed
      ? gitGraphPullRequestForMerge(prs, landed, undefined)
      : undefined
  const [own, ...mergedIn] = segments
  const mergedCount = mergedIn.reduce((sum, segment) => sum + segment.ids.length, 0)
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-foreground/80">
      {merged && landedPr && (
        <span className="inline-flex flex-wrap items-center gap-1">
          <LandedPullRequest
            pr={landedPr}
            color={mergedName ? branchColour(mergedName, mergedColor) : mergedColor}
          />
          {mergedCount > 0 && (
            <GitGraphCount count={mergedCount} title={`${mergedCount} commits merged in`} />
          )}
          {laneName && !hasRefs && !pinned.includes(laneName) && (
            <>
              into{' '}
              <BranchName
                name={laneName}
                color={row.nodeColor}
                pr={gitGraphPullRequestForBranch(prs, laneName, row.historyItem.id)}
              />
            </>
          )}
        </span>
      )}
      {merged && !landedPr && prs.on && pullRequest && (
        // A PR GitHub did not list (older than its search reaches): its number from the message.
        <span className="inline-flex flex-wrap items-center gap-1" title={row.historyItem.subject}>
          <GitGraphPrStateIcon state="merged" className="size-3.5" />
          <span className={cn('font-semibold tabular-nums', gitGraphPrStateText('merged'))}>
            {pullRequest}
          </span>
          {mergedName && (
            <BranchName name={mergedName} color={branchColour(mergedName, mergedColor)} />
          )}
          {mergedCount > 0 && (
            <GitGraphCount count={mergedCount} title={`${mergedCount} commits merged in`} />
          )}
        </span>
      )}
      {merged && !landedPr && !(prs.on && pullRequest) && (
        <span className="inline-flex flex-wrap items-center gap-1">
          <GitMerge className="size-3.5 shrink-0" />
          merged{' '}
          {mergedName ? (
            <BranchName
              name={mergedName}
              color={branchColour(mergedName, mergedColor)}
              pr={gitGraphPullRequestForBranch(prs, mergedName)}
            />
          ) : (
            (pullRequest ?? 'a branch')
          )}
          {mergedName && pullRequest && <span>{pullRequest}</span>}
          {mergedCount > 0 && (
            <GitGraphCount count={mergedCount} title={`${mergedCount} commits merged in`} />
          )}
          {laneName && !hasRefs && !pinned.includes(laneName) && (
            <>
              into{' '}
              <BranchName
                name={laneName}
                color={row.nodeColor}
                pr={gitGraphPullRequestForBranch(prs, laneName, row.historyItem.id)}
              />
            </>
          )}
        </span>
      )}
      {landed && landedPr && <LandedPullRequest pr={landedPr} />}
      {landed && !landedPr && (
        <span
          className={cn('inline-flex items-center gap-1', gitGraphPrStateText('merged'))}
          title={row.historyItem.subject}
        >
          <GitGraphPrStateIcon state="merged" className="size-3.5" />
          {!prs.on && 'landed '}
          <span className="font-medium">{landed}</span>
        </span>
      )}
      {/* A lone commit needs no count: a "1" on every stacked branch is noise. */}
      {own && own.ids.length > 1 && (
        <GitGraphCount
          count={own.ids.length}
          title={`${own.ids.length} commit${own.ids.length === 1 ? '' : 's'} on this line down to the next branch point. Click the row to see them.`}
        />
      )}
    </span>
  )
}
