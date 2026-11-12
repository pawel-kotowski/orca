import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import {
  ACTIVITY_CARD_PARTS,
  toggleActivityCardPart,
  useActivityCardHiddenParts,
  type ActivityCardPart
} from './activity-card-parts'
import { ActivityAutoStandByControl } from './activity-auto-stand-by-control'

function partLabel(part: ActivityCardPart): string {
  switch (part) {
    case 'status':
      return translate('components.activity.cardParts.status', 'Status')
    case 'repo':
      return translate('components.activity.cardParts.repo', 'Repo')
    case 'machine':
      return translate('components.activity.cardParts.machine', 'Machine')
    case 'time':
      return translate('components.activity.cardParts.time', 'Time')
    case 'workspace':
      return translate('components.activity.cardParts.workspace', 'Workspace')
    case 'conversation':
      return translate('components.activity.cardParts.conversation', 'Agent')
    case 'output':
      return translate('components.activity.cardParts.output', 'Output')
    case 'latestPrompt':
      return translate('components.activity.cardParts.latestPrompt', 'Prompt')
    case 'firstPrompt':
      return translate('components.activity.cardParts.firstPrompt', 'First prompt')
  }
}

/**
 * One switch per card piece, each a single click; a pressed switch shows that piece. The
 * auto-move hours sit at the end (Paweł, 2026-11-09: "move auto after option ui to card content
 * switches menu"), out of the Standing by header.
 */
export function ActivityCardPartsBar(): React.JSX.Element {
  const hidden = useActivityCardHiddenParts()
  return (
    <div
      role="toolbar"
      aria-label={translate('components.activity.cardParts.label', 'Card contents')}
      className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/60 px-2 py-1.5"
    >
      {ACTIVITY_CARD_PARTS.map((part) => {
        const shown = !hidden.includes(part)
        return (
          <button
            key={part}
            type="button"
            aria-pressed={shown}
            onClick={() => toggleActivityCardPart(part)}
            className={cn(
              'h-5 cursor-pointer rounded border px-1.5 text-[10.5px] font-medium leading-[18px] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring',
              shown
                ? 'border-transparent bg-foreground/[0.1] text-foreground hover:bg-foreground/[0.14]'
                : 'border-dashed border-border text-muted-foreground/70 hover:text-muted-foreground'
            )}
          >
            {partLabel(part)}
          </button>
        )
      })}
      <span className="ml-auto">
        <ActivityAutoStandByControl />
      </span>
    </div>
  )
}
