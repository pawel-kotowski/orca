import type { AgentLaunchIntent } from '../../../../../shared/agent-launch/contracts/agent-launch-intent'
import { terminalImageViewerSupported } from '../../../terminal/launch/terminal-image-viewer-env'
/** Use ordinary user-facing terminal/chat creation; worker factories add redrive, mailbox and background-tab behavior.
 * The executor selects surface and prompt delivery; this factory supplies the wire-shaped runtime calls. */

import { callerLaunchSource } from '../../../../agent-launch/agent-started-telemetry'
import { randomUUID } from 'node:crypto'
import { narrowStructuredLaunchSeedOptions } from '../../../../../shared/native-chat/input/session-options/native-chat-session-option-defaults'
import { createStructuredAgentSessionOperationId } from '../../../../../shared/agent-session/lifecycle/operations/structured-agent-session-mutation'
import { structuredAgentSessionTabId } from '../../../../../shared/agent-session/view/structured-agent-session-projection'
import {
  AgentLaunchStructuredSessionRefusedError,
  type AgentLaunchSurfaceFactory
} from '../../../../agent-launch/agent-launch-surface-factories'
import { getStructuredAgentSessionHost } from '../../../../native-chat/agent-session-wire/host/structured-agent-session-registry'
import type { StructuredAgentSessionHost } from '../../../../native-chat/agent-session-wire/host/structured-agent-session-host'
import type { RpcContext } from '../../core'
import { AgentLaunchSurfaceUnavailableError } from '../../../../agent-launch/agent-launch-surface-refusal'
import { isNativeLocalLocation } from '../../../../../shared/execution-host/execution-host'
import { takeOverClosedChatIfAsked } from '../../../../native-chat/conversation-adoption/closed-chat-takeover'
import {
  chatLaunchProfiles,
  keepChatLaunchProfile,
  undoProfileIfCreateThrows
} from '../../../../native-chat/launch-profiles/chat-launch-profiles'
import { STARTUP_CWD_FALLBACK_SENTENCE } from '../../../../../shared/shell/launch/startup-cwd-fallback'
import { structuredCallerFor } from '../structured-sessions/creation/structured-agent-session-gate'
import { createStructuredAgentSessionForWorktree } from '../structured-sessions/creation/structured-agent-session-create'
import { supportedStructuredSeedOptions } from '../../../agent-session/installation/structured-agent-runtime-metadata'
import { deliverTerminalAgentLaunchPrompt } from './agent-launch-terminal-prompt'
import { AgentLaunchSessionAlreadyExistsError } from '../../../../../shared/agent-launch/contracts/agent-launch-session-already-exists'
import { AGENT_SESSION_CREATE_MESSAGE_RUNTIME_CAPABILITY } from '../../../../../shared/agent-session/lifecycle/operations/agent-session-create-capabilities'
import { createOrcaSessionId } from '../../../../../shared/agent-session/identity/orca-session-address'
import { toAgentLaunchPreferences } from '../../../../../shared/agent-launch/choices/agent-launch-preferences'
import { paneIdentity } from '../../../terminal/identity/runtime-terminal-pane-identity'
import {
  trackTerminalSpawnDispatch,
  type TerminalSpawnDispatch
} from '../../../../agent-launch/agent-launch-not-started'
import { AgentLaunchTabClosedError } from '../../../../../shared/agent-launch/contracts/agent-launch-tab-closed'
import {
  agentLaunchMovesHostWindow,
  agentLaunchTabViewerRule,
  type AgentLaunchView
} from './agent-launch-tab-publication'

/** A saved launch choice (a chat's permission mode) over the launch's own model and effort, which it
 *  does not replace. */
export function launchSeedOptions(
  chatOptions: Readonly<Record<string, string>> | undefined,
  supported: Readonly<Record<string, string>>
): Readonly<Record<string, string>> | undefined {
  const seeded = { ...supported, ...chatOptions }
  return Object.keys(seeded).length > 0 ? seeded : undefined
}

/** Replay-safe launches keep the nested attach in the same stable caller namespace as the launch. */
export function agentLaunchSurfaceFactory(
  context: RpcContext,
  attachOperationId?: string,
  operationCallerKey?: string,
  // True when the launch shows its surface to the paired caller itself rather than to everyone.
  callerPresentsSurface = false,
  terminalSpawn: TerminalSpawnDispatch = trackTerminalSpawnDispatch(),
  // Read the early pane at spawn: publication and user close can finish after admission.
  view: AgentLaunchView = { early: null, presentation: undefined },
  {
    chatLaunchProfile,
    resumeFrom
  }: Pick<AgentLaunchIntent, 'chatLaunchProfile' | 'resumeFrom'> = {}
): AgentLaunchSurfaceFactory {
  const movesHostWindow = agentLaunchMovesHostWindow(context)
  const { early: earlyTab, presentation } = view
  return {
    createStructuredSession: async ({
      worktreeId,
      agent,
      options,
      chatOptions,
      sessionId: requested,
      tabId,
      withoutPrompt,
      firstMessage,
      signal
    }) => {
      const sessionId = requested ?? createOrcaSessionId(randomUUID)
      // Kept before the create, which starts the agent, so its first start already has it.
      const undoProfile = keepChatLaunchProfile(chatLaunchProfiles(), sessionId, chatLaunchProfile)
      // A closed, idle chat that holds the conversation hands it over before the create adopts it;
      // a failed create hands it back.
      let takeover = { undo: async () => {}, done: () => {} }
      if (resumeFrom) {
        await context.runtime.ensureStructuredAgentSessionHost()
        const location = await context.runtime.structuredAgentSessionLocationOf(`id:${worktreeId}`)
        takeover = await takeOverClosedChatIfAsked({
          agent,
          resumeFrom,
          envelope: { sessionId },
          local: isNativeLocalLocation(location)
        }).catch((error: unknown) => {
          undoProfile()
          // Before any effect: the launch's answer, not an unknown outcome.
          throw new AgentLaunchSurfaceUnavailableError(
            error instanceof Error ? error.message : String(error),
            'conversationHeldElsewhere'
          )
        })
      }
      const undoLaunch = async () => {
        undoProfile()
        await takeover.undo()
      }
      const supported = supportedStructuredSeedOptions(
        agent,
        narrowStructuredLaunchSeedOptions(options)
      )
      const seeded = launchSeedOptions(chatOptions, supported)
      // A client that creates chats without starting them starts this one on its first message.
      const atRest =
        firstMessage !== undefined ||
        (withoutPrompt === true &&
          context.clientCapabilities?.includes(AGENT_SESSION_CREATE_MESSAGE_RUNTIME_CAPABILITY) ===
            true)
      const created = await undoProfileIfCreateThrows(
        () =>
          createStructuredAgentSessionForWorktree({
            runtime: context.runtime,
            ensureHost: async () => {
              await context.runtime.ensureStructuredAgentSessionHost()
              return requireInstalledHost()
            },
            caller: operationCallerKey
              ? { callerKey: operationCallerKey }
              : structuredCallerFor(context),
            envelope: {
              sessionId,
              clientOperationId:
                attachOperationId ?? createStructuredAgentSessionOperationId(randomUUID),
              expectedRuntimeFence: null,
              // prepare supplies the host fingerprint; this id was host-minted, so no client create-intent conflict needs checking.
              payloadFingerprint: ''
            },
            worktree: `id:${worktreeId}`,
            agent,
            ...(chatOptions?.model ? { optionsMode: 'replace-model-selection' as const } : {}),
            ...(seeded ? { options: seeded } : {}),
            ...(tabId ? { tabId } : {}),
            ...(atRest ? { atRest: true as const } : {}),
            ...(firstMessage ? { firstMessage } : {}),
            ...(signal ? { signal } : {}),
            ...(resumeFrom ? { resumeFrom } : {}),
            activate:
              !callerPresentsSurface &&
              (presentation === undefined || (presentation === 'focused' && movesHostWindow))
          }),
        undoLaunch,
        () => Boolean(getStructuredAgentSessionHost()?.deps.store.getRecord(sessionId))
      ).finally(takeover.done)
      if (!created.ok) {
        await undoLaunch()
        if (chatLaunchProfile || resumeFrom) {
          // A chat's own profile has no terminal form: its refusal is the launch's answer.
          throw new AgentLaunchSurfaceUnavailableError(
            `${created.refusal.code}: ${created.refusal.message}`,
            created.refusal.code
          )
        }
        // A caller-named session conflict must surface to that caller, never downgrade to terminal.
        if (requested && created.refusal.code === 'agent_session_conflict') {
          throw new AgentLaunchSessionAlreadyExistsError()
        }
        throw new AgentLaunchStructuredSessionRefusedError(
          created.refusal.code,
          created.refusal.message
        )
      }
      return {
        sessionId: created.value.sessionId,
        handle: structuredAgentSessionTabId(created.value.sessionId),
        fence: created.value.fence,
        ...(created.value.firstMessage ? { firstMessage: created.value.firstMessage } : {}),
        ...(created.value.tabId ? { tabId: created.value.tabId } : {})
      }
    },
    createTerminalAgent: async ({
      worktreeId,
      agent,
      startupPrompt,
      agentArgs,
      cwd,
      launchSource,
      paneKey,
      options,
      viewMode,
      accountEnv
    }) => {
      const launchPreferences = toAgentLaunchPreferences(options, agent)
      const attributedLaunchSource = callerLaunchSource(context, launchSource)
      let promptRodeLaunchCommand = false
      const hasEarlyTab = earlyTab !== null
      if (earlyTab?.closedByUser()) {
        // The user closed its tab while it waited: nothing is spawned, and that is the answer.
        terminalSpawn.rethrow(new AgentLaunchTabClosedError())
      }
      const created = context.runtime.createTerminal(`id:${worktreeId}`, {
        // An agent launch the caller asked for (CLI, window or paired client) is the user's act.
        wslUserAct: true,
        // Let the runtime build the configured launcher: agent ids are not commands (cursor uses cursor-agent).
        startupAgent: agent,
        terminalImageViewerSupported: terminalImageViewerSupported(context),
        // The runtime reports typed-line prompt carry; paste only when the command did not carry it.
        ...(startupPrompt
          ? {
              startupPrompt,
              onStartupPromptCarry: (carried: boolean) => {
                promptRodeLaunchCommand = carried
              }
            }
          : {}),
        ...(agentArgs !== undefined ? { agentArgs } : {}),
        ...(cwd ? { cwd } : {}),
        // The model the user picked outranks configured args here too, as it does on a chat.
        ...(launchPreferences ? { launchPreferences } : {}),
        // A live reserved pane would be attached, not launched into, so the runtime refuses it.
        ...(paneKey ? { ...paneIdentity(paneKey), requireFreshPane: true } : {}),
        ...(attributedLaunchSource ? { launchSource: attributedLaunchSource } : {}),
        ...(viewMode ? { viewMode } : {}),
        ...(accountEnv ? { accountEnv: { ...accountEnv } } : {}),
        ...(presentation && (!movesHostWindow || !hasEarlyTab || presentation === 'background')
          ? { presentation: movesHostWindow ? presentation : ('background' as const) }
          : {}),
        ...(hasEarlyTab || !movesHostWindow ? { surfaceOwner: false as const } : {}),
        ...(earlyTab
          ? {
              agentLaunchViewer: () =>
                earlyTab.windowOwnsPresentation()
                  ? ('none' as const)
                  : agentLaunchTabViewerRule(context, presentation)
            }
          : {}),
        onPtySpawnDispatched: terminalSpawn.onPtySpawnDispatched
      })
      const terminal = await created.catch(terminalSpawn.rethrow)
      if (earlyTab?.closedByUser()) {
        // Close a terminal created after its tab was closed before pasting; command-line prompts may already have reached it.
        await context.runtime.closeTerminal(terminal.handle).catch(() => {})
        throw new AgentLaunchTabClosedError()
      }
      return {
        handle: terminal.handle,
        terminalCreation: terminal,
        // Keep the runtime-minted paneKey so the caller can identify the tab already created.
        ...(terminal.paneKey ? { paneKey: terminal.paneKey } : {}),
        // A caller that shows the tab itself reports a failed reveal; the fallback it can't know.
        ...launchWarning(
          terminal.startupCwdFallback ? STARTUP_CWD_FALLBACK_SENTENCE : undefined,
          callerPresentsSurface ? undefined : terminal.warning
        ),
        ...(promptRodeLaunchCommand ? { promptRodeLaunchCommand } : {})
      }
    },
    deliverTerminalPrompt: async ({
      handle,
      agent,
      freshLaunch,
      terminalCreation,
      prompt,
      signal
    }) => {
      const { runtime } = context
      // A stdin-after-start prompt cannot ride a Windows launch line, so it needs the startup path's Windows proof (#10336).
      if (freshLaunch && typeof runtime.deliverStartupFollowup === 'function') {
        return runtime.deliverStartupFollowup(
          handle,
          { agent, prompt: prompt.text },
          { agentLaunch: true, terminalCreation, ...(signal ? { signal } : {}) }
        )
      }
      return deliverTerminalAgentLaunchPrompt({
        runtime,
        handle,
        agent,
        freshLaunch,
        terminalCreation,
        text: prompt.text,
        ...(signal ? { signal } : {})
      })
    }
  }
}

function launchWarning(...parts: (string | undefined)[]): { warning?: string } {
  const warning = parts.filter(Boolean).join(' ')
  return warning ? { warning } : {}
}

function requireInstalledHost(): StructuredAgentSessionHost {
  const host = getStructuredAgentSessionHost()
  if (!host) {
    throw new Error('structured_agent_session_unsupported')
  }
  return host
}
