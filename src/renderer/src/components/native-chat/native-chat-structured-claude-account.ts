import { useEffect, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { readIpcErrorMessage } from '@/runtime/errors/ipc-error'
import { callStructuredAgentSession } from '@/runtime/native-chat/requests/structured-agent-session-call'
import { getRuntimeTargetHostId } from '@/runtime/rpc/targets/runtime-client-target'
import { getWindowParkVisible } from '@/lib/window-activity/window-park-visibility'
import { structuredAgentSessionPaneKey } from '../../../../shared/agent-session/view/structured-agent-session-projection'
import { workspaceClaudeAccountId } from '../../../../shared/claude-workspace-account'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type {
  AgentSessionClaudeAccount,
  AgentSessionClaudeAccountRefusal,
  AgentSessionSetClaudeAccountResult
} from '../../../../shared/agent-session/lifecycle/accounts/agent-session-claude-account'
import { useStructuredAgentSessionHostExecutionPhase } from './session/status/structured-agent-session-status-hooks'
import type { NativeChatStructuredAccountScope } from './native-chat-account-scope'

type Chat = Pick<NativeChatStructuredAccountScope, 'sessionId' | 'target'>
type Entry = {
  account: AgentSessionClaudeAccount | null
  /** What the read was asked under; an agent's start or stop and a local switch move it. */
  stamp: string
  fetchedAt: number
  inFlight: boolean
}

const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
// The host reads usage at this cadence.
const REFRESH_MS = 5 * 60 * 1000
const UNFOUND_MS = 2_000
const LOCAL: RuntimeClientTarget = { kind: 'local' }

function entryKey(chat: Chat): string {
  return `${getRuntimeTargetHostId(chat.target)}\u0000${chat.sessionId}`
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function refresh(chat: Chat, stamp: string): Promise<void> {
  const key = entryKey(chat)
  const previous = entries.get(key)
  if (previous?.inFlight) {
    // The read in flight asks again when it lands under a moved stamp.
    entries.set(key, { ...previous, stamp })
    return
  }
  entries.set(key, {
    account: previous?.account ?? null,
    stamp,
    fetchedAt: previous?.fetchedAt ?? Number.NEGATIVE_INFINITY,
    inFlight: true
  })
  // An older host has no such method: no account, so no chip.
  const account = await callStructuredAgentSession<AgentSessionClaudeAccount>(
    chat.target,
    'agentSession.claudeAccount',
    { sessionId: chat.sessionId }
  ).catch((): AgentSessionClaudeAccount => entries.get(key)?.account ?? { status: 'unsupported' })
  const asked = entries.get(key)?.stamp ?? stamp
  entries.set(key, { account, stamp: asked, fetchedAt: window.performance.now(), inFlight: false })
  for (const listener of listeners) {
    listener()
  }
  if (asked !== stamp) {
    await refresh(chat, asked)
  }
}

/** The Claude account a structured chat runs on, as its host reads it; null until it answers. */
export function useStructuredClaudeAccount(
  chat: NativeChatStructuredAccountScope | null
): AgentSessionClaudeAccount | null {
  const sessionId = chat?.sessionId ?? ''
  const target = chat?.target ?? LOCAL
  const worktreeId = chat?.worktreeId ?? null
  const key = chat ? entryKey(chat) : null
  const account = useSyncExternalStore(subscribe, () =>
    key === null ? null : (entries.get(key)?.account ?? null)
  )
  const phase = useStructuredAgentSessionHostExecutionPhase(sessionId, target)
  const selection = useAppStore((state) =>
    target.kind === 'local' && state.settings
      ? (workspaceClaudeAccountId(state.settings, worktreeId) ??
        state.settings.activeClaudeManagedAccountId ??
        '')
      : ''
  )
  const stamp = `${phase ?? ''}\u0000${selection}`
  useEffect(() => {
    if (key === null) {
      return
    }
    const check = (): void => {
      const entry = entries.get(key)
      if (
        !entry ||
        entry.stamp !== stamp ||
        (!entry.inFlight && window.performance.now() - entry.fetchedAt >= REFRESH_MS)
      ) {
        void refresh({ sessionId, target }, stamp)
      }
    }
    check()
    const timer = window.setInterval(check, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [key, sessionId, target, stamp])
  // A new chat's session reaches this computer's host a moment after its box is drawn. Any other
  // answer is final, so no chat the host knows is asked about again this way.
  const unfound = useAppStore(
    (state) =>
      chat !== null &&
      target.kind === 'local' &&
      account?.status === 'unknown_chat' &&
      !state.agentStatusByPaneKey.has(structuredAgentSessionPaneKey(chat.tabId, sessionId))
  )
  useEffect(() => {
    if (!unfound || key === null) {
      return
    }
    const timer = window.setInterval(() => {
      const entry = entries.get(key)
      // Every reader of the chat shares one ask, and a hidden window asks nothing.
      if (
        getWindowParkVisible() &&
        (!entry || window.performance.now() - entry.fetchedAt >= UNFOUND_MS)
      ) {
        void refresh({ sessionId, target }, stamp)
      }
    }, UNFOUND_MS)
    return () => window.clearInterval(timer)
  }, [unfound, key, sessionId, target, stamp])
  return account
}

/** Moves the chat's workspace to an account of its host; null when the host did not take it. */
export async function moveStructuredClaudeAccount(
  chat: Chat,
  accountId: string,
  name: string
): Promise<Exclude<AgentSessionSetClaudeAccountResult, { outcome: 'refused' }> | null> {
  let failure: string | undefined
  const result = await callStructuredAgentSession<AgentSessionSetClaudeAccountResult>(
    chat.target,
    'agentSession.setClaudeAccount',
    { sessionId: chat.sessionId, accountId }
  ).catch((error: unknown) => {
    failure = readIpcErrorMessage(error)
    return null
  })
  const stamp = entries.get(entryKey(chat))?.stamp ?? ''
  void refresh(chat, `${stamp}\u0000moved`)
  if (result === null || result.outcome === 'refused') {
    toast.error(
      translate(
        'components.native-chat.account.moveFailed',
        'Could not move this chat to {{name}}',
        { name }
      ),
      { description: result ? refusalText(result.reason) : failure }
    )
    return null
  }
  return result
}

/** Says when a moved chat's next start runs on the account. */
export function toastStructuredClaudeMove(
  outcome: 'next_message' | 'after_work' | 'unchanged',
  name: string
): void {
  if (outcome === 'unchanged') {
    return
  }
  toast.success(
    translate('components.native-chat.account.switching', 'Moving this chat to {{name}}', { name }),
    {
      description:
        outcome === 'next_message'
          ? translate(
              'components.native-chat.account.movesNextMessage',
              'It moves with your next message, and so does every other chat of this workspace.'
            )
          : translate(
              'components.native-chat.account.movesAfterWork',
              'It moves with the first message after its work ends, and so does every other chat of this workspace.'
            )
    }
  )
}

function refusalText(reason: AgentSessionClaudeAccountRefusal): string {
  switch (reason) {
    case 'unknown_account':
      return translate(
        'components.native-chat.account.moveUnknownLogin',
        'That machine is no longer signed in to it.'
      )
    case 'setup_failed':
      return translate(
        'components.native-chat.account.moveSetupFailed',
        'Its Claude folder could not be set up.'
      )
    case 'not_shared':
      return translate(
        'components.native-chat.account.moveNotShared',
        'That login keeps its conversations apart and cannot read this one.'
      )
    case 'not_local':
      return translate(
        'components.native-chat.account.moveNotLocal',
        "This chat does not run on one of its machine's accounts."
      )
  }
}
