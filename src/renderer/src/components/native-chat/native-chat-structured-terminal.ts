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
import { toHostSessionPaneKey } from '../../../../shared/workspace-layout/terminal-surface-id'
import { structuredAgentSessionPaneKey } from '../../../../shared/agent-session/view/structured-agent-session-projection'
import type { AgentSessionTerminalHandoverResult } from '../../../../shared/agent-session/lifecycle/operations/agent-session-terminal-handover'
import type { NativeChatStructuredAccountScope } from './native-chat-account-scope'
import {
  chatTerminalOpening,
  setChatTerminalOpening,
  structuredChatTerminalPane,
  structuredTerminalSwitch
} from './native-chat-structured-terminal-state'

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
  if (chatTerminalOpening.has(sessionId)) {
    return
  }
  setChatTerminalOpening(sessionId, null)
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
      setChatTerminalOpening(sessionId, undefined)
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
    const launch = launchAiVaultSessionInNewTab({ agent: session.agent, worktreeId, ...startup })
    let terminalTabId = launch.tabId
    if (launch.tabId === null) {
      const outcome = await launch.runtimeLaunch
      if (outcome.status === 'failed') {
        throw new Error(outcome.message)
      }
      terminalTabId = outcome.mirroredTabId ?? null
    }
    if (terminalTabId) {
      setChatTerminalOpening(sessionId, terminalTabId)
      endOpeningOnReport(scope, worktreeId, terminalTabId)
      void bindTerminalPane(scope, worktreeId, terminalTabId)
      useAppStore.getState().setTabViewMode(terminalTabId, 'terminal')
      insertUnifiedTabAfterAnchor(worktreeId, terminalTabId, tabId)
    }
  } catch (error) {
    setChatTerminalOpening(sessionId, undefined)
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

/** A paired host's tab shows here a moment after its launch, so only one seen before can be gone. */
function tabGoneOnceSeen(
  worktreeId: string,
  terminalTabId: string
): (state: Pick<AppState, 'tabsByWorktree'>) => boolean {
  let seen = false
  return (state) => {
    const here = (state.tabsByWorktree[worktreeId] ?? []).some((tab) => tab.id === terminalTabId)
    seen ||= here
    return seen && !here
  }
}

/** The terminal's own report takes over from the wait, so its agent's later exit frees the chat. */
function endOpeningOnReport(
  { sessionId, tabId }: NativeChatStructuredAccountScope,
  worktreeId: string,
  terminalTabId: string
): void {
  const chatPaneKey = structuredAgentSessionPaneKey(tabId, sessionId)
  const tabGone = tabGoneOnceSeen(worktreeId, terminalTabId)
  const stop = useAppStore.subscribe((state) => {
    const gone = tabGone(state)
    if (chatTerminalOpening.get(sessionId) !== terminalTabId) {
      stop()
    } else if (gone || structuredChatTerminalPane(state, chatPaneKey, worktreeId)) {
      stop()
      setChatTerminalOpening(sessionId, undefined)
    }
  })
}

function launchedLeafId(
  node: AppState['terminalLayoutsByTabId'][string]['root'] | undefined
): string | undefined {
  return !node ? undefined : node.type === 'leaf' ? node.leafId : launchedLeafId(node.first)
}

/** Tells the host which pane has the conversation, so only that pane's end frees the chat. */
async function bindTerminalPane(
  scope: NativeChatStructuredAccountScope,
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
    const tabGone = tabGoneOnceSeen(worktreeId, terminalTabId)
    const stop = useAppStore.subscribe((state) => {
      const gone = tabGone(state)
      const found = leaf(state)
      if (found || gone) {
        stop()
        resolve(found)
      }
    })
  })
  // A tab that went before its pane existed started no agent.
  await (
    leafId
      ? handover(scope, 'bind', toHostSessionPaneKey(`${terminalTabId}:${leafId}`))
      : handover(scope, 'end')
  ).catch(() => undefined)
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
    const result = await takeBack(scope)
    setChatTerminalOpening(sessionId, undefined)
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
