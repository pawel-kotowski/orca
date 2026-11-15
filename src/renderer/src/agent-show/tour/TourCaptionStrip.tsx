import { useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Pause,
  Play,
  TriangleAlert,
  X
} from 'lucide-react'
import { stepHoldMs } from './tour-steps'
import { setTourPlaying, stepTour, endTour, type PlayingTour } from './tour-player'
import type { StripSize } from './tour-strip-placement'
import type { DockDragHandle } from './use-tour-dock-drag'
import { TourStepFreshnessLine } from './TourStepFreshnessLine'

const DOTS_MAX_STEPS = 5
const DOTS_MIN_WIDTH_PX = 460

/** A caption's inline `code` and **bold**, as the chat draws them; everything else is text. */
function CaptionText({ text }: { text: string }): React.JSX.Element {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean)
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith('`') ? (
          <code key={index} className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">
            {part.slice(1, -1)}
          </code>
        ) : part.startsWith('**') ? (
          <strong key={index} className="font-medium text-foreground">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  )
}

/**
 * Every step's text in one grid cell, only the current one visible: the cell is as tall as the
 * longest, so the strip keeps one height and its controls never jump between steps.
 */
function StackedStepText({
  texts,
  index,
  className
}: {
  texts: readonly string[]
  index: number
  className: string
}): React.JSX.Element {
  return (
    <span className={`grid ${className}`}>
      {texts.map((text, textIndex) => (
        <span
          key={textIndex}
          aria-hidden={textIndex !== index}
          className={`[grid-area:1/1] ${textIndex === index ? '' : 'invisible'}`}
        >
          <CaptionText text={text} />
        </span>
      ))}
    </span>
  )
}

function StripButton({
  label,
  onClick,
  disabled,
  children
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

/** The time left on an auto-playing step, as a thin bar that empties. */
function HoldBar({
  step,
  playing,
  advanceAt
}: {
  step: PlayingTour['steps'][number]
  playing: boolean
  advanceAt: number | null
}): React.JSX.Element | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!advanceAt) {
      return
    }
    const timer = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(timer)
  }, [advanceAt])
  if (!playing || !advanceAt) {
    return null
  }
  const left = Math.max(0, Math.min(1, (advanceAt - now) / stepHoldMs(step)))
  return (
    <div className="absolute inset-x-0 bottom-0 h-0.5 bg-border">
      <div
        className="h-full bg-[var(--ai-action-accent)] transition-[width] duration-200 ease-linear"
        style={{ width: `${left * 100}%` }}
      />
    </div>
  )
}

/** One tour's caption and controls; its title row moves the dock it floats in. */
export function TourCaptionStrip({
  tour,
  index,
  playing,
  advanceAt,
  warning,
  asItWas,
  size,
  version,
  handle
}: {
  tour: PlayingTour
  /** Copied out of `tour`, which the player mutates: the props must change when the step does. */
  index: number
  playing: boolean
  advanceAt: number | null
  /** What this step showed that the check did not predict. */
  warning: string | null
  /** The step's stale code is shown as it was at the tour's commit. */
  asItWas: boolean
  size: StripSize
  /** Changes on every tour change, so a memoized strip still redraws. */
  version: number
  /** Drags the dock by the title row. */
  handle: DockDragHandle
}): React.JSX.Element {
  const step = tour.steps[index]!
  const last = index === tour.steps.length - 1
  const onKey = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowRight') {
      void stepTour(tour.context, 'next')
    } else if (event.key === 'ArrowLeft') {
      void stepTour(tour.context, 'back')
    } else if (event.key === ' ') {
      setTourPlaying(tour.context, !playing)
    } else {
      return
    }
    event.preventDefault()
  }
  return (
    <div
      data-orca-tour-strip=""
      data-tour-version={version}
      tabIndex={0}
      onKeyDown={onKey}
      className="pointer-events-auto relative flex flex-col gap-1 overflow-hidden rounded-xl border border-border bg-card px-3 py-2 shadow-md outline-none"
      style={{ width: size.width, maxHeight: size.maxHeight }}
    >
      <div
        {...handle}
        title="Drag to move; double-click to put it back"
        className="-ml-1.5 flex shrink-0 cursor-grab select-none items-start gap-2 active:cursor-grabbing"
      >
        <GripVertical className="mt-[5px] size-3.5 shrink-0 text-muted-foreground/70" />
        <StackedStepText
          texts={tour.steps.map((s) => s.title)}
          index={index}
          className="min-w-0 flex-1 break-words py-[3px] text-[13px] font-medium leading-snug text-foreground"
        />
        {tour.steps.length <= DOTS_MAX_STEPS && size.width >= DOTS_MIN_WIDTH_PX ? (
          <div
            className="flex h-6 items-center gap-1"
            aria-label={`Step ${index + 1} of ${tour.steps.length}`}
          >
            {tour.steps.map((s, dotIndex) => (
              <button
                key={`${dotIndex}-${s.title}`}
                type="button"
                title={`${dotIndex + 1}. ${s.title}`}
                aria-label={`Go to step ${dotIndex + 1}`}
                onClick={() => void stepTour(tour.context, 'step', dotIndex + 1)}
                className={`size-1.5 rounded-full ${dotIndex === index ? 'bg-[var(--ai-action-accent)]' : 'bg-border hover:bg-muted-foreground'}`}
              />
            ))}
          </div>
        ) : (
          <span className="flex h-6 shrink-0 items-center text-xs tabular-nums text-muted-foreground">
            {index + 1} / {tour.steps.length}
          </span>
        )}
        <StripButton
          label="Back"
          disabled={index === 0}
          onClick={() => void stepTour(tour.context, 'back')}
        >
          <ChevronLeft className="size-4" />
        </StripButton>
        <StripButton
          label={playing ? 'Pause' : 'Play'}
          disabled={last && !playing}
          onClick={() => setTourPlaying(tour.context, !playing)}
        >
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </StripButton>
        <StripButton
          label="Next"
          disabled={last}
          onClick={() => void stepTour(tour.context, 'next')}
        >
          <ChevronRight className="size-4" />
        </StripButton>
        <StripButton label="End tour" onClick={() => endTour(tour.context)}>
          <X className="size-3.5" />
        </StripButton>
      </div>
      <div className="scrollbar-sleek min-h-0 overflow-y-auto text-xs leading-snug text-muted-foreground">
        <StackedStepText texts={tour.steps.map((s) => s.caption)} index={index} className="" />
      </div>
      <TourStepFreshnessLine tour={tour} index={index} asItWas={asItWas} />
      {warning ? (
        <p className="flex shrink-0 items-start gap-1 text-[11px] leading-snug text-muted-foreground">
          <TriangleAlert className="mt-px size-3 shrink-0 text-status-warning" />
          <span>{warning}</span>
        </p>
      ) : null}
      <HoldBar step={step} playing={playing} advanceAt={advanceAt} />
    </div>
  )
}
