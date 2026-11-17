// Local (glass build): which branch each commit of the Git Graph belongs to, so a lane has a name
// even where no branch label sits on it. A branch's name runs down its first-parent line from its
// tip; a merge names the branch it took in from its own message ("Merge branch 'x'", "Merge pull
// request #1 from owner/x"), so a branch deleted after its merge is still named. Where two lines
// meet (a fork point) the long-lived branch (main, develop, …) keeps the commit.
import type {
  GitHistoryItem,
  GitHistoryItemRef
} from '../../../../../shared/git/history/git-history-types'

/**
 * Branches that live for the whole project, in order: they own a fork point over any feature
 * branch, and an earlier one over a later one. The Git Graph's pinned lanes replace this list.
 */
export const GIT_GRAPH_DEFAULT_TRUNKS = ['main', 'master', 'trunk', 'develop', 'development', 'dev']

/**
 * How strongly a name claims a commit: a trunk's line beats a branch tip's, which beats a merge's
 * guess; trunks rank among themselves by their order.
 */
const MERGE_CLAIM = 1
const REF_CLAIM = 2
const TRUNK_CLAIM = 3

/** A branch name without its remote: `origin/feature/x` → `feature/x`. Local names stay as they are. */
export function gitGraphBranchName(ref: GitHistoryItemRef): string | undefined {
  if (ref.category === 'branches') {
    return ref.name
  }
  if (ref.category === 'remote branches') {
    const slash = ref.name.indexOf('/')
    const name = slash === -1 ? ref.name : ref.name.slice(slash + 1)
    return name === 'HEAD' ? undefined : name
  }
  return undefined
}

/** The branch a merge commit took in, read from git's, GitHub's and GitLab's merge messages. */
export function gitGraphMergedBranchName(subject: string): string | undefined {
  const branch = /^Merge (?:remote-tracking )?branch '([^']+)'/.exec(subject)
  if (branch) {
    const name = branch[1]!
    // A remote-tracking merge names `origin/x`; the branch is `x`.
    return subject.startsWith('Merge remote-tracking') ? name.replace(/^[^/]+\//, '') : name
  }
  const pull = /^Merge pull request #\d+ from ([^\s]+)/.exec(subject)
  if (pull) {
    // GitHub writes `owner/branch`; the branch itself may contain slashes.
    const from = pull[1]!
    const slash = from.indexOf('/')
    return slash === -1 ? from : from.slice(slash + 1)
  }
  const gitlab = /^Merge (?:branch )?'?([^'\s]+)'? into '?([^'\s]+)'?/.exec(subject)
  return gitlab?.[1]
}

/** A merge's pull request, when its message ends the way GitHub writes it: "… (#5137)". */
export function gitGraphMergedPullRequest(subject: string): string | undefined {
  const number =
    /\(#(\d+)\)\s*$/.exec(subject)?.[1] ?? /^Merge pull request #(\d+)/.exec(subject)?.[1]
  return number ? `#${number}` : undefined
}

/** The branch a merge went into, when its message says ("… into 'main'"). */
export function gitGraphMergeTargetName(subject: string): string | undefined {
  return / into '?([^'\s]+)'?\s*$/.exec(subject)?.[1]
}

type Claim = number

function claimOf(name: string, fromRef: boolean, trunks: readonly string[]): Claim {
  const trunk = trunks.indexOf(name)
  if (trunk !== -1) {
    return TRUNK_CLAIM + trunks.length - trunk
  }
  return fromRef ? REF_CLAIM : MERGE_CLAIM
}

function ownBranch(
  item: GitHistoryItem,
  trunks: readonly string[]
): { name: string; claim: Claim } | undefined {
  let best: { name: string; claim: Claim } | undefined
  for (const ref of item.references ?? []) {
    const name = gitGraphBranchName(ref)
    if (!name) {
      continue
    }
    const claim = claimOf(name, true, trunks)
    // A local branch wins a tie with a remote one of another name; a trunk wins over both.
    if (!best || claim > best.claim || (claim === best.claim && ref.category === 'branches')) {
      best = { name, claim }
    }
  }
  return best
}

/**
 * Names every commit by the branch whose line it is on. Items come newest first, children before
 * parents, as the graph draws them; a commit nothing names is left out.
 */
export function gitGraphLaneNames(
  items: readonly GitHistoryItem[],
  trunks: readonly string[] = GIT_GRAPH_DEFAULT_TRUNKS
): Map<string, string> {
  const claims = new Map<string, { name: string; claim: Claim }>()
  const names = new Map<string, string>()
  const offer = (id: string, name: string, claim: Claim): void => {
    const current = claims.get(id)
    if (!current || claim > current.claim) {
      claims.set(id, { name, claim })
    }
  }
  for (const item of items) {
    const own = ownBranch(item, trunks)
    const inherited = claims.get(item.id)
    const mergeTarget =
      item.parentIds.length > 1 ? gitGraphMergeTargetName(item.subject) : undefined
    const fromTarget = mergeTarget
      ? { name: mergeTarget, claim: claimOf(mergeTarget, false, trunks) }
      : undefined
    const lane = [own, inherited, fromTarget].reduce<{ name: string; claim: Claim } | undefined>(
      (best, next) => (next && (!best || next.claim > best.claim) ? next : best),
      undefined
    )
    if (lane) {
      names.set(item.id, lane.name)
    }
    const [first, ...others] = item.parentIds
    if (first !== undefined && lane) {
      offer(first, lane.name, lane.claim)
    }
    const merged = others.length > 0 ? gitGraphMergedBranchName(item.subject) : undefined
    if (merged) {
      // Only the first merged parent is the named branch; an octopus merge's others stay unnamed.
      offer(others[0]!, merged, claimOf(merged, false, trunks))
    }
  }
  return names
}
