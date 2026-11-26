import { useState } from 'react'
import { ChevronRight, Play } from 'lucide-react'
import { cn } from '@/lib/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { AgentShowTourFreshness } from '../../../../../shared/agent-show/agent-show-contract'
import { tourFreshnessCounts } from '../../../../../shared/agent-show/tour-freshness'
import { formatTourTime, tourCreatedAt } from './tour-row-labels'
import type { ListedTour } from './use-repo-tours'

type Tone = 'quiet' | 'warning'

/** The tour's state in a few words: fresh, N moved, N stale, not stamped, or why it cannot play. */
function tourState(tour: ListedTour): { label: string; tone: Tone } {
  if (tour.problems.length > 0) {
    return { label: 'cannot play', tone: 'warning' }
  }
  if (!tour.stamp) {
    return { label: 'not stamped', tone: 'quiet' }
  }
  const counts = tourFreshnessCounts(tour.steps)
  if (counts.stale > 0) {
    return { label: `${counts.stale} stale`, tone: 'warning' }
  }
  if (counts.moved > 0) {
    return { label: `${counts.moved} moved`, tone: 'quiet' }
  }
  return counts.unchecked === tour.steps.length
    ? { label: 'not checked', tone: 'quiet' }
    : { label: 'fresh', tone: 'quiet' }
}

const STEP_STATE: Record<AgentShowTourFreshness['state'], string> = {
  fresh: 'fresh',
  moved: 'moved',
  stale: 'stale',
  unchecked: 'not checked',
  unstamped: ''
}

function StateText({ label, tone }: { label: string; tone: Tone }): React.JSX.Element {
  return (
    <span
      className={cn(
        'shrink-0 text-2xs',
        tone === 'warning' ? 'text-status-warning-text' : 'text-muted-foreground'
      )}
    >
      {label}
    </span>
  )
}

/** When the tour was written, and where when it is not in the workspace on screen; the stamp on hover. */
function WhereAndWhen({
  tour,
  place
}: {
  tour: ListedTour
  place: string | null
}): React.JSX.Element {
  const written = tourCreatedAt(tour)
  const time = formatTourTime(written.at)
  const stamp = tour.stamp
    ? `Stamped at ${tour.stamp.slice(0, 7)}${tour.commit?.subject ? ` ${tour.commit.subject}` : ' (not in this repository)'}`
    : 'Not stamped'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="min-w-0 break-words text-2xs text-muted-foreground">
          {place ? `${place} · ` : ''}
          <time dateTime={new Date(written.at).toISOString()}>{time}</time>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {WRITTEN_LABEL[written.source]} {time}. {stamp}
      </TooltipContent>
    </Tooltip>
  )
}

const WRITTEN_LABEL = {
  created: 'Written',
  stamped: 'Stamped',
  modified: 'Last changed'
} as const

/** The other workspaces with this same tour; it plays in the one it is listed under. */
function AlsoIn({ workspaces }: { workspaces: string[] }): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="shrink-0 text-2xs text-muted-foreground">also in {workspaces.length}</span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        The same tour is in {workspaces.join(', ')}
      </TooltipContent>
    </Tooltip>
  )
}

/** One tour: click plays it from step 1; the chevron lists its steps, each playable. */
export function TourListRow({
  tour,
  place,
  playable,
  onPlay
}: {
  tour: ListedTour
  /** Its workspace (and machine), for a tour listed outside the workspace on screen. */
  place: string | null
  /** False while another play is starting. */
  playable: boolean
  onPlay: (stepIndex: number) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const state = tourState(tour)
  return (
    <div className="flex flex-col">
      <div className="group flex items-start gap-1 rounded-md py-1 pr-1.5 hover:bg-accent">
        <button
          type="button"
          aria-label={open ? 'Hide steps' : 'Show steps'}
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
        </button>
        <button
          type="button"
          disabled={!playable}
          onClick={() => onPlay(0)}
          title={tour.relativePath}
          className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
        >
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 break-words text-[13px] leading-5 text-foreground">
              {tour.title}
            </span>
            <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
              {tour.steps.length} {tour.steps.length === 1 ? 'step' : 'steps'}
            </span>
          </span>
          <span className="flex flex-wrap items-baseline gap-x-2">
            <WhereAndWhen tour={tour} place={place} />
            {tour.alsoIn?.length ? <AlsoIn workspaces={tour.alsoIn} /> : null}
            <StateText {...state} />
          </span>
        </button>
      </div>
      {open ? (
        <ol className="mb-1 ml-5 flex flex-col">
          {tour.problems.map((problem) => (
            <li key={problem} className="px-1.5 py-0.5 text-2xs text-status-warning-text">
              {problem}
            </li>
          ))}
          {tour.steps.map((step, index) => {
            const freshness = step.freshness?.state ?? 'unstamped'
            return (
              <li key={`${index}-${step.title}`}>
                <button
                  type="button"
                  disabled={!playable}
                  onClick={() => onPlay(index)}
                  title={step.freshness?.detail}
                  className="group/step flex h-6 w-full items-center gap-1.5 rounded-md px-1.5 text-left hover:bg-accent"
                >
                  <span className="w-4 shrink-0 text-2xs tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {step.title}
                  </span>
                  <Play className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover/step:opacity-100" />
                  <StateText
                    label={STEP_STATE[freshness]}
                    tone={freshness === 'stale' ? 'warning' : 'quiet'}
                  />
                </button>
              </li>
            )
          })}
        </ol>
      ) : null}
    </div>
  )
}
