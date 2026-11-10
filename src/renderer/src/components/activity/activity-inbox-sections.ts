import { translate } from '@/i18n/i18n'
import { isClearableActivityThread } from './activity-clear-completed'
import { activityThreadStatusId } from './activity-thread-presentation'
import { byRecentPrompt } from './activity-thread-prompt-time'
import type { ActivityThreadGroup, AgentPaneThread } from './activity-thread-types'

/**
 * The activity view as an inbox (Paweł, 2026-11-09, after comparing it with T3 Code's sidebar):
 * finished agents and agents waiting on you sit in the Inbox at the top; running agents in Working,
 * and the ones you are done with in Standing by, both pinned at the list's foot. Looking at a card
 * never moves it; its X (or the auto-move timer) does.
 */
export const INBOX_GROUP_KEY = 'section:inbox'
export const WORKING_GROUP_KEY = 'section:working'

export type ActivityInboxSection = 'inbox' | 'working' | 'standingBy'

function needsYouRank(thread: AgentPaneThread): number {
  switch (activityThreadStatusId(thread)) {
    case 'waiting':
    case 'permission':
    case 'blocked':
      return 0
    case 'failed':
      return 1
    default:
      return 2
  }
}

/** Where a card belongs by its state alone; a clear or the auto-move timer can still stand it by. */
export function activityThreadSection(thread: AgentPaneThread): ActivityInboxSection {
  // Why unverifiable here: "No recent update" is a running agent gone quiet, not news for the inbox.
  switch (activityThreadStatusId(thread)) {
    case 'working':
    case 'monitoring':
    case 'unverifiable':
      return 'working'
    case 'idle':
      return 'standingBy'
    default:
      return 'inbox'
  }
}

/** A seen, finished card stands by once it has sat `hours` since you looked at it. */
function isAutoStandingBy(
  thread: AgentPaneThread,
  acknowledgedAt: number | undefined,
  hours: number | null,
  now: number
): boolean {
  if (!hours || hours <= 0 || thread.unread || !acknowledgedAt) {
    return false
  }
  return isClearableActivityThread(thread) && now - acknowledgedAt >= hours * 3_600_000
}

/**
 * Cleared (an open agent keeps a stand-in), idle, or moved by the timer: under Standing by. A
 * running agent is always under Working, cleared or not. Why: a monitoring turn adds no event, so
 * a coordinator cleared before it began watching its workers kept only cleared events and sat
 * under Standing by while it worked (Paweł, 2026-11-10: "polish guitar is monitoring tasks and yet
 * is in standing by, should be in working").
 */
export function isActivityThreadStandingBy(
  thread: AgentPaneThread,
  acknowledgedAgentsByPaneKey: Record<string, number>,
  autoStandByHours: number | null,
  now: number
): boolean {
  if (activityThreadSection(thread) === 'working') {
    return false
  }
  return (
    (thread.events.length > 0 && thread.events.every((event) => event.cleared === true)) ||
    activityThreadSection(thread) === 'standingBy' ||
    isAutoStandingBy(thread, acknowledgedAgentsByPaneKey[thread.paneKey], autoStandByHours, now)
  )
}

/** Inbox first (needs you, then failed, then the rest, newest first), then Working (by recent prompt). */
export function buildActivityInboxGroups(threads: AgentPaneThread[]): ActivityThreadGroup[] {
  const inbox: AgentPaneThread[] = []
  const working: AgentPaneThread[] = []
  for (const thread of threads) {
    ;(activityThreadSection(thread) === 'working' ? working : inbox).push(thread)
  }
  inbox.sort((a, b) => needsYouRank(a) - needsYouRank(b) || b.latestTimestamp - a.latestTimestamp)
  working.sort(byRecentPrompt)
  const groups: ActivityThreadGroup[] = [
    {
      key: INBOX_GROUP_KEY,
      label: translate('components.activity.inbox', 'Inbox'),
      threads: inbox
    }
  ]
  if (working.length > 0) {
    groups.push({
      key: WORKING_GROUP_KEY,
      label: translate('components.activity.working', 'Working'),
      threads: working
    })
  }
  return groups
}
