// Local (glass build): what a Branches-view row says instead of a commit message (Paweł,
// 2026-11-17: "an easy way to see just branches without commit messages to understand the big
// merging picture"). A merge names the branch it took in, a fork point the branches that start
// there (or nothing, when no name is known: Paweł, 2026-11-17, of "fork on main" three times
// running, "what does it even mean, is it necessary?"; the line already says it is main), and a
// quiet number says how many commits the row stands for ("the number of commits could stay
// visible always ... but not with word commits - it repeats too much"). Nothing here is a button:
// the whole row opens its commits.
import React from 'react'
import { GitFork, GitMerge, GitPullRequestArrow } from 'lucide-react'
import type { GitHistoryGraphColorId } from '../../../../../shared/git/history/git-history-types'
import { graphColor } from '@/components/right-sidebar/source-control/sync/git-history-graph-svg'
import type { GitGraphLaneRow } from './git-graph-branch-layout'
import { useGitGraphBranchColour } from './git-graph-branch-colour-context'
import type { GitGraphSegment } from './git-graph-segment-commits'
import { gitGraphMergedPullRequest } from './git-graph-lane-names'
import { GitGraphPullRequestName } from './git-graph-ref-chips'
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

/** A landed pull request: "landed #12 Title", the title in full. */
function LandedPullRequest({
  pr,
  color
}: {
  pr: GitGraphPullRequest
  color?: GitHistoryGraphColorId
}): React.JSX.Element {
  // One run of text, so a long title wraps after "landed #N" instead of dropping below it.
  return (
    <span className="min-w-0 break-words" title={pr.url}>
      <GitPullRequestArrow className="mr-1 inline size-3.5 align-[-2px]" />
      landed{' '}
      {color && (
        <span
          aria-hidden
          className="mr-1 inline-block size-1.5 rounded-full align-middle"
          style={{ background: graphColor(color) }}
        />
      )}
      <span className="font-medium text-foreground">
        <span className="font-semibold tabular-nums">#{pr.number}</span> {pr.title}
      </span>
    </span>
  )
}

export function GitGraphOutlineSummary({
  row,
  laneName,
  mergedName,
  starts,
  pinned,
  segments,
  hasRefs
}: {
  row: GitGraphLaneRow
  laneName?: string
  mergedName?: string
  starts: string[]
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
  // A pull request squashed onto a pinned branch is that branch's merge in a squash workflow.
  const landed =
    !merged && pullRequest && laneName && pinned.includes(laneName) ? pullRequest : undefined
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
        // A PR GitHub did not list (older than its search reaches): its number still says it landed.
        <span className="inline-flex flex-wrap items-center gap-1" title={row.historyItem.subject}>
          <GitPullRequestArrow className="size-3.5 shrink-0" />
          landed <span className="font-semibold text-foreground tabular-nums">{pullRequest}</span>
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
        <span className="inline-flex items-center gap-1" title={row.historyItem.subject}>
          <GitPullRequestArrow className="size-3.5 shrink-0" />
          landed <span className="font-medium text-foreground">{landed}</span>
        </span>
      )}
      {!merged && !landed && !hasRefs && starts.length > 0 && (
        <span className="inline-flex flex-wrap items-center gap-1">
          <GitFork className="size-3.5 shrink-0" />
          start of
          {starts.map((name) => (
            <BranchName
              key={name}
              name={name}
              color={branchColour(name)}
              pr={gitGraphPullRequestForBranch(prs, name)}
            />
          ))}
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
