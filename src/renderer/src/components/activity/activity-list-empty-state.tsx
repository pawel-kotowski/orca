import { translate } from '@/i18n/i18n'
import type { ActivityThreadGroup } from './threads/activity-thread-types'

/** Nothing listed at all, or (grouped by status) an empty Inbox above Working and Standing by. */
export function ActivityListEmptyState({
  empty,
  inboxGroups
}: {
  empty: boolean
  /** The scrolled list's groups when grouped by status (the Inbox), else null. */
  inboxGroups: readonly ActivityThreadGroup[] | null
}): React.JSX.Element | null {
  if (empty) {
    return (
      <div className="px-3 py-8 text-center text-xs text-muted-foreground">
        {translate(
          'auto.components.activity.ActivityPrototypePage.7cd632006b',
          'No agent activity matches these filters.'
        )}
      </div>
    )
  }
  if (!inboxGroups || inboxGroups.some((group) => group.threads.length > 0)) {
    return null
  }
  // Why: cards the section bar's Slack or count badge hides are not "nothing needs you".
  const hidden = inboxGroups.reduce(
    (sum, group) => sum + (group.kindCounts ? group.kindCounts.slack + group.kindCounts.other : 0),
    0
  )
  return (
    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
      {hidden > 0
        ? translate(
            'components.activity.inboxHidden',
            '{{n}} hidden: click the badges on the Inbox bar to show them.',
            { n: hidden }
          )
        : translate('components.activity.inboxEmpty', 'Nothing needs you right now.')}
    </div>
  )
}
