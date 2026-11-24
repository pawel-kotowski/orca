import { useContext, useRef, type ReactNode } from 'react'
import {
  NativeChatCrewContext,
  useNativeChatCrew
} from '../orchestration-crew/use-native-chat-crew'
import { NativeChatWorkersStrip } from './NativeChatWorkersStrip'
import { usePublishActivityLinesHeight } from './use-publish-activity-lines-height'

/** Where a structured chat's one-line strips sit: above the message box, as a terminal chat's. */
export function NativeChatStructuredActivityArea({
  hasWork,
  strip,
  paneKey
}: {
  hasWork: boolean
  /** The session's lines, which also list its workers. */
  strip: ReactNode
  paneKey: string
}): React.JSX.Element {
  // An enabled crew panel draws its own strip in the dock.
  const crew = useNativeChatCrew(useContext(NativeChatCrewContext))
  return hasWork && !crew ? <>{strip}</> : <WorkersOnly paneKey={paneKey} />
}

function WorkersOnly({ paneKey }: { paneKey: string }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  usePublishActivityLinesHeight(ref)
  return (
    <div ref={ref} data-native-chat-activity-lines="" className="flex shrink-0 flex-col">
      <NativeChatWorkersStrip paneKey={paneKey} />
    </div>
  )
}
