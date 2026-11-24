import type {
  AgentSessionClaudeAccount,
  AgentSessionSetClaudeAccountResult
} from '../../../../../../shared/agent-session/lifecycle/accounts/agent-session-claude-account'
import { agentSessionAccountHomePath } from '../../../../../../shared/agent-session/lifecycle/accounts/agent-session-account-home'
import { agentSessionProviderHandleChainHead } from '../../../../../../shared/agent-session/lifecycle/provider-handles/agent-session-provider-handle'
import {
  isHostClaudeAccount,
  withClaudeAccountEntry
} from '../../../../../../shared/claude-workspace-account'
import { isNativeLocalLocation } from '../../../../../../shared/execution-host/execution-host'
import {
  AgentSessionClaudeAccountParams,
  AgentSessionSetClaudeAccountParams
} from '../../../../../../shared/rpc-contract/structured-agent-session/structured-agent-session-claude-account-params'
import { getClaudeProfileRouter } from '../../../../../claude-accounts/profiles/routing/claude-profile-installed-router'
import { moveClaudeChatAccount } from '../../../../../claude-accounts/session-login/claude-chat-account-move'
import { readClaudeFolderSessionLogin } from '../../../../../claude-accounts/session-login/claude-session-login-read'
import { defineMethod, type RpcContext } from '../../../core'
import { requireInstalledStructuredHost } from '../creation/structured-agent-session-gate'

/** A Claude chat on one of this host's own folders; null for any other chat. */
async function claudeChat(sessionId: string, ctx: RpcContext) {
  const host = await requireInstalledStructuredHost(ctx, sessionId)
  const record = host.deps.store.getRecord(sessionId)
  const router = getClaudeProfileRouter()
  return record?.provider === 'claude' && router && isNativeLocalLocation(record.location)
    ? {
        host,
        record,
        router,
        runningHome: agentSessionAccountHomePath(host.childAccountHome(sessionId) ?? null)
      }
    : null
}

export const STRUCTURED_AGENT_SESSION_CLAUDE_ACCOUNT_METHODS = [
  defineMethod({
    name: 'agentSession.claudeAccount',
    permission: 'workspace',
    params: AgentSessionClaudeAccountParams,
    handler: async ({ sessionId }, ctx): Promise<AgentSessionClaudeAccount> => {
      const chat = await claudeChat(sessionId, ctx)
      if (!chat) {
        return { status: 'unsupported' }
      }
      const { host, record, router, runningHome } = chat
      const nextHome = agentSessionAccountHomePath(
        (await host.deps.launchAccountHome?.(record, 'identity')) ?? record.accountHome
      )
      if (!nextHome) {
        return { status: 'unsupported' }
      }
      const settings = ctx.runtime.requireStore().getSettings()
      const accounts = (settings.claudeManagedAccounts ?? []).filter((account) =>
        isHostClaudeAccount(settings, account.id)
      )
      const next = await readClaudeFolderSessionLogin(nextHome)
      // An account covered by the system login runs in the system folder, which names no account.
      const selected = router.selectedProfile(
        router.accountForLaunch(null, record.location.workspaceId)
      )?.accountId
      return {
        status: 'ok',
        running:
          runningHome === null
            ? null
            : runningHome === nextHome
              ? next
              : await readClaudeFolderSessionLogin(runningHome),
        next: { ...next, accountId: next.accountId ?? selected ?? null },
        choices: accounts.map(({ id, email }) => ({ accountId: id, email }))
      }
    }
  }),
  defineMethod({
    name: 'agentSession.setClaudeAccount',
    permission: 'accounts-admin',
    params: AgentSessionSetClaudeAccountParams,
    handler: async ({ sessionId, accountId }, ctx): Promise<AgentSessionSetClaudeAccountResult> => {
      const chat = await claudeChat(sessionId, ctx)
      if (!chat) {
        return { outcome: 'refused', reason: 'not_local' }
      }
      const { host, record, router, runningHome } = chat
      const settings = () => ctx.runtime.requireStore().getSettings()
      return moveClaudeChatAccount(
        {
          accountId,
          workspaceId: record.location.workspaceId,
          runningHome,
          conversationHome: agentSessionProviderHandleChainHead(record.providerHandleChain)
            ? (runningHome ??
              agentSessionAccountHomePath(
                record.launchedAccount?.accountHome ?? record.accountHome
              ))
            : null
        },
        {
          router,
          hasAccount: (id) => isHostClaudeAccount(settings(), id),
          saveWorkspaceAccount: (workspaceId, id) =>
            ctx.runtime.updateClientSettings({
              claudeAccountByWorktreeId: withClaudeAccountEntry(
                settings().claudeAccountByWorktreeId,
                workspaceId,
                id
              )
            }),
          owesWork: () => host.sessionOwesWork(sessionId)
        }
      )
    }
  })
]
