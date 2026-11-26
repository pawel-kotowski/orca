import { useState, useSyncExternalStore } from 'react'
import { Presentation, RotateCw } from 'lucide-react'
import { useAppStore } from '@/store/index'
import { findWorktreeById } from '@/store/github/refresh/worktree-refresh'
import {
  playingTours,
  subscribeTours,
  toursVersion,
  type PlayingTour
} from '@/agent-show/tour/tour-player'
import { TOURS_FOLDER } from '../../../../../shared/agent-show/agent-show-tour-library'
import { TourListRow } from './TourListRow'
import { playListedTour, resumeTour } from './tour-panel-play'
import { useRepoTours, type ListedTour, type TourGroup } from './use-repo-tours'
import { byNewestTour, tourPlace } from './tour-row-labels'
import { dedupeTourGroups } from './tour-dedupe'

function SectionTitle({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="px-3 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  )
}

/** The tour playing or paused, one click away from its strip: the same as the "Tour paused" pill. */
function PlayingTourRow({ tour }: { tour: PlayingTour }): React.JSX.Element {
  const workspace = useAppStore(
    (state) => findWorktreeById(state, tour.context.worktreeId)?.displayName ?? 'its workspace'
  )
  return (
    <button
      type="button"
      onClick={() => void resumeTour(tour)}
      className="mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent"
    >
      <Presentation className="size-3.5 shrink-0 text-[var(--ai-action-accent)]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-foreground">{tour.title}</span>
        <span className="block truncate text-2xs text-muted-foreground">
          Step {tour.index + 1} of {tour.steps.length} · {tour.playing ? 'playing' : 'paused'} in{' '}
          {workspace}
        </span>
      </span>
      <span className="shrink-0 text-2xs text-muted-foreground">Resume</span>
    </button>
  )
}

type PlayTour = (group: TourGroup, tour: ListedTour, step: number) => void

function TourRows({
  rows,
  busy,
  onPlay
}: {
  rows: { group: TourGroup; tour: ListedTour; place: string | null }[]
  busy: boolean
  onPlay: PlayTour
}): React.JSX.Element {
  return (
    <div className="flex flex-col px-1.5">
      {rows.map(({ group, tour, place }) => (
        <TourListRow
          key={`${group.key}\u0000${tour.file}`}
          tour={tour}
          place={place}
          playable={!busy}
          onPlay={(step) => onPlay(group, tour, step)}
        />
      ))}
    </div>
  )
}

/** The workspace on screen: its tours, or why there are none to show yet. */
function CurrentTours({
  group,
  busy,
  onPlay
}: {
  group: TourGroup
  busy: boolean
  onPlay: PlayTour
}): React.JSX.Element {
  if (group.error) {
    return (
      <p className="px-3 py-1 text-2xs text-muted-foreground">
        Could not read tours: {group.error}
      </p>
    )
  }
  if (!group.tours) {
    return <p className="px-3 py-1 text-2xs text-muted-foreground">Reading tours…</p>
  }
  if (group.tours.length === 0) {
    return (
      <p className="px-3 py-1 text-xs text-muted-foreground">
        No tours here yet. Agents write them to <code className="font-mono">{TOURS_FOLDER}/</code>{' '}
        when you ask for a walk-through with /explain.
      </p>
    )
  }
  const rows = group.tours.map((tour) => ({ group, tour, place: null })).sort(byNewestTour)
  return <TourRows rows={rows} busy={busy} onPlay={onPlay} />
}

/** The project's tours: this workspace's, then every other workspace's on every machine, newest first. */
export default function ToursPanel({ isVisible }: { isVisible: boolean }): React.JSX.Element {
  useSyncExternalStore(subscribeTours, toursVersion)
  const { groups: listedGroups, refresh } = useRepoTours(isVisible)
  // Why: every workspace of a repo has its committed tours; list each copy once.
  const groups = dedupeTourGroups(listedGroups)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const workspaceIds = new Set(groups.map((group) => group.worktreeId))
  const playing = playingTours().filter((tour) => workspaceIds.has(tour.context.worktreeId))
  const onPlay: PlayTour = (group, tour, step) => {
    setBusy(true)
    setNotice(null)
    void playListedTour(group, tour, step)
      .then(setNotice, (error: unknown) =>
        setNotice(error instanceof Error ? error.message : String(error))
      )
      .finally(() => setBusy(false))
  }
  const others = groups
    .filter((group) => !group.current)
    .flatMap((group) =>
      (group.tours ?? []).map((tour) => ({ group, tour, place: tourPlace(group) }))
    )
    .sort(byNewestTour)
  const unreadable = groups.filter((group) => !group.current && group.error)
  const current = groups.find((group) => group.current)
  return (
    <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col overflow-y-auto pb-3">
      <div className="flex items-center justify-between pl-3 pr-1.5 pt-1.5">
        <span className="text-2xs text-muted-foreground">
          Tours from <code className="font-mono">{TOURS_FOLDER}/</code>
        </span>
        <button
          type="button"
          aria-label="Refresh tours"
          title="Refresh tours"
          onClick={refresh}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RotateCw className="size-3.5" />
        </button>
      </div>
      {notice ? <p className="mx-3 mt-2 text-xs text-status-warning-text">{notice}</p> : null}
      {playing.length > 0 ? (
        <>
          <SectionTitle>Playing</SectionTitle>
          {playing.map((tour) => (
            <PlayingTourRow
              key={`${tour.context.worktreeId}:${tour.context.ownerTabId}`}
              tour={tour}
            />
          ))}
        </>
      ) : null}
      {current ? (
        <>
          <SectionTitle>This workspace</SectionTitle>
          <CurrentTours group={current} busy={busy} onPlay={onPlay} />
        </>
      ) : (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          Open a workspace to see its tours.
        </p>
      )}
      {others.length > 0 ? (
        <>
          <SectionTitle>Other workspaces of this project</SectionTitle>
          <TourRows rows={others} busy={busy} onPlay={onPlay} />
        </>
      ) : null}
      {unreadable.map((group) => (
        <p key={group.key} className="px-3 py-1 text-2xs text-muted-foreground">
          Could not read the tours in {tourPlace(group)}: {group.error}
        </p>
      ))}
    </div>
  )
}
