// Local (glass build): branch and tag names in the Detailed and Branches views of the Git Graph,
// always in full (Paweł, 2026-11-17: "sometimes i dont see full branches names"). A local branch
// and its remote twins on the same commit read as one name with the remotes after it, so `main`
// pushed to `origin` is one label, not two. A click follows the branch: every commit off its line
// fades.
import React from 'react'
import { Cloud, Tag } from 'lucide-react'
import { cn } from '@/lib/class-names'
import type {
  GitHistoryGraphColorId,
  GitHistoryItemRef
} from '../../../../../shared/git/history/git-history-types'
import { graphColor } from '@/components/right-sidebar/source-control/sync/git-history-graph-svg'
import { gitGraphBranchName } from './git-graph-lane-names'
import { useGitGraphBranchColour } from './git-graph-branch-colour-context'

export type GitGraphRefGroup = {
  key: string
  kind: 'branch' | 'remote' | 'tag'
  /** The branch name without a remote (`feature/x`), or the tag. */
  name: string
  /** The remote of a remote-only branch (`origin`). */
  remote?: string
  /** Remotes holding this branch at this same commit. */
  syncedRemotes: string[]
  isHead: boolean
  title: string
}

function remoteOf(ref: GitHistoryItemRef): string {
  const slash = ref.name.indexOf('/')
  return slash === -1 ? '' : ref.name.slice(0, slash)
}

export function groupGitGraphRefs(
  refs: readonly GitHistoryItemRef[],
  currentRefId?: string
): GitGraphRefGroup[] {
  const groups: GitGraphRefGroup[] = []
  const localByName = new Map<string, GitGraphRefGroup>()
  for (const ref of refs) {
    if (ref.category === 'branches') {
      const group: GitGraphRefGroup = {
        key: ref.id,
        kind: 'branch',
        name: ref.name,
        syncedRemotes: [],
        isHead: ref.id === currentRefId,
        title: ref.id
      }
      localByName.set(ref.name, group)
      groups.push(group)
    }
  }
  for (const ref of refs) {
    if (ref.category === 'remote branches') {
      const name = gitGraphBranchName(ref)
      if (!name) {
        continue // origin/HEAD only points at another remote branch.
      }
      const local = localByName.get(name)
      if (local) {
        local.syncedRemotes.push(remoteOf(ref))
        local.title += `\n${ref.id}`
        continue
      }
      groups.push({
        key: ref.id,
        kind: 'remote',
        name,
        remote: remoteOf(ref),
        syncedRemotes: [],
        isHead: false,
        title: ref.id
      })
    } else if (ref.category === 'tags') {
      groups.push({
        key: ref.id,
        kind: 'tag',
        name: ref.name,
        syncedRemotes: [],
        isHead: false,
        title: ref.id
      })
    }
  }
  return groups
}

export function GitGraphRefChip({
  group,
  laneColor,
  size = 'md',
  focused,
  onFocusBranch
}: {
  group: GitGraphRefGroup
  laneColor?: GitHistoryGraphColorId
  size?: 'md' | 'lg'
  focused?: boolean
  onFocusBranch?: (name: string) => void
}): React.JSX.Element {
  const branchColour = useGitGraphBranchColour()
  const dotColor = group.kind === 'tag' ? undefined : branchColour(group.name, laneColor)
  const clickable = group.kind !== 'tag' && onFocusBranch
  const content = (
    <>
      {group.kind === 'tag' ? (
        <Tag className="size-3 shrink-0 text-foreground/80" />
      ) : (
        <span
          aria-hidden
          className={cn('shrink-0 rounded-full', size === 'lg' ? 'size-2' : 'size-1.5')}
          style={{ background: dotColor ? graphColor(dotColor) : 'var(--muted-foreground)' }}
        />
      )}
      {/* One piece: a flex gap between remote and name read as "origin/ x". */}
      <span className="break-all">
        {group.remote && <span className="text-foreground/72">{group.remote}/</span>}
        {group.name}
      </span>
      {group.isHead && (
        <span className="rounded-sm bg-foreground/10 px-1 text-[9.5px] font-semibold tracking-wide">
          HEAD
        </span>
      )}
      {group.syncedRemotes.length > 0 && (
        <span
          className="inline-flex items-center gap-0.5 text-foreground/72"
          title={`Also on ${group.syncedRemotes.join(', ')} at this commit`}
        >
          <Cloud className="size-3" />
          {group.syncedRemotes.join(' ')}
        </span>
      )}
    </>
  )
  const className = cn(
    'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border text-left',
    size === 'lg' ? 'px-2 text-[12.5px] leading-[18px]' : 'px-1.5 text-[11.5px] leading-[18px]',
    group.isHead ? 'font-semibold text-foreground' : 'text-foreground',
    focused
      ? 'border-ring bg-accent'
      : 'border-foreground/25 bg-foreground/[0.06] dark:bg-black/20',
    clickable && 'cursor-pointer hover:border-ring'
  )
  return clickable ? (
    <button
      type="button"
      title={`${group.title}\nClick: follow this branch`}
      className={className}
      onClick={(event) => {
        event.stopPropagation()
        onFocusBranch(group.name)
      }}
    >
      {content}
    </button>
  ) : (
    <span title={group.title} className={className}>
      {content}
    </span>
  )
}
