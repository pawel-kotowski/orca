import React from 'react'
import { useTranslate } from '@/i18n/use-translate'
import type { AgentPaneThread } from './activity-thread-types'

/** When the agent compacted its conversation during its current finish, if it did. */
export function activityThreadCompactedAt(thread: AgentPaneThread): number | undefined {
  const entry = thread.currentAgentEntry ?? thread.paneEntry
  return entry?.state === 'done' ? entry.compactedAt : undefined
}

/**
 * A finished agent that compacted its conversation stays where it was and says so (Paweł,
 * 2026-11-16: "should stay where it was with stamp compacted that dissapears when conversation is
 * continued"). The next turn's status carries no compaction, so the mark goes by itself.
 */
export function ActivityCompactedMark({
  thread
}: {
  thread: AgentPaneThread
}): React.JSX.Element | null {
  const t = useTranslate()
  if (activityThreadCompactedAt(thread) === undefined) {
    return null
  }
  return (
    <span
      data-activity-compacted=""
      title={t(
        'components.activity.compactedTitle',
        'Claude compacted this conversation while it was idle. The mark goes when the conversation continues.'
      )}
      className="shrink-0 whitespace-nowrap rounded border border-border/60 px-1 text-[10.5px] leading-4 text-muted-foreground"
    >
      {t('components.activity.compacted', 'Compacted')}
    </span>
  )
}
