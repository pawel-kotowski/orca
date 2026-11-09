import { translate } from '@/i18n/i18n'

/** Nothing listed at all, or (grouped by status) an empty Inbox above Working and Standing by. */
export function ActivityListEmptyState({
  empty,
  inboxEmpty
}: {
  empty: boolean
  inboxEmpty: boolean
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
  return inboxEmpty ? (
    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
      {translate('components.activity.inboxEmpty', 'Nothing needs you right now.')}
    </div>
  ) : null
}
