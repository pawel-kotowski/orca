import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { callStructuredAgentSession } from '@/runtime/native-chat/requests/structured-agent-session-call'
import { activateAiVaultStructuredSession } from '@/lib/agent-session/open/activate-ai-vault-structured-session'
import type { ConfirmationDialogContextValue } from '@/components/dismiss/confirmation/confirmation-dialog-context'
import { resumeAiVaultSessionHere } from '@/components/right-sidebar/ai-vault/session-actions/ai-vault-session-resume-here'
import { resumeAiVaultSessionInNewChat } from '@/components/right-sidebar/ai-vault/session-actions/ai-vault-session-resume-in-chat-launch'
import { resolveAiVaultPanelSessionListRequest } from '@/components/right-sidebar/ai-vault/scanning/ai-vault-panel-session-list-request'
import { aiVaultSessionListArgs } from '@/components/right-sidebar/ai-vault/scanning/ai-vault-session-list-request'
import { createNonSecureContextUuid } from '../../../../shared/identifiers/non-secure-context-uuid'
import {
  aiVaultHistoryAgents,
  isAiVaultAgent,
  isAiVaultSessionResumableContent,
  type AiVaultSession
} from '../../../../shared/ai-vault/contracts/ai-vault-types'
import { adoptsCliConversations } from '../../../../shared/agent-session/view/structured-agent-cli-conversation-adoption'
import {
  LOCAL_EXECUTION_HOST_ID,
  toRuntimeExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host/execution-host'
import type { AgentSessionResumeList } from '../../../../shared/agent-session/lifecycle/operations/agent-session-resume-list'
import type { NativeChatStructuredAccountScope } from './native-chat-account-scope'
import type { NativeChatListedConversation } from './native-chat-conversation-list'

export type StructuredResumeConversation = NativeChatListedConversation & {
  session: AiVaultSession
}

function hostIdOf({ target }: NativeChatStructuredAccountScope): ExecutionHostId {
  return target.kind === 'environment'
    ? toRuntimeExecutionHostId(target.environmentId)
    : LOCAL_EXECUTION_HOST_ID
}

/** The agents whose saved conversations a chat can open: Claude's own list, else Session History's. */
export function structuredChatOffersResume(agent: string): boolean {
  return isAiVaultAgent(agent) && adoptsCliConversations(agent)
}

/** The conversations of the chat's own folder and agent, newest first. */
export async function listStructuredResumeConversations(
  scope: NativeChatStructuredAccountScope
): Promise<StructuredResumeConversation[]> {
  if (scope.agent === 'claude') {
    const own = await callStructuredAgentSession<AgentSessionResumeList>(
      scope.target,
      'agentSession.resumeList',
      { sessionId: scope.sessionId }
    ).catch((): AgentSessionResumeList => ({ status: 'unsupported' }))
    if (own.status === 'ok') {
      return own.sessions.map((entry) => ({
        id: entry.sessionId,
        title: entry.title,
        // A bot's first turn opens with Orca's own note; its title says more.
        firstPrompt:
          entry.title && entry.firstPrompt?.startsWith('[Orca:') ? null : entry.firstPrompt,
        updatedAt: entry.updatedAt,
        current: entry.chat?.sessionId === scope.sessionId,
        session: claudeHistorySession(scope, entry, own.cwd)
      }))
    }
  }
  return listHistoryConversations(scope)
}

async function listHistoryConversations(
  scope: NativeChatStructuredAccountScope
): Promise<StructuredResumeConversation[]> {
  const { agent, worktreeId, sessionId } = scope
  if (!worktreeId || !isAiVaultAgent(agent)) {
    return []
  }
  const request = resolveAiVaultPanelSessionListRequest(useAppStore.getState(), worktreeId)
  const { sessions } = await window.api.aiVault.listSessions(
    aiVaultSessionListArgs(
      { ...request, scopeOnly: true },
      { requestToken: createNonSecureContextUuid() }
    )
  )
  const agents = aiVaultHistoryAgents(agent)
  const folder = request.scopePaths[0]
  return sessions
    .filter(
      (session) =>
        !session.subagent &&
        agents.includes(session.agent) &&
        isAiVaultSessionResumableContent(session) &&
        (session.structuredSession
          ? session.structuredSession.workspaceId === worktreeId
          : session.cwd === folder || session.cwdAliases?.includes(folder ?? '') === true)
    )
    .map((session) => ({
      id: session.id,
      title: session.title,
      firstPrompt: session.lastUserPrompt ?? null,
      updatedAt: Date.parse(session.updatedAt ?? session.modifiedAt),
      current: session.structuredSession?.sessionId === sessionId,
      session
    }))
    .toSorted((left, right) => right.updatedAt - left.updatedAt)
}

function claudeHistorySession(
  scope: NativeChatStructuredAccountScope,
  entry: Extract<AgentSessionResumeList, { status: 'ok' }>['sessions'][number],
  cwd: string
): AiVaultSession {
  const executionHostId = hostIdOf(scope)
  const modifiedAt = new Date(entry.updatedAt).toISOString()
  return {
    id: `${executionHostId}:claude:${entry.sessionId}`,
    executionHostId,
    agent: 'claude',
    sessionId: entry.sessionId,
    title: entry.title ?? entry.firstPrompt ?? entry.sessionId,
    cwd,
    branch: null,
    model: null,
    filePath: '',
    codexHome: null,
    createdAt: null,
    updatedAt: modifiedAt,
    modifiedAt,
    messageCount: 1,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: '',
    subagent: null,
    ...(entry.chat ? { structuredSession: entry.chat } : {})
  }
}

function openChatTab(session: AiVaultSession): boolean {
  const owner = session.structuredSession
  return (
    owner !== undefined &&
    (useAppStore.getState().unifiedTabsByWorktree[owner.workspaceId] ?? []).some(
      (tab) => tab.contentType === 'agent-session' && tab.entityId === owner.sessionId
    )
  )
}

/**
 * Picks a conversation for this chat: one open elsewhere is shown there, any other takes this chat's
 * place, as a terminal's /resume does. A bot's chat is never replaced: its pick opens beside it.
 */
export function resumeStructuredConversation(args: {
  scope: NativeChatStructuredAccountScope
  session: AiVaultSession
  dismiss: () => void
  confirm: ConfirmationDialogContextValue
}): void {
  const { scope, session, dismiss, confirm } = args
  const { worktreeId, agent } = scope
  if (!worktreeId || !isAiVaultAgent(agent)) {
    return
  }
  if (openChatTab(session) || (scope.botName !== null && session.structuredSession)) {
    dismiss()
    void activateAiVaultStructuredSession(session)
    return
  }
  if (scope.botName !== null) {
    if (adoptsCliConversations(session.agent)) {
      dismiss()
      void resumeAiVaultSessionInNewChat(
        session,
        session.agent,
        worktreeId,
        createNonSecureContextUuid()
      )
    }
    return
  }
  const picked = resumeAiVaultSessionHere({
    session,
    here: { tabId: scope.tabId, workspaceId: worktreeId, agent, dismiss, confirm },
    actions: { canJumpToOriginalPane: false, resumeInNewChatWorkspaceId: worktreeId },
    jump: () => undefined
  })
  if (picked === false) {
    toast.warning(
      translate(
        'components.native-chat.resumeList.elsewhere',
        'This conversation belongs to another workspace.'
      )
    )
    return
  }
  dismiss()
}
