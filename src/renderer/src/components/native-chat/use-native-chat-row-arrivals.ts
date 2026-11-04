import { useMemo, useState, type CSSProperties } from 'react'
import { nativeChatSlotKey, type NativeChatTranscriptSlot } from './native-chat-transcript-slots'
import type { NativeChatLiveSession } from './use-native-chat-live-session'
import {
  createNativeChatRowArrivalTracker,
  nativeChatRowArrivalFadeElapsed,
  trackNativeChatRowArrivals,
  type NativeChatRowArrivals
} from '../../../../shared/native-chat/transcript/native-chat-row-arrivals'

export type { NativeChatRowArrivals }

const clock = (): number => performance.now()

/** Track rows that arrive while this transcript is open; the tracker outlives every row mount. */
export function useNativeChatRowArrivals(
  slots: readonly NativeChatTranscriptSlot[],
  waitingSlots: readonly NativeChatTranscriptSlot[],
  loadedIds: ReadonlySet<string>,
  session: Pick<
    NativeChatLiveSession,
    'agent' | 'sessionId' | 'readPhase' | 'olderHistoryGeneration'
  >
): NativeChatRowArrivals {
  const [tracker] = useState(createNativeChatRowArrivalTracker)
  // Waiting rows count too, so a queued message moving into its turn does not arrive twice.
  const rowKeys = useMemo(
    () => [...slots, ...waitingSlots].map(nativeChatSlotKey),
    [slots, waitingSlots]
  )
  const { agent, sessionId, readPhase, olderHistoryGeneration } = session
  return trackNativeChatRowArrivals(
    tracker,
    {
      rowKeys,
      loadedIds,
      settled: readPhase === 'ready',
      generation: `${agent}:${sessionId ?? ''}:${olderHistoryGeneration}`
    },
    clock
  )
}

export type NativeChatRowArrivalProps = {
  'data-native-chat-arrival'?: ''
  style?: CSSProperties
}

const NO_ARRIVAL: NativeChatRowArrivalProps = {}

/** Props that fade a newly arrived row in once (native-chat-appearance.css); fixed at mount. */
export function useNativeChatRowArrivalProps(
  arrivals: NativeChatRowArrivals | undefined,
  rowKey: string
): NativeChatRowArrivalProps {
  const [props] = useState<NativeChatRowArrivalProps>(() => {
    const elapsed = nativeChatRowArrivalFadeElapsed(arrivals, rowKey, performance.now())
    // A remount mid-fade resumes where the last mount left off instead of starting over.
    return elapsed === null
      ? NO_ARRIVAL
      : { 'data-native-chat-arrival': '', style: { animationDelay: `${-Math.round(elapsed)}ms` } }
  })
  return props
}
