// Local (glass build): which branch each commit of the Git Graph belongs to, so a lane has a name
// even where no branch label sits on it. A branch's name runs down its first-parent line from its
// tip; a merge names the branch it took in from its own message ("Merge branch 'x'", "Merge pull
// request #1 from owner/x"), so a branch deleted after its merge is still named. Where two lines
// meet (a fork point) the long-lived branch (main, develop, …) keeps the commit.
import type {
  GitHistoryItem,
  GitHistoryItemRef
} from '../../../../../shared/git/history/git-history-types'

/** Branches that live for the whole project: they own a fork point over any feature branch. */
const TRUNK_NAMES = new Set(['main', 'master', 'trunk', 'develop', 'development', 'dev'])

/** How strongly a name claims a commit: a trunk's line beats a branch tip's, which beats a merge's guess. */
const enum Claim {
  Merge = 1,
  Ref = 2,
  Trunk = 3
}

export function isGitGraphTrunkName(name: string): boolean {
  return TRUNK_NAMES.has(name)
}

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

/** The branch a merge went into, when its message says ("… into 'main'"). */
export function gitGraphMergeTargetName(subject: string): string | undefined {
  return / into '?([^'\s]+)'?\s*$/.exec(subject)?.[1]
}

function claimOf(name: string, fromRef: boolean): Claim {
  return isGitGraphTrunkName(name) ? Claim.Trunk : fromRef ? Claim.Ref : Claim.Merge
}

function ownBranch(item: GitHistoryItem): { name: string; claim: Claim } | undefined {
  let best: { name: string; claim: Claim } | undefined
  for (const ref of item.references ?? []) {
    const name = gitGraphBranchName(ref)
    if (!name) {
      continue
    }
    const claim = claimOf(name, true)
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
export function gitGraphLaneNames(items: readonly GitHistoryItem[]): Map<string, string> {
  const claims = new Map<string, { name: string; claim: Claim }>()
  const names = new Map<string, string>()
  const offer = (id: string, name: string, claim: Claim): void => {
    const current = claims.get(id)
    if (!current || claim > current.claim) {
      claims.set(id, { name, claim })
    }
  }
  for (const item of items) {
    const own = ownBranch(item)
    const inherited = claims.get(item.id)
    const mergeTarget =
      item.parentIds.length > 1 ? gitGraphMergeTargetName(item.subject) : undefined
    const fromTarget = mergeTarget
      ? { name: mergeTarget, claim: claimOf(mergeTarget, false) }
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
      offer(others[0]!, merged, claimOf(merged, false))
    }
  }
  return names
}
