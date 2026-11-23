import { useAgentStatus } from '@/runtime/agent-status/use-agent-status'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { AgentType } from '../../../../../../../shared/agent-status/contracts/agent-status-types'
import { getAgentSessionOptionCatalog } from '../../../../../../../shared/agent-session/options/agent-session-option-catalog'
import {
  takeNativeChatStatusReport,
  type NativeChatStatusReportMemory
} from '../../../../../../../shared/native-chat/input/session-options/native-chat-status-session-options'
import type {
  SessionOptionDescriptor,
  SessionOptionValue
} from '../../../../../../../shared/native-chat/input/native-chat-session-options'
import { sayNativeChatSessionOptionTranslated } from '../controls/native-chat-session-option-labels-text'
import {
  createNativeChatPtySessionOptions,
  type NativeChatPtySessionOptionsSurface
} from '../../../../../../../shared/native-chat/input/session-options/native-chat-pty-session-options'
import type { NativeChatSessionOptionDispatchCommand } from '../../../../../../../shared/native-chat/input/session-options/native-chat-session-option-dispatch'
import {
  ensureNativeChatModelEnrichment,
  readNativeChatEnrichedModels,
  subscribeNativeChatEnrichedModels
} from '../catalog/native-chat-session-option-enrichment'
import {
  discoverNativeChatCatalogModels,
  resolveNativeChatModelDiscoveryContext
} from '../catalog/native-chat-session-option-discovery'

import {
  claudeTranscriptSessionValues,
  readClaudeSessionOptionsFromTerminalScreen
} from './claude-terminal-session-options'
import {
  claudeSessionValuesToReport,
  claudeVersionedModelId
} from './claude-terminal-model-identity'
import { useClaudeTerminalSessionStart } from './use-claude-terminal-session-start'

import { enqueueSessionOptionSettingsWrite } from '../native-chat-session-option-settings-write'

const EMPTY_SNAPSHOT: SessionOptionDescriptor[] = []
const subscribeEmpty = (): (() => void) => () => {}
const getEmptySnapshot = (): SessionOptionDescriptor[] => EMPTY_SNAPSHOT

const CLIENT_SETTINGS_TARGET = { kind: 'local' } as const

// Kept across chat remounts, as on the phone: the same agent session repeating its model is not
// fresh evidence, and reapplying it would revert a newer pick.
const appliedReportByPty: NativeChatStatusReportMemory = new Map()

export function useNativeChatSessionOptions(args: {
  agent: AgentType
  terminalTabId: string
  targetPtyId: string | null
  dispatchCommand: NativeChatSessionOptionDispatchCommand
  onAgentPicker?: () => void
  /** The pane whose agent status reports the session's model and effort, as it does on the phone. */
  paneKey?: string
  /** Claude's terminal frame: the model and effort its startup screen names. */
  readTerminalScreen?: () => string | null
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
  // Claude's hook-reported effort, and the model and effort its session started with.
  const { hookEffort, start: claudeStart } = useClaudeTerminalSessionStart(
    agent === 'claude' ? paneKey : undefined
  )
  const status = useAgentStatus(paneKey)
  const reportedModel = status?.model
  const reportingSessionId = status?.providerSession?.id
  const reportedEffort = status?.providerSession?.effort
  const canSwitchOmpModel = status?.modelSwitchCommand === 'orca-model'
  // Host discovery can resolve a reported id the seed families only matched by family.
  const [discoveredModelsRevision, setDiscoveredModelsRevision] = useState(0)
  // Cache parsed screen text so late discovery can resolve real host model IDs.
  const reportedScreenRef = useRef<{ surface: object; screen: string } | null>(null)
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
    return createNativeChatPtySessionOptions({
      agent,
      scopeKey,
      ...(targetPtyId ? { fallbackScopeKey: terminalTabId } : {}),
      // Version-neutral family seeds keep the picker available while host discovery runs or fails.
      ...(discoveryContext ? { initialModels: discoveredModels ?? undefined } : {}),
      mode: targetPtyId ? 'live' : 'draft',
      modelLabel: sayNativeChatSessionOptionTranslated('model'),
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
    targetPtyId,
    terminalTabId
  ])

  useEffect(() => {
    // Claude uses terminal-frame evidence; other agents report model IDs in status hooks.
    if (!surface || agent === 'claude' || !reportedModel || !targetPtyId) {
      return
    }
    const catalog = getAgentSessionOptionCatalog(agent)
    if (!catalog) {
      return
    }
    const models =
      (discoveryContext ? readNativeChatEnrichedModels(agent, discoveryContext.hostKey) : null) ??
      catalog.models
    // A new agent or session in the same terminal reports afresh, even the same model.
    const report = takeNativeChatStatusReport(
      appliedReportByPty,
      targetPtyId,
      agent,
      catalog,
      models,
      {
        model: reportedModel,
        providerSession: { id: reportingSessionId, effort: reportedEffort }
      }
    )
    if (report) {
      surface.reportSessionOptions(report.values, report.forNewModel)
    }
  }, [
    agent,
    discoveredModelsRevision,
    discoveryContext,
    reportedEffort,
    reportedModel,
    reportingSessionId,
    surface,
    targetPtyId
  ])

  useEffect(() => {
    if (!surface || agent !== 'claude') {
      return
    }
    let cancelled = false
    const cachedScreen =
      reportedScreenRef.current?.surface === surface ? reportedScreenRef.current.screen : null
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
      if (cancelled) {
        return
      }
      const models = discoveryContext
        ? readNativeChatEnrichedModels(agent, discoveryContext.hostKey)
        : null
      let found: Record<string, SessionOptionValue> | null = null
      // Why the cached screen: the model frame scrolls away before late discovery resolves ids.
      for (const screen of [authoritativeScreen, readTerminalScreen?.() ?? null, cachedScreen]) {
        found = readClaudeSessionOptionsFromTerminalScreen(screen, models ?? undefined)
        if (found && screen) {
          reportedScreenRef.current = { surface, screen }
          break
        }
      }
      // Why: the screen names an alias; report the versioned id the host catalog resolves it to (the local build's rule).
      if (found && typeof found.model === 'string') {
        found = { ...found, model: claudeVersionedModelId(found.model, models) }
      }
      // Why: the startup frame scrolls away or a resumed session never draws it; the newest
      // reply still names the model. Past that, the model the session started on: the pill
      // always names a model and an effort, never a bare "Model" (Paweł, 2026-11-14).
      const values = claudeSessionValuesToReport({
        found: found ?? claudeTranscriptSessionValues(transcriptModel, models ?? undefined, null),
        snapshot: surface.getSnapshot(),
        models,
        hookEffort,
        start: claudeStart
      })
      if (values) {
        surface.reportSessionOptions(values)
      }
    }
    void reportCurrentValues()
    return () => {
      cancelled = true
    }
  }, [
    agent,
    claudeStart,
    discoveredModelsRevision,
    discoveryContext,
    hookEffort,
    readTerminalScreen,
    surface,
    targetPtyId,
    transcriptModel
  ])

  useEffect(() => {
    if (!surface || !discoveryContext) {
      return
    }
    const unsubscribe = subscribeNativeChatEnrichedModels(
      agent,
      discoveryContext.hostKey,
      (models) => {
        surface.replaceModels(models)
        setDiscoveredModelsRevision((revision) => revision + 1)
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
