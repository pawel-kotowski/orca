import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { readIpcErrorMessage } from '@/runtime/errors/ipc-error'
import { callStructuredAgentSession } from '@/runtime/native-chat/requests/structured-agent-session-call'
import { readRuntimeStatuses } from '@/store/slices/runtime-status/views/runtime-status-owner'
import { insertUnifiedTabAfterAnchor } from '@/lib/workspace/tabs/unified-tab-anchor-insertion'
import { prepareNativeChatCliFork } from '@/lib/agent-session/resume/cli-fork/native-chat-cli-fork-preparation'
import { resolveAiVaultResumeHost } from '@/lib/agent-session/resume/history/ai-vault-resume-command'
import { launchAiVaultSessionInNewTab } from '@/lib/agent-session/resume/history/launch-ai-vault-session'
import {
  captureAiVaultCliForkOwner,
  readAiVaultCliForkLaunchSettings
} from '@/lib/agent-session/resume/history/ai-vault-session-fork-startup'
import { activateTabAndFocusPane } from '@/lib/workspace/tabs/activate-tab-and-focus-pane'
import { describeAiVaultCliForkFailure } from '@/components/right-sidebar/ai-vault/session-actions/ai-vault-session-cli-fork'
import { notifyAiVaultSessionPreparationFailure } from '@/components/right-sidebar/ai-vault/session-actions/ai-vault-session-launch-feedback'
import { resolveTabSessionHistorySubject } from '@/components/tab-bar/session-actions/tab-session-history-switch'
import { runNativeChatCliFork } from '@/components/tab-bar/session-actions/native-chat-cli-fork-run'
import { resolveCliChatResumeSource } from '@/components/tab-bar/session-actions/cli-chat-resume-source'
import { closeCliChatResumeTerminal } from '@/components/tab-bar/session-actions/cli-chat-resume-close-terminal'
import { closeTerminalTab } from '@/components/terminal/tab-lifecycle/terminal-tab-actions'
import { buildAiVaultLocalResumeStartup } from '../../../../shared/ai-vault/resume/ai-vault-resume-startup'
import { isAiVaultAgent } from '../../../../shared/ai-vault/contracts/ai-vault-types'
import { createNonSecureContextUuid } from '../../../../shared/identifiers/non-secure-context-uuid'
import { toHostSessionPaneKey } from '../../../../shared/workspace-layout/terminal-surface-id'
import {
  CHAT_HANDOVER_ENV,
  type AgentSessionTerminalHandoverAction,
  type AgentSessionTerminalHandoverResult
} from '../../../../shared/agent-session/lifecycle/operations/agent-session-terminal-handover'
import type { NativeChatStructuredAccountScope } from './native-chat-account-scope'
import {
  chatTerminalHold,
  setChatTerminalHold,
  structuredTerminalSwitch
} from './native-chat-structured-terminal-state'

function handover(
  scope: Pick<NativeChatStructuredAccountScope, 'target' | 'sessionId'>,
  action: AgentSessionTerminalHandoverAction,
  mark: { token?: string; holdId?: string } = {}
): Promise<AgentSessionTerminalHandoverResult> {
  return callStructuredAgentSession(scope.target, 'agentSession.terminalHandover', {
    sessionId: scope.sessionId,
    action,
    ...mark
  })
}

function warnNotOpened(outcome: AgentSessionTerminalHandoverResult['outcome']): void {
  if (outcome === 'free') {
    return
  }
  toast.warning(
    outcome === 'busy'
      ? translate(
          'components.native-chat.terminalSwitch.busy',
          'This chat is working. Its terminal opens once the work and its background tasks end.'
        )
      : outcome === 'open'
        ? translate(
            'components.native-chat.terminalSwitch.alreadyOpen',
            'A terminal already runs this conversation.'
          )
        : translate(
            'components.native-chat.terminalSwitch.unsupported',
            'This chat cannot move to a terminal on its host.'
          )
  )
}

/** Moves the chat's own conversation into a terminal beside it, or opens a copy where it cannot. */
export async function openStructuredChatTerminal(
  scope: NativeChatStructuredAccountScope
): Promise<void> {
  const { agent, tabId, worktreeId, sessionId } = scope
  const mode = structuredTerminalSwitch(scope)
  if (!mode || !worktreeId || !isAiVaultAgent(agent)) {
    return
  }
  const tab = { id: tabId, worktreeId }
  const subject = resolveTabSessionHistorySubject(useAppStore.getState(), {
    tab,
    nativeChat: { sessionId, agent }
  })
  if (subject?.kind !== 'chat') {
    return
  }
  if (mode === 'copy') {
    await runNativeChatCliFork({ subject, tab, agent })
    return
  }
  if (chatTerminalHold(sessionId)) {
    return
  }
  const token = createNonSecureContextUuid()
  const abort = new AbortController()
  const { signal } = abort
  // The host keeps the hold when the terminal came to be, whoever gives up.
  const abandon = async (): Promise<void> => {
    await handover(scope, 'abandon', { token }).catch(() => undefined)
    setChatTerminalHold(sessionId, null)
    await readChatTerminalHold(scope)
  }
  setChatTerminalHold(sessionId, {
    tabId: null,
    cancel: () => {
      abort.abort()
      void abandon()
    }
  })
  try {
    const owner = captureAiVaultCliForkOwner(subject.request.executionHostScope)
    const settings = await readAiVaultCliForkLaunchSettings({
      owner,
      localSettings: useAppStore.getState().settings
    })
    const { session } = await prepareNativeChatCliFork(subject, {
      pairingRevision: owner?.pairingRevision,
      isCurrent: () => !signal.aborted,
      signal
    })
    if (signal.aborted) {
      return
    }
    const result = await handover(scope, 'begin', { token })
    if (signal.aborted) {
      return
    }
    if (result.outcome !== 'held') {
      setChatTerminalHold(sessionId, null)
      if (result.outcome === 'open' && result.holdId) {
        // Another client has it there: show what the host says.
        await readChatTerminalHold(scope)
      } else {
        warnNotOpened(result.outcome)
      }
      return
    }
    const startup = buildAiVaultLocalResumeStartup({
      session,
      host: resolveAiVaultResumeHost({ state: useAppStore.getState(), worktreeId, session }),
      settings,
      embedCwd: false
    })
    const launch = launchAiVaultSessionInNewTab({
      agent: session.agent,
      worktreeId,
      ...startup,
      env: { ...startup.env, [CHAT_HANDOVER_ENV]: token }
    })
    let terminalTabId = launch.tabId
    if (launch.tabId === null) {
      const outcome = await launch.runtimeLaunch
      if (signal.aborted) {
        return
      }
      if (outcome.status === 'failed') {
        throw new Error(outcome.message)
      }
      terminalTabId = outcome.mirroredTabId ?? null
    }
    setChatTerminalHold(sessionId, { tabId: terminalTabId })
    if (terminalTabId) {
      abandonIfClosedUnlaunched(worktreeId, terminalTabId, abandon)
      useAppStore.getState().setTabViewMode(terminalTabId, 'terminal')
      insertUnifiedTabAfterAnchor(worktreeId, terminalTabId, tabId)
    }
  } catch (error) {
    if (signal.aborted) {
      return
    }
    await abandon()
    notifyAiVaultSessionPreparationFailure(
      new Error(readIpcErrorMessage(error)),
      agent,
      describeAiVaultCliForkFailure
    )
  }
}

/** A tab closed before its terminal was started leaves the chat here; after, the host sees it end. */
function abandonIfClosedUnlaunched(
  worktreeId: string,
  terminalTabId: string,
  abandon: () => Promise<void>
): void {
  // A paired host's tab shows here a moment after its launch, so only one seen before is gone.
  let seen = false
  const stop = useAppStore.subscribe((state) => {
    const layout = state.terminalLayoutsByTabId[terminalTabId]
    const here = (state.tabsByWorktree[worktreeId] ?? []).some((tab) => tab.id === terminalTabId)
    seen ||= here
    if (Object.values(layout?.ptyIdsByLeafId ?? {}).some(Boolean)) {
      stop()
    } else if (seen && !here) {
      stop()
      void abandon()
    }
  })
}

/** The tab here that shows a pane as its host names it. */
function hostPaneTab(worktreeId: string, hostPaneKey: string | undefined): string | null {
  const leaf = hostPaneKey?.slice(hostPaneKey.indexOf(':') + 1)
  const tabs = useAppStore.getState().tabsByWorktree[worktreeId] ?? []
  return (
    tabs.find((tab) => leaf && toHostSessionPaneKey(`${tab.id}:${leaf}`) === hostPaneKey)?.id ??
    null
  )
}

/**
 * Follows the host's hold while the chat is drawn: after a reload, on another client, and once its
 * terminal is done (the host gives the chat back by itself).
 */
export async function readChatTerminalHold(scope: NativeChatStructuredAccountScope): Promise<void> {
  const { sessionId, worktreeId } = scope
  if (structuredTerminalSwitch(scope) !== 'same' || chatTerminalHold(sessionId)?.cancel) {
    return
  }
  // An older host has no such method, and never holds a chat.
  const result = await handover(scope, 'status').catch(() => null)
  const known = chatTerminalHold(sessionId)
  if (!result || known?.cancel) {
    return
  }
  if (result.outcome !== 'held') {
    setChatTerminalHold(sessionId, null)
  } else if (!known || (known.tabId === null && result.paneKey)) {
    const tabId = worktreeId ? hostPaneTab(worktreeId, result.paneKey) : null
    if (!known || tabId) {
      setChatTerminalHold(sessionId, { tabId })
    }
  }
}

export function showStructuredChatTerminal(terminalTabId: string): void {
  activateTabAndFocusPane(terminalTabId, null)
}

// A closed tab's agent takes a moment to exit; the host says `open` until it has.
const EXIT_CHECKS = 20
const EXIT_CHECK_MS = 500

async function takeBack(
  scope: NativeChatStructuredAccountScope
): Promise<AgentSessionTerminalHandoverResult> {
  let result = await handover(scope, 'end')
  // The handover the press meant: a retry never ends one begun meanwhile.
  const mark = result.outcome === 'open' && result.holdId ? { holdId: result.holdId } : {}
  for (let check = 1; result.outcome === 'open' && check < EXIT_CHECKS; check++) {
    await new Promise((resolve) => setTimeout(resolve, EXIT_CHECK_MS))
    result = await handover(scope, 'end', mark)
  }
  return result
}

/** Closes the terminal that holds the conversation and gives it back to the chat, caught up. */
export async function bringStructuredChatBack(
  scope: NativeChatStructuredAccountScope,
  terminalTabId: string | null
): Promise<void> {
  const { sessionId, worktreeId } = scope
  const cancel = chatTerminalHold(sessionId)?.cancel
  if (cancel) {
    cancel()
    return
  }
  try {
    if (terminalTabId && worktreeId && !(await closeChatTerminal(worktreeId, terminalTabId))) {
      return
    }
    const result = await takeBack(scope)
    if (result.outcome === 'open') {
      toast.warning(
        translate(
          'components.native-chat.terminalSwitch.stillOpen',
          'A terminal still runs this conversation. Close it, then bring it back.'
        )
      )
      return
    }
    setChatTerminalHold(sessionId, null)
  } catch (error) {
    toast.error(readIpcErrorMessage(error))
  }
}

/** False when the person kept the terminal. */
async function closeChatTerminal(worktreeId: string, terminalTabId: string): Promise<boolean> {
  const state = useAppStore.getState()
  if (!(state.tabsByWorktree[worktreeId] ?? []).some((tab) => tab.id === terminalTabId)) {
    return true
  }
  const source = resolveCliChatResumeSource(state, readRuntimeStatuses(), {
    tab: { id: terminalTabId, worktreeId }
  })
  if (!source) {
    closeTerminalTab(terminalTabId, { reason: 'user', preserveWorktreeSelection: true })
    return true
  }
  return closeCliChatResumeTerminal(
    source,
    () => true,
    { prepared: () => undefined, closing: () => undefined, refused: () => undefined },
    new AbortController().signal,
    // A working agent asks first; an idle one's stop is what the press asked for.
    state.agentStatusByPaneKey.get(source.paneKey)?.state !== 'working'
  )
}
