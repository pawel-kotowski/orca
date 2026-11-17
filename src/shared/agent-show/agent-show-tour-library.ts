import type { AgentShowRequestOf } from './agent-show-contract'

type TourPayload = NonNullable<AgentShowRequestOf<'tour'>['tour']>

/**
 * A tour file as main read it: its steps ready to play (moved ranges at their new lines), each
 * step's freshness against the stamped commit, and every problem that keeps it from playing.
 */
export type AgentShowLoadedTour = TourPayload & {
  /** Worktree-relative when the file is inside the worktree, else as given. */
  relativePath: string
  /** The commit id in the stamp line, even when the repository does not have that commit. */
  stamp: string | null
  problems: string[]
  /** What could not be checked and why, for the agent ("not stamped", "commit not found"). */
  notes: string[]
}

export type AgentShowTourList = {
  tours: (AgentShowLoadedTour & {
    modifiedAt: number
    /** A hash of the file's text, so the panel shows one copy of a tour every workspace has. */
    contentHash?: string
  })[]
}

/** What `--stamp` writes: the commit, and the files that differ from it on disk right now. */
export type AgentShowTourStampInfo = {
  sha: string
  subject: string
  uncommitted: string[]
  problems: string[]
}

/**
 * The file as it was at the stamped commit. Its text, not a path: the desktop showing the tour
 * may not be the machine that has the worktree (a box), so the desktop writes its own copy.
 */
export type AgentShowTourSnapshot = {
  commit: string
  /** Worktree-relative, `/`-separated. */
  path: string
  text: string
}

/** Where tours live in a worktree; `/explain` writes them here. */
export const TOURS_FOLDER = 'docs/tours'
