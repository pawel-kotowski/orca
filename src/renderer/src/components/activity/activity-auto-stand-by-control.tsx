import { useEffect, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import { setActivityAutoStandByHours, useActivityAutoStandByHours } from './activity-auto-stand-by'

function parseHours(text: string): number | null {
  const value = Number.parseFloat(text.replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * The auto-move timer, in Standing by's own header (Paweł, 2026-11-09: "automove option (num of
 * hours) should be easily configurable in activity view"). Empty or 0 turns it off.
 */
export function ActivityAutoStandByControl(): React.JSX.Element {
  const hours = useActivityAutoStandByHours()
  const [draft, setDraft] = useState(hours === null ? '' : String(hours))
  useEffect(() => setDraft(hours === null ? '' : String(hours)), [hours])
  const commit = (): void => {
    const next = parseHours(draft)
    setDraft(next === null ? '' : String(next))
    if (next !== hours) {
      setActivityAutoStandByHours(next)
    }
  }
  const title = translate(
    'components.activity.autoStandBy.title',
    'Seen, finished agents move here on their own after this many hours. Empty: only when you clear them.'
  )
  return (
    // Why the stops: the header around it opens and closes the drawer on click and Enter.
    <label
      title={title}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      className="flex shrink-0 items-center gap-1 text-[10.5px] font-medium normal-case tracking-normal text-muted-foreground"
    >
      {translate('components.activity.autoStandBy.label', 'auto after')}
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder={translate('components.activity.autoStandBy.off', 'off')}
        aria-label={title}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !isImeOwnedKeyboardEvent(event)) {
            event.currentTarget.blur()
          }
        }}
        className="h-5 w-9 rounded border border-border/80 bg-background/60 px-1 text-center text-[10.5px] tabular-nums text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-ring"
      />
      h
    </label>
  )
}
