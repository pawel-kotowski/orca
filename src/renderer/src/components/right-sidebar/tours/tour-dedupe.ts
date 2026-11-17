import type { TourGroup, ListedTour } from './use-repo-tours'

/** Same file, same text: older servers send no hash, so their title and steps stand in for it. */
function tourKey(tour: ListedTour): string {
  const content =
    tour.contentHash ??
    JSON.stringify([tour.title, tour.stamp, tour.steps.map((step) => step.title)])
  return `${tour.relativePath}\u0000${content}`
}

/**
 * Each tour once: a copy another workspace has unchanged (every workspace of a repo has its
 * committed `docs/tours`) collapses into the first group that lists it, which records where else
 * it is. Groups keep their order, so the workspace on screen claims its tours first.
 */
export function dedupeTourGroups(groups: readonly TourGroup[]): TourGroup[] {
  const firstSeen = new Map<string, { group: number; tour: number }>()
  const alsoIn = new Map<string, string[]>()
  const kept = groups.map((group, groupIndex) => {
    if (!group.tours) {
      return group
    }
    const tours: ListedTour[] = []
    for (const tour of group.tours) {
      const key = tourKey(tour)
      if (firstSeen.has(key)) {
        alsoIn.get(key)?.push(group.label)
        continue
      }
      firstSeen.set(key, { group: groupIndex, tour: tours.length })
      alsoIn.set(key, [])
      tours.push(tour)
    }
    return { ...group, tours }
  })
  return kept.map((group) =>
    group.tours
      ? {
          ...group,
          tours: group.tours.map((tour) => {
            const others = alsoIn.get(tourKey(tour)) ?? []
            return others.length > 0 ? { ...tour, alsoIn: others } : tour
          })
        }
      : group
  )
}
