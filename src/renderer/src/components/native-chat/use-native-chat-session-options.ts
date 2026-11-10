import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { AgentType } from '../../../../shared/agent-status/contracts/agent-status-types'
import { getAgentSessionOptionCatalog } from '../../../../shared/agent-session/options/agent-session-option-catalog'
import { matchNativeChatCatalogModelId } from '../../../../shared/native-chat/input/native-chat-session-option-state'
import type { SessionOptionDescriptor } from '../../../../shared/native-chat/input/native-chat-session-options'
import { useAppStore } from '../../store'
import { sayNativeChatSessionOptionTranslated } from './native-chat-session-option-labels-text'
import {
  createNativeChatPtySessionOptions,
  type NativeChatPtySessionOptionsSurface
} from '../../../../shared/native-chat/input/native-chat-pty-session-options'
import type { NativeChatSessionOptionDispatchCommand } from '../../../../shared/native-chat/input/native-chat-session-option-dispatch'
import {
  ensureNativeChatModelEnrichment,
  readNativeChatEnrichedModels,
  subscribeNativeChatEnrichedModels
} from './native-chat-session-option-enrichment'
import {
  discoverNativeChatCatalogModels,
  resolveNativeChatModelDiscoveryContext
} from './native-chat-session-option-discovery'
import {
  claudeTranscriptSessionValues,
  readClaudeSessionOptionsFromTerminalScreen,
  withClaudeHookEffort,
  withClaudeStartingEffort
} from './claude-terminal-session-options'
import type { ClaudeSessionEffortSettings } from '../../../../shared/native-chat/claude-session-effort-types'

import { enqueueSessionOptionSettingsWrite } from './native-chat-session-option-settings-write'

const EMPTY_SNAPSHOT: SessionOptionDescriptor[] = []
const subscribeEmpty = (): (() => void) => () => {}
const getEmptySnapshot = (): SessionOptionDescriptor[] => EMPTY_SNAPSHOT

const CLIENT_SETTINGS_TARGET = { kind: 'local' } as const

export function useNativeChatSessionOptions(args: {
  agent: AgentType
  terminalTabId: string
  targetPtyId: string | null
  dispatchCommand: NativeChatSessionOptionDispatchCommand
  onAgentPicker?: () => void
  readTerminalScreen?: () => string | null
  /** OMP model evidence comes from its hook; Claude uses its terminal frame. */
  paneKey?: string
  /** Claude: the model id of the transcript's newest reply, for when the frame scrolled away. */
  transcriptModel?: string | null
}): {
  surface: NativeChatPtySessionOptionsSurface | null
  snapshot: SessionOptionDescriptor[]
} {
  const {
    agent,
    terminalTabId,
    targetPtyId,
    dispatchCommand,
    onAgentPicker,
    readTerminalScreen,
    paneKey,
    transcriptModel = null
  } = args
  // Claude reports its live effort level on tool and Stop hooks; fresher than the startup frame.
  const hookEffort = useAppStore((state) =>
    paneKey && agent === 'claude'
      ? (state.agentStatusByPaneKey[paneKey]?.providerSession?.effort ?? null)
      : null
  )
  // Until Claude reports an effort, the one it started with (its flag or its config's saved level).
  const claudeSessionId = useAppStore((state) =>
    paneKey && agent === 'claude'
      ? (state.agentStatusByPaneKey[paneKey]?.providerSession?.id ?? null)
      : null
  )
  const [startingEffort, setStartingEffort] = useState<{
    sessionId: string
    settings: ClaudeSessionEffortSettings
  } | null>(null)
  useEffect(() => {
    const read = window.api?.nativeChat?.getClaudeSessionEffort
    if (!claudeSessionId || !read) {
      return
    }
    let cancelled = false
    void read(claudeSessionId)
      .then((settings) => {
        if (!cancelled) {
          setStartingEffort({ sessionId: claudeSessionId, settings })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [claudeSessionId])
  const startingEffortSettings =
    startingEffort && startingEffort.sessionId === claudeSessionId ? startingEffort.settings : null
  const reportedModel = useAppStore((state) =>
    paneKey ? (state.agentStatusByPaneKey[paneKey]?.model ?? null) : null
  )
  const canSwitchOmpModel = useAppStore((state) =>
    paneKey ? state.agentStatusByPaneKey[paneKey]?.modelSwitchCommand === 'orca-model' : false
  )
  // Only changed hook models are new evidence; repeated status pings must not undo newer user picks.
  const appliedReportedModelRef = useRef<string | null>(null)
  // Cache parsed screen text so late discovery can resolve real host model IDs.
  const reportedScreenRef = useRef<string | null>(null)
  const discoveryContext = useMemo(
    () => resolveNativeChatModelDiscoveryContext(terminalTabId),
    [terminalTabId]
  )
  const surface = useMemo(() => {
    // Chat attaches after startup is queued, so a draft picker could no longer change its command.
    if (!targetPtyId) {
      return null
    }
    const scopeKey = targetPtyId ?? terminalTabId
    const discoveredModels = discoveryContext
      ? readNativeChatEnrichedModels(agent, discoveryContext.hostKey)
      : null
    const reportedValues =
      agent === 'claude'
        ? readClaudeSessionOptionsFromTerminalScreen(
            readTerminalScreen?.(),
            discoveredModels ?? undefined
          )
        : null
    return createNativeChatPtySessionOptions({
      agent,
      scopeKey,
      ...(targetPtyId ? { fallbackScopeKey: terminalTabId } : {}),
      // Version-neutral family seeds keep the picker available while host discovery runs or fails.
      ...(discoveryContext ? { initialModels: discoveredModels ?? undefined } : {}),
      mode: targetPtyId ? 'live' : 'draft',
      modelLabel: sayNativeChatSessionOptionTranslated('model'),
      reportedValues,
      dispatchCommand,
      canSwitchOmpModel,
      onAgentPicker,
      persistSelection: ({ modelId, optionId, value, adoptModelAsLaunchDefault }) =>
        // Paired PTY launches still assemble their launch preferences from client settings.
        enqueueSessionOptionSettingsWrite(CLIENT_SETTINGS_TARGET, {
          type: 'apply-picks',
          agent,
          picks: [{ modelId, optionId, value, adoptModelAsLaunchDefault }]
        })
    })
  }, [
    agent,
    canSwitchOmpModel,
    dispatchCommand,
    discoveryContext,
    onAgentPicker,
    readTerminalScreen,
    targetPtyId,
    terminalTabId
  ])

  useEffect(() => {
    if (!surface || agent !== 'claude') {
      return
    }
    let cancelled = false
    reportedScreenRef.current = null
    const reportCurrentValues = async (): Promise<void> => {
      let authoritativeScreen: string | null = null
      if (targetPtyId && window.api?.pty?.getMainBufferSnapshot) {
        try {
          const snapshot = await window.api.pty.getMainBufferSnapshot(targetPtyId, {
            scrollbackRows: 0
          })
          // Main-buffer snapshots are stale during alternate-screen TUIs; use mounted xterm then.
          authoritativeScreen = snapshot?.alternateScreen ? null : (snapshot?.data ?? null)
        } catch {
          // The mounted renderer buffer remains a transport-neutral fallback.
        }
      }
      const models = discoveryContext
        ? readNativeChatEnrichedModels(agent, discoveryContext.hostKey)
        : null
      for (const screen of [authoritativeScreen, readTerminalScreen?.() ?? null]) {
        const reportedValues = readClaudeSessionOptionsFromTerminalScreen(
          screen,
          models ?? undefined
        )
        if (!reportedValues) {
          continue
        }
        // Retain parsed screen text for late discovery after the model frame scrolls away.
        if (cancelled) {
          return
        }
        reportedScreenRef.current = screen
        surface.reportSessionOptions(
          withClaudeStartingEffort(
            withClaudeHookEffort(reportedValues, hookEffort),
            startingEffortSettings
          )
        )
        return
      }
      // Why: the startup frame scrolls away or a resumed session never draws it; the newest
      // reply still names the model, so the pill shows it rather than a bare "Model".
      const transcriptValues = claudeTranscriptSessionValues(
        transcriptModel,
        models ?? undefined,
        hookEffort
      )
      if (transcriptValues && !cancelled) {
        surface.reportSessionOptions(
          withClaudeStartingEffort(transcriptValues, startingEffortSettings)
        )
      }
    }
    void reportCurrentValues()
    return () => {
      cancelled = true
    }
  }, [
    agent,
    discoveryContext,
    hookEffort,
    readTerminalScreen,
    startingEffortSettings,
    surface,
    targetPtyId,
    transcriptModel
  ])

  // Scope survives surface rebuilds; reapplying an unchanged report would revert the user’s pick.
  useEffect(() => {
    appliedReportedModelRef.current = null
  }, [agent, targetPtyId, terminalTabId])

  useEffect(() => {
    // Claude uses terminal-frame evidence; other agents report model IDs in status hooks.
    if (!surface || agent === 'claude' || !reportedModel) {
      return
    }
    const catalog = getAgentSessionOptionCatalog(agent)
    if (!catalog) {
      return
    }
    const models =
      (discoveryContext ? readNativeChatEnrichedModels(agent, discoveryContext.hostKey) : null) ??
      catalog.models
    // OMP reports exact selectors, including models absent from cached discovery.
    const matched =
      agent === 'omp'
        ? reportedModel.trim()
        : matchNativeChatCatalogModelId({ ...catalog, models }, reportedModel, {
            allowUnlisted: agent === 'codex'
          })
    if (!matched || appliedReportedModelRef.current === matched) {
      return
    }
    appliedReportedModelRef.current = matched
    surface.reportSessionOptions({ model: matched })
  }, [agent, discoveryContext, reportedModel, surface])

  useEffect(() => {
    if (!surface || !discoveryContext) {
      return
    }
    const unsubscribe = subscribeNativeChatEnrichedModels(
      agent,
      discoveryContext.hostKey,
      (models) => {
        surface.replaceModels(models)
        const screen = agent === 'claude' ? reportedScreenRef.current : null
        const reportedValues = screen
          ? readClaudeSessionOptionsFromTerminalScreen(screen, models)
          : null
        if (reportedValues) {
          surface.reportSessionOptions(reportedValues)
        }
      }
    )
    ensureNativeChatModelEnrichment({
      agent,
      hostKey: discoveryContext.hostKey,
      discover: () =>
        discoverNativeChatCatalogModels(agent, discoveryContext.runtime, discoveryContext.hostKey)
    })
    return unsubscribe
  }, [agent, discoveryContext, surface])

  const snapshot = useSyncExternalStore(
    surface?.subscribe ?? subscribeEmpty,
    surface?.getSnapshot ?? getEmptySnapshot,
    surface?.getSnapshot ?? getEmptySnapshot
  )
  return { surface, snapshot }
}
