import { useSyncExternalStore } from 'react'
import type { NativeChatSubagentTranscript } from '../../../../shared/native-chat/native-chat-subagent-transcripts'

// Why a store: the transcript list reads a terminal chat's Claude subagents (and polls while they
// run); the task strip above the message box lists the running ones from that same read instead of
// polling the host a second time.

const NONE: readonly NativeChatSubagentTranscript[] = []
const byPane = new Map<string, readonly NativeChatSubagentTranscript[]>()
const listeners = new Set<() => void>()

export function publishNativeChatClaudeSubagents(
  paneKey: string,
  subagents: readonly NativeChatSubagentTranscript[]
): void {
  if ((byPane.get(paneKey) ?? NONE) === subagents) {
    return
  }
  if (subagents.length === 0) {
    byPane.delete(paneKey)
  } else {
    byPane.set(paneKey, subagents)
  }
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The subagents the pane's transcript list last read; empty until it reads any. */
export function useNativeChatClaudeSubagentTranscripts(
  paneKey: string
): readonly NativeChatSubagentTranscript[] {
  const read = (): readonly NativeChatSubagentTranscript[] => byPane.get(paneKey) ?? NONE
  return useSyncExternalStore(subscribe, read, read)
}
