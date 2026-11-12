import { toast } from 'sonner'
import { createNonSecureContextUuid } from '../../../../../../shared/non-secure-context-uuid'
import { useAppStore } from '@/store/index'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { launchAiVaultSessionAndReveal } from '@/lib/agent-session/resume/history/launch-ai-vault-session-and-reveal'
import { appendToNativeChatComposerDraft } from '../../drafts/native-chat-composer-draft-store'
import { makePaneKey } from '../../../../../../shared/workspace-layout/stable-pane-id'
import type { TerminalPaneLayoutNode } from '../../../../../../shared/workspace-layout/terminal-tab-types'
import type {
  NativeChatForkClaudeTranscriptArgs,
  NativeChatForkClaudeTranscriptResult
} from '../../../../../../shared/native-chat/native-chat-terminal-fork-contract'
import type { NativeChatTerminalForkAgent } from '../../../../../../shared/native-chat/native-chat-terminal-row-actions'
import {
  buildNativeChatTerminalForkStartup,
  type NativeChatTerminalForkMode
} from './native-chat-terminal-fork-startup'
import { rememberNativeChatTerminalForkOrigin } from './native-chat-terminal-fork-origins'

export type NativeChatTerminalForkSource = {
  agent: NativeChatTerminalForkAgent
  paneKey: string
  terminalTabId: string
  worktreeId: string
  runtimeEnvironmentId: string | null
  sessionId: string
  transcriptPath: string | null
}

export type NativeChatTerminalForkCutRequest =
  | { kind: 'through-response'; uuid: string; inLatestTurn: boolean }
  | { kind: 'before-prompt'; uuid: string; draft: { text: string; imagePaths: string[] } }

/** How long a remote tab may take to report its session before its draft is dropped. */
const DRAFT_WAIT_MS = 120_000

async function copyClaudeTranscript(
  source: NativeChatTerminalForkSource,
  cut: NativeChatTerminalForkCutRequest
): Promise<NativeChatForkClaudeTranscriptResult> {
  const args: NativeChatForkClaudeTranscriptArgs = {
    sessionId: source.sessionId,
    ...(source.transcriptPath ? { transcriptPath: source.transcriptPath } : {}),
    cut: { kind: cut.kind, uuid: cut.uuid }
  }
  try {
    // Why the pane's runtime owner: the transcript lives on the host that runs the agent.
    const result = source.runtimeEnvironmentId
      ? await callRuntimeRpc<NativeChatForkClaudeTranscriptResult>(
          { kind: 'environment', environmentId: source.runtimeEnvironmentId },
          'nativeChat.forkClaudeTranscript',
          args,
          { timeoutMs: 90_000 }
        )
      : await window.api.nativeChat.forkClaudeTranscript?.(args)
    return result ?? { ok: false, reason: 'unsupported' }
  } catch (error) {
    return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : '' }
  }
}

function leafOf(node: TerminalPaneLayoutNode | null | undefined): string | undefined {
  return !node ? undefined : node.type === 'leaf' ? node.leafId : leafOf(node.first)
}

/** Puts the prompt into the new chat's composer once its pane exists: by tab when this client made
 *  it, else by the session the remote tab reports. */
function placeDraft(
  target: { tabId: string | null; sessionId: string },
  draft: { text: string; imagePaths: string[] }
): void {
  const paneKeyOf = (): string | undefined => {
    const state = useAppStore.getState()
    if (target.tabId) {
      const leafId = leafOf(state.terminalLayoutsByTabId[target.tabId]?.root)
      return leafId ? makePaneKey(target.tabId, leafId) : undefined
    }
    return Object.entries(state.agentStatusByPaneKey).find(
      ([, entry]) => entry?.providerSession?.id === target.sessionId
    )?.[0]
  }
  const place = (paneKey: string) =>
    appendToNativeChatComposerDraft(paneKey, {
      text: draft.text,
      images: draft.imagePaths.map((path) => ({ id: createNonSecureContextUuid(), path }))
    })
  const ready = paneKeyOf()
  if (ready) {
    place(ready)
    return
  }
  let stop = (): void => undefined
  const timer = setTimeout(() => stop(), DRAFT_WAIT_MS)
  stop = useAppStore.subscribe(() => {
    const paneKey = paneKeyOf()
    if (paneKey) {
      clearTimeout(timer)
      stop()
      place(paneKey)
    }
  })
}

function failed(message?: string): false {
  toast.error(
    message ||
      translate(
        'components.native-chat.terminalFork.failed',
        "Orca couldn't copy this chat into a new tab."
      )
  )
  return false
}

/** The copy's folder: a new session's file goes beside the source's, which names its account. */
function siblingTranscriptPath(transcriptPath: string | null, sessionId: string): string | null {
  const folder = transcriptPath?.match(/^(.*)[\\/][^\\/]+$/)?.[1]
  return folder ? `${folder}/${sessionId}.jsonl` : null
}

/**
 * Opens a new terminal tab in the chat's workspace running a copy of its conversation, on the
 * same account; the source tab keeps running untouched. Claude's copy is cut by Orca on the host;
 * Codex (and Claude where the host cannot cut) forks the whole conversation through its CLI.
 */
export async function launchNativeChatTerminalFork(
  source: NativeChatTerminalForkSource,
  cut: NativeChatTerminalForkCutRequest
): Promise<boolean> {
  let mode: NativeChatTerminalForkMode = 'fork'
  let session = { id: source.sessionId, transcriptPath: source.transcriptPath }
  let throughUuid: string | null = null
  if (source.agent === 'claude') {
    const copy = await copyClaudeTranscript(source, cut)
    if (copy.ok && copy.kind === 'copy') {
      mode = 'resume'
      session = { id: copy.sessionId, transcriptPath: copy.transcriptPath }
      throughUuid = copy.throughUuid
    } else if (copy.ok) {
      // Nothing came before the prompt: the restart starts a new conversation.
      const id = createNonSecureContextUuid()
      mode = 'new'
      session = { id, transcriptPath: siblingTranscriptPath(source.transcriptPath, id) }
    } else if (
      !(copy.reason === 'unsupported' && cut.kind === 'through-response' && cut.inLatestTurn)
    ) {
      return failed(copy.message)
    }
  } else if (cut.kind !== 'through-response' || !cut.inLatestTurn) {
    return failed()
  }
  const state = useAppStore.getState()
  const startup = buildNativeChatTerminalForkStartup({
    state,
    paneKey: source.paneKey,
    tabId: source.terminalTabId,
    worktreeId: source.worktreeId,
    agent: source.agent,
    mode,
    session
  })
  if (!startup) {
    return failed()
  }
  const tabId = await launchAiVaultSessionAndReveal({
    agent: source.agent,
    worktreeId: source.worktreeId,
    ...startup
  })
  if (tabId) {
    // The person asked from the chat, so the copy opens in its chat too.
    useAppStore.getState().setTabViewMode(tabId, 'chat')
  }
  if (throughUuid) {
    const tab = state.tabsByWorktree[source.worktreeId]?.find(
      (entry) => entry.id === source.terminalTabId
    )
    rememberNativeChatTerminalForkOrigin(session.id, {
      sourceSessionId: source.sessionId,
      sourceTabId: source.terminalTabId,
      worktreeId: source.worktreeId,
      sourceName:
        tab?.customTitle ||
        tab?.title ||
        translate('components.native-chat.terminalFork.sourceName', 'the original chat'),
      throughUuid,
      forkedAt: Date.now()
    })
  }
  if (cut.kind === 'before-prompt' && (cut.draft.text || cut.draft.imagePaths.length > 0)) {
    placeDraft({ tabId, sessionId: session.id }, cut.draft)
  }
  return true
}
