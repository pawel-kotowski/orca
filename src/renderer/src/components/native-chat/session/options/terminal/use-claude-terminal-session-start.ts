import { useEffect, useState } from 'react'
import { useAgentStatusSelector } from '@/runtime/agent-status/use-agent-status'
import { useAppStore } from '../../../../../store/index'
import type { ClaudeSessionEffortSettings } from '../../../../../../../shared/native-chat/claude-session-effort-types'

/**
 * What a terminal Claude chat knows of its session besides the screen and the transcript: the
 * effort its hooks report, and the model and effort it started with (its flags, else its config
 * folder's saved ones). An idle agent restored at startup has its session only in the sleeping
 * record, so both are read there too; without that its pill named no effort until its next turn.
 */
export function useClaudeTerminalSessionStart(paneKey: string | undefined): {
  hookEffort: string | null
  start: ClaudeSessionEffortSettings | null
} {
  const liveEffort = useAgentStatusSelector(
    paneKey,
    (entry) => entry?.providerSession?.effort ?? null
  )
  const liveSessionId = useAgentStatusSelector(
    paneKey,
    (entry) => entry?.providerSession?.id ?? null
  )
  const sleepingEffort = useAppStore((state) =>
    paneKey
      ? (state.sleepingAgentSessionsByPaneKey?.[paneKey]?.providerSession?.effort ?? null)
      : null
  )
  const sleepingSessionId = useAppStore((state) =>
    paneKey ? (state.sleepingAgentSessionsByPaneKey?.[paneKey]?.providerSession?.id ?? null) : null
  )
  const hookEffort = liveEffort ?? sleepingEffort
  const sessionId = liveSessionId ?? sleepingSessionId
  const [read, setRead] = useState<{
    sessionId: string
    settings: ClaudeSessionEffortSettings
  } | null>(null)
  useEffect(() => {
    const readSettings = window.api?.nativeChat?.getClaudeSessionEffort
    if (!sessionId || !readSettings) {
      return
    }
    let cancelled = false
    void readSettings(sessionId)
      .then((settings) => {
        if (!cancelled) {
          setRead({ sessionId, settings })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [sessionId])
  return { hookEffort, start: read && read.sessionId === sessionId ? read.settings : null }
}
