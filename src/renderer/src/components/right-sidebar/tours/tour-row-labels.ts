import { getIntlLocale } from '@/i18n/i18n'
import type { ListedTour, TourGroup } from './use-repo-tours'

/** Where a tour is: its workspace, "archived" when it is, and its machine when not the one on screen. */
export function tourPlace(group: Pick<TourGroup, 'label' | 'archived' | 'hostLabel'>): string {
  return [group.label, group.archived ? 'archived' : null, group.hostLabel]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}

/**
 * When the tour was written: the file's creation time on its host, else its stamp commit's date
 * (a host whose file system keeps no birth time, or an older server), else its last change.
 */
export function tourCreatedAt(tour: Pick<ListedTour, 'createdAt' | 'commit' | 'modifiedAt'>): {
  at: number
  source: 'created' | 'stamped' | 'modified'
} {
  if (tour.createdAt) {
    return { at: tour.createdAt, source: 'created' }
  }
  if (tour.commit?.committedAt) {
    return { at: tour.commit.committedAt, source: 'stamped' }
  }
  return { at: tour.modifiedAt, source: 'modified' }
}

/** "24 Nov 08:16"; the year too when it is not this one. */
export function formatTourTime(at: number, now: number = Date.now()): string {
  const date = new Date(at)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  const day = date.toLocaleDateString(getIntlLocale(), {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' })
  })
  const time = date.toLocaleTimeString(getIntlLocale(), { hour: '2-digit', minute: '2-digit' })
  return `${day} ${time}`
}

/** Newest first, by when each tour was written. */
export function byNewestTour<T extends { tour: ListedTour }>(a: T, b: T): number {
  return tourCreatedAt(b.tour).at - tourCreatedAt(a.tour).at
}
