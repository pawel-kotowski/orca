import { toast } from 'sonner'
import { useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { translate } from '@/i18n/i18n'
import { readIpcErrorMessage } from '@/runtime/errors/ipc-error'
import { callStructuredAgentSession } from '@/runtime/native-chat/requests/structured-agent-session-call'
import { readRuntimeStatuses } from '@/store/slices/runtime-status/views/runtime-status-owner'
import { insertUnifiedTabAfterAnchor } from '@/lib/workspace/tabs/unified-tab-anchor-insertion'
import { prepareNativeChatCliFork } from '@/lib/agent-session/resume/cli-fork/native-chat-cli-fork-preparation'
import { resolveAiVaultResumeHost } from '@/lib/agent-session/resume/history/ai-vault-resume-command'
import { launchAiVaultSessionAndReveal } from '@/lib/agent-session/resume/history/launch-ai-vault-session-and-reveal'
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
import {
  agentForksConversations,
  agentForksThroughChat
} from '../../../../shared/agent-launch/startup/agent-resume-argv'
import { adoptsCliConversations } from '../../../../shared/agent-session/view/structured-agent-cli-conversation-adoption'
import { structuredAgentSessionPaneKey } from '../../../../shared/agent-session/view/structured-agent-session-projection'
import type { AgentSessionTerminalHandoverResult } from '../../../../shared/agent-session/lifecycle/operations/agent-session-terminal-handover'
import type { NativeChatStructuredAccountScope } from './native-chat-account-scope'

/** How the chat's terminal button works: the conversation itself moves, or a copy of it opens. */
export type StructuredTerminalSwitch = 'same' | 'copy' | null

/**
 * A chat's own conversation can move to a terminal where the host can tell that terminal writes it
 * and reads its turns back afterwards; a bot keeps answering in its chat, so it gets a copy.
 */
export function structuredTerminalSwitch(
  scope: Pick<NativeChatStructuredAccountScope, 'agent' | 'worktreeId' | 'botName'>
): StructuredTerminalSwitch {
  const { agent } = scope
  if (!scope.worktreeId || !isAiVaultAgent(agent) || !agentForksConversations(agent)) {
    return null
  }
  return scope.botName === null && adoptsCliConversations(agent) && !agentForksThroughChat(agent)
    ? 'same'
    : 'copy'
}

// Chats on their way to a terminal, which reports only once its agent starts; by chat session.
const opening = new Map<string, string | null>()
const listeners = new Set<() => void>()

function setOpening(sessionId: string, terminalTabId: string | null | undefined): void {
  if (terminalTabId === undefined) {
    opening.delete(sessionId)
  } else {
    opening.set(sessionId, terminalTabId)
  }
  for (const listener of listeners) {
    listener()
  }
}

/** The terminal pane that runs this chat's own conversation now, other than the chat itself. */
export function structuredChatTerminalPane(
  state: Pick<AppState, 'agentStatusByPaneKey' | 'tabsByWorktree'>,
  chatPaneKey: string,
  worktreeId: string | null
): string | null {
  const conversation = state.agentStatusByPaneKey.get(chatPaneKey)?.providerSession?.id
  const tabs = worktreeId ? state.tabsByWorktree[worktreeId] : undefined
  if (!conversation || !tabs) {
    return null
  }
  for (const tab of tabs) {
    for (const [paneKey, entry] of state.agentStatusByPaneKey) {
      if (paneKey.startsWith(`${tab.id}:`) && entry.providerSession?.id === conversation) {
        return paneKey
      }
    }
  }
  return null
}

/** Where the chat's conversation is: here, on its way to a terminal, or in one (its tab). */
export function useStructuredChatTerminal(
  sessionId: string,
  chatPaneKey: string,
  worktreeId: string | null
): { tabId: string | null } | null {
  const pane = useAppStore((state) => structuredChatTerminalPane(state, chatPaneKey, worktreeId))
  const pending = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => opening.get(sessionId)
  )
  // A closed tab ends the wait: nothing will report from it.
  const pendingGone = useAppStore(
    (state) =>
      typeof pending === 'string' &&
      worktreeId !== null &&
      !(state.tabsByWorktree[worktreeId] ?? []).some((tab) => tab.id === pending)
  )
  if (pane) {
    return { tabId: pane.slice(0, pane.indexOf(':')) }
  }
  return pending === undefined || pendingGone ? null : { tabId: pending }
}

function handover(
  scope: NativeChatStructuredAccountScope,
  action: 'begin' | 'bind' | 'end',
  paneKey?: string
): Promise<AgentSessionTerminalHandoverResult> {
  return callStructuredAgentSession(scope.target, 'agentSession.terminalHandover', {
    sessionId: scope.sessionId,
    action,
    ...(paneKey ? { paneKey } : {})
  })
}

// The mounted button of each chat tab, which Cmd+Shift+J presses as it switches a terminal chat.
const switches = new Map<string, () => void>()

export function registerStructuredTerminalSwitch(tabId: string, press: () => void): () => void {
  switches.set(tabId, press)
  return () => {
    if (switches.get(tabId) === press) {
      switches.delete(tabId)
    }
  }
}

/** False where the chat offers no switch, so the key stays with the rest of the app. */
export function pressStructuredTerminalSwitch(tabId: string): boolean {
  const press = switches.get(tabId)
  press?.()
  return press !== undefined
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
  if (opening.has(sessionId)) {
    return
  }
  setOpening(sessionId, null)
  let held = false
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
    const result = await handover(scope, 'begin')
    if (result.outcome !== 'held') {
      setOpening(sessionId, undefined)
      toast.warning(
        result.outcome === 'busy'
          ? busyWords()
          : translate(
              'components.native-chat.terminalSwitch.unsupported',
              'This chat cannot move to a terminal on its host.'
            )
      )
      return
    }
    held = true
    const startup = buildAiVaultLocalResumeStartup({
      session,
      host: resolveAiVaultResumeHost({ state: useAppStore.getState(), worktreeId, session }),
      settings,
      embedCwd: false
    })
    const terminalTabId = await launchAiVaultSessionAndReveal(
      { agent: session.agent, worktreeId, ...startup },
      describeAiVaultCliForkFailure
    )
    if (!terminalTabId) {
      // A paired host makes the tab itself; its agent's first report takes over from the hold.
      return
    }
    const state = useAppStore.getState()
    state.setTabViewMode(terminalTabId, 'terminal')
    insertUnifiedTabAfterAnchor(worktreeId, terminalTabId, tabId)
    setOpening(sessionId, terminalTabId)
    endOpeningOnReport(scope, worktreeId, terminalTabId)
    const leafId = launchedLeafId(state.terminalLayoutsByTabId[terminalTabId]?.root)
    if (leafId) {
      await handover(scope, 'bind', `${terminalTabId}:${leafId}`)
    }
  } catch (error) {
    setOpening(sessionId, undefined)
    if (held) {
      void handover(scope, 'end').catch(() => undefined)
    }
    notifyAiVaultSessionPreparationFailure(
      new Error(readIpcErrorMessage(error)),
      agent,
      describeAiVaultCliForkFailure
    )
  }
}

/** The terminal's own report takes over from the wait, so its agent's later exit frees the chat. */
function endOpeningOnReport(
  { sessionId, tabId }: NativeChatStructuredAccountScope,
  worktreeId: string,
  terminalTabId: string
): void {
  const chatPaneKey = structuredAgentSessionPaneKey(tabId, sessionId)
  const stop = useAppStore.subscribe((state) => {
    const gone = !(state.tabsByWorktree[worktreeId] ?? []).some((tab) => tab.id === terminalTabId)
    if (opening.get(sessionId) !== terminalTabId) {
      stop()
    } else if (gone || structuredChatTerminalPane(state, chatPaneKey, worktreeId)) {
      stop()
      setOpening(sessionId, undefined)
    }
  })
}

function launchedLeafId(
  node: AppState['terminalLayoutsByTabId'][string]['root'] | undefined
): string | undefined {
  return !node ? undefined : node.type === 'leaf' ? node.leafId : launchedLeafId(node.first)
}

export function showStructuredChatTerminal(terminalTabId: string): void {
  activateTabAndFocusPane(terminalTabId, null)
}

/** Closes the terminal that holds the conversation and gives it back to the chat, caught up. */
export async function bringStructuredChatBack(
  scope: NativeChatStructuredAccountScope,
  terminalTabId: string | null
): Promise<void> {
  const { sessionId, worktreeId } = scope
  try {
    if (terminalTabId && worktreeId) {
      const source = resolveCliChatResumeSource(useAppStore.getState(), readRuntimeStatuses(), {
        tab: { id: terminalTabId, worktreeId }
      })
      if (source) {
        const closed = await closeCliChatResumeTerminal(
          source,
          () => true,
          { prepared: () => undefined, closing: () => undefined, refused: () => undefined },
          new AbortController().signal,
          // A working agent asks first; an idle one's stop is what the press asked for.
          useAppStore.getState().agentStatusByPaneKey.get(source.paneKey)?.state !== 'working'
        )
        if (!closed) {
          return
        }
      } else {
        closeTerminalTab(terminalTabId, { reason: 'user', preserveWorktreeSelection: true })
      }
    }
    const result = await handover(scope, 'end')
    setOpening(sessionId, undefined)
    if (result.outcome === 'open') {
      toast.warning(
        translate(
          'components.native-chat.terminalSwitch.stillOpen',
          'A terminal still runs this conversation. Close it, then bring it back.'
        )
      )
    }
  } catch (error) {
    toast.error(readIpcErrorMessage(error))
  }
}
