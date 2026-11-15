import { ArrowDownUp, History } from 'lucide-react'
import { showStepAsItWas, type PlayingTour } from './tour-player'
import { tourSnapshotsAvailable } from './tour-library-client'

function ChoiceButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded px-1.5 py-px text-[11px] leading-snug ${active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}
    >
      {children}
    </button>
  )
}

/** How the step's code compares with the tour's commit; a stale step can be shown as it was. */
export function TourStepFreshnessLine({
  tour,
  index,
  asItWas
}: {
  tour: PlayingTour
  index: number
  asItWas: boolean
}): React.JSX.Element | null {
  const freshness = tour.steps[index]?.freshness
  if (!tour.commit || (freshness?.state !== 'moved' && freshness?.state !== 'stale')) {
    return null
  }
  const short = tour.commit.sha.slice(0, 7)
  const stale = freshness.state === 'stale'
  const step = tour.steps[index]!
  const canShowOld =
    stale &&
    (freshness.staleRequests ?? []).some((at) => step.requests[at]?.kind === 'code') &&
    tourSnapshotsAvailable(tour.context.worktreeId, tour.context.worktreePath)
  const Icon = stale ? History : ArrowDownUp
  return (
    <div className="flex shrink-0 items-start gap-1 text-[11px] leading-snug text-muted-foreground">
      <Icon className={`mt-px size-3 shrink-0 ${stale ? 'text-status-warning' : ''}`} />
      <span className="min-w-0 flex-1">
        {/* Why: a stale detail already names the commit ("changed since abc1234"). */}
        {stale ? 'Stale' : `Moved since ${short}`}
        {freshness.detail ? `: ${freshness.detail}` : ''}
      </span>
      {canShowOld ? (
        <span className="flex shrink-0 items-center gap-0.5" role="group" aria-label="Which code">
          <ChoiceButton active={asItWas} onClick={() => void showStepAsItWas(tour.context, true)}>
            As it was
          </ChoiceButton>
          <ChoiceButton active={!asItWas} onClick={() => void showStepAsItWas(tour.context, false)}>
            Now
          </ChoiceButton>
        </span>
      ) : null}
    </div>
  )
}
