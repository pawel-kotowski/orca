import { toast } from 'sonner'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
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
import type {
  AgentSessionTerminalHandoverAction,
  AgentSessionTerminalHandoverResult
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
  mark: { token?: string; paneKey?: string } = {}
): Promise<AgentSessionTerminalHandoverResult> {
  return callStructuredAgentSession(scope.target, 'agentSession.terminalHandover', {
    sessionId: scope.sessionId,
    action,
    ...mark
  })
}

const busyWords = (): string =>
  translate(
    'components.native-chat.terminalSwitch.busy',
    'This chat is working. Its terminal opens once the work and its background tasks end.'
  )

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
  setChatTerminalHold(sessionId, { tabId: null, launching: true })
  const token = createNonSecureContextUuid()
  let begun = false
  let launched = false
  try {
    const owner = captureAiVaultCliForkOwner(subject.request.executionHostScope)
    const settings = await readAiVaultCliForkLaunchSettings({
      owner,
      localSettings: useAppStore.getState().settings
    })
    const { session } = await prepareNativeChatCliFork(subject, {
      pairingRevision: owner?.pairingRevision,
      isCurrent: () => true,
      signal: new AbortController().signal
    })
    begun = true
    const result = await handover(scope, 'begin', { token })
    if (result.outcome !== 'held') {
      begun = false
      setChatTerminalHold(
        sessionId,
        result.outcome === 'open'
          ? { tabId: hostPaneTab(worktreeId, result.paneKey), launching: false }
          : null
      )
      if (result.outcome !== 'open') {
        toast.warning(
          result.outcome === 'busy'
            ? busyWords()
            : translate(
                'components.native-chat.terminalSwitch.unsupported',
                'This chat cannot move to a terminal on its host.'
              )
        )
      }
      return
    }
    const startup = buildAiVaultLocalResumeStartup({
      session,
      host: resolveAiVaultResumeHost({ state: useAppStore.getState(), worktreeId, session }),
      settings,
      embedCwd: false
    })
    launched = true
    const launch = launchAiVaultSessionInNewTab({ agent: session.agent, worktreeId, ...startup })
    let terminalTabId = launch.tabId
    if (launch.tabId === null) {
      const outcome = await launch.runtimeLaunch
      if (outcome.status === 'failed') {
        // No answer is no proof: the host may have made the terminal, so the chat stays held.
        throw new Error(outcome.message)
      }
      terminalTabId = outcome.mirroredTabId ?? null
    }
    setChatTerminalHold(sessionId, { tabId: terminalTabId, launching: false })
    if (terminalTabId) {
      void bindTerminalPane(scope, token, worktreeId, terminalTabId)
      useAppStore.getState().setTabViewMode(terminalTabId, 'terminal')
      insertUnifiedTabAfterAnchor(worktreeId, terminalTabId, tabId)
    }
  } catch (error) {
    // Once launched, a person decides: the strip stays with its way back.
    setChatTerminalHold(sessionId, launched ? { tabId: null, launching: false } : null)
    if (begun && !launched) {
      void handover(scope, 'abandon', { token }).catch(() => undefined)
    }
    notifyAiVaultSessionPreparationFailure(
      new Error(readIpcErrorMessage(error)),
      agent,
      describeAiVaultCliForkFailure
    )
  }
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

function launchedLeafId(
  node: AppState['terminalLayoutsByTabId'][string]['root'] | undefined
): string | undefined {
  return !node ? undefined : node.type === 'leaf' ? node.leafId : launchedLeafId(node.first)
}

/** Tells the host which pane has the conversation, so that pane's end frees the chat. */
async function bindTerminalPane(
  scope: NativeChatStructuredAccountScope,
  token: string,
  worktreeId: string,
  terminalTabId: string
): Promise<void> {
  const leafId = await new Promise<string | undefined>((resolve) => {
    const leaf = (state: AppState) =>
      launchedLeafId(state.terminalLayoutsByTabId[terminalTabId]?.root)
    const known = leaf(useAppStore.getState())
    if (known) {
      resolve(known)
      return
    }
    // A paired host's tab shows here a moment after its launch, so only one seen before is gone.
    let seen = false
    const stop = useAppStore.subscribe((state) => {
      const here = (state.tabsByWorktree[worktreeId] ?? []).some((tab) => tab.id === terminalTabId)
      seen ||= here
      const found = leaf(state)
      if (found || (seen && !here)) {
        stop()
        resolve(found)
      }
    })
  })
  if (leafId) {
    const paneKey = toHostSessionPaneKey(`${terminalTabId}:${leafId}`)
    await handover(scope, 'bind', { token, paneKey }).catch(() => undefined)
  }
}

/**
 * Follows the host's hold while the chat is drawn: after a reload, on another client, and once its
 * terminal is done (the host gives the chat back by itself).
 */
export async function readChatTerminalHold(scope: NativeChatStructuredAccountScope): Promise<void> {
  const { sessionId, worktreeId } = scope
  if (structuredTerminalSwitch(scope) !== 'same' || chatTerminalHold(sessionId)?.launching) {
    return
  }
  // An older host has no such method, and never holds a chat.
  const result = await handover(scope, 'status').catch(() => null)
  const known = chatTerminalHold(sessionId)
  if (!result || known?.launching) {
    return
  }
  if (result.outcome !== 'held') {
    setChatTerminalHold(sessionId, null)
  } else if (!known || (known.tabId === null && result.paneKey)) {
    const tabId = worktreeId ? hostPaneTab(worktreeId, result.paneKey) : null
    if (!known || tabId) {
      setChatTerminalHold(sessionId, { tabId, launching: false })
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
  for (let check = 1; result.outcome === 'open' && check < EXIT_CHECKS; check++) {
    await new Promise((resolve) => setTimeout(resolve, EXIT_CHECK_MS))
    result = await handover(scope, 'end')
  }
  return result
}

/** Closes the terminal that holds the conversation and gives it back to the chat, caught up. */
export async function bringStructuredChatBack(
  scope: NativeChatStructuredAccountScope,
  terminalTabId: string | null
): Promise<void> {
  const { sessionId, worktreeId } = scope
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
