import { useCallback, useMemo } from 'react'
import { useAppStore } from '@/store'
import { getWorktreePathBasenameFromId } from '../../../../shared/worktree/id'
import type { WorktreeLineage } from '../../../../shared/worktree/lineage-types'
import type { ActivityThreadGroup, AgentPaneThread } from './threads/activity-thread-types'
import { readViewLayout, useViewLayoutValue, writeViewLayout } from './view-layout-memory'

/**
 * Slack agents in the activity view (Paweł, 2026-11-18: a Slack badge on each section bar shows
 * and hides that section's Slack agents; the count badge beside it does the same for every other
 * agent). The Slack listener (`~/projects/slack-agent`) makes every task's and every proactive
 * agent's workspace a child of its own workspace, always named `slack-agent`, with a comment
 * "Slack task …" / "proactive agent …"; a task's own workers are children of the task's workspace.
 */
const SLACK_LISTENER_WORKSPACE = 'slack-agent'
const SLACK_WORKSPACE_COMMENT = /^(Slack task |proactive agent )/
const MAX_LINEAGE_DEPTH = 16

export function isSlackAgentWorkspace(
  worktreeId: string,
  comment: string | undefined,
  lineageByWorktreeId: Readonly<Record<string, WorktreeLineage>>
): boolean {
  if (comment && SLACK_WORKSPACE_COMMENT.test(comment)) {
    return true
  }
  let id: string | undefined = worktreeId
  for (let depth = 0; id && depth < MAX_LINEAGE_DEPTH; depth += 1) {
    if (getWorktreePathBasenameFromId(id) === SLACK_LISTENER_WORKSPACE) {
      return true
    }
    id = lineageByWorktreeId[id]?.parentWorktreeId
  }
  return false
}

export type ActivitySectionKind = 'slack' | 'other'
type SectionKinds = Readonly<Record<string, Partial<Record<ActivitySectionKind, boolean>>>>

const KINDS_KEY = 'activitySectionKinds'
const NO_KINDS: SectionKinds = {}

function parseSectionKinds(value: unknown): SectionKinds | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as SectionKinds)
    : undefined
}

export function isActivitySectionKindShown(
  kinds: SectionKinds,
  groupKey: string,
  kind: ActivitySectionKind
): boolean {
  return kinds[groupKey]?.[kind] !== false
}

/** Saved per section in the view layout, so it survives restarts and new builds. */
export function useActivitySectionKinds(): SectionKinds {
  return useViewLayoutValue(KINDS_KEY, parseSectionKinds, NO_KINDS).value
}

export function useToggleActivitySectionKind(
  groupKey: string
): (kind: ActivitySectionKind) => void {
  return useCallback(
    (kind) => {
      const current = parseSectionKinds(readViewLayout(KINDS_KEY)) ?? NO_KINDS
      const shown = isActivitySectionKindShown(current, groupKey, kind)
      const section = { ...current[groupKey] }
      // Why only the hidden value is stored: shown is the default, so the record stays small.
      if (shown) {
        section[kind] = false
      } else {
        delete section[kind]
      }
      const next: Record<string, Partial<Record<ActivitySectionKind, boolean>>> = { ...current }
      if (Object.keys(section).length > 0) {
        next[groupKey] = section
      } else {
        delete next[groupKey]
      }
      writeViewLayout(KINDS_KEY, Object.keys(next).length > 0 ? next : undefined)
    },
    [groupKey]
  )
}

/**
 * Each group's Slack and other counts (before hiding, so a hidden kind still shows its number),
 * its threads narrowed to the kinds shown, and every pane a hidden kind took out.
 */
export function applyActivitySectionKinds(
  groups: ActivityThreadGroup[],
  kinds: SectionKinds,
  isSlack: (thread: AgentPaneThread) => boolean
): { groups: ActivityThreadGroup[]; hiddenPaneKeys: ReadonlySet<string> } {
  const hiddenPaneKeys = new Set<string>()
  const next = groups.map((group) => {
    const showSlack = isActivitySectionKindShown(kinds, group.key, 'slack')
    const showOther = isActivitySectionKindShown(kinds, group.key, 'other')
    let slack = 0
    const threads = group.threads.filter((thread) => {
      const slackThread = isSlack(thread)
      if (slackThread) {
        slack += 1
      }
      if (slackThread ? showSlack : showOther) {
        return true
      }
      hiddenPaneKeys.add(thread.paneKey)
      return false
    })
    return {
      ...group,
      threads,
      kindCounts: {
        slack,
        other: group.threads.length - slack,
        slackShown: showSlack,
        otherShown: showOther
      }
    }
  })
  return { groups: next, hiddenPaneKeys }
}

export function useActivitySectionKindFilter(groups: ActivityThreadGroup[]): {
  groups: ActivityThreadGroup[]
  hiddenPaneKeys: ReadonlySet<string>
} {
  const kinds = useActivitySectionKinds()
  const lineageByWorktreeId = useAppStore((state) => state.worktreeLineageById)
  return useMemo(() => {
    const cache = new Map<string, boolean>()
    const isSlack = (thread: AgentPaneThread): boolean => {
      const { id, comment } = thread.worktree
      let slack = cache.get(id)
      if (slack === undefined) {
        slack = isSlackAgentWorkspace(id, comment, lineageByWorktreeId ?? {})
        cache.set(id, slack)
      }
      return slack
    }
    return applyActivitySectionKinds(groups, kinds, isSlack)
  }, [groups, kinds, lineageByWorktreeId])
}
