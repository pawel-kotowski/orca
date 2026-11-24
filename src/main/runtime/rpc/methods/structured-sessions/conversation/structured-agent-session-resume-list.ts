import { join } from 'node:path'
import { readdir, realpath } from 'node:fs/promises'
import { AgentSessionResumeListParams } from '../../../../../../shared/rpc-contract/structured-agent-session/structured-agent-session-terminal-handover-params'
import type { AgentSessionResumeList } from '../../../../../../shared/agent-session/lifecycle/operations/agent-session-resume-list'
import { agentSessionAccountHomePath } from '../../../../../../shared/agent-session/lifecycle/accounts/agent-session-account-home'
import { agentSessionProviderHandleChainHead } from '../../../../../../shared/agent-session/lifecycle/provider-handles/agent-session-provider-handle'
import { isNativeLocalLocation } from '../../../../../../shared/execution-host/execution-host'
import {
  encodeClaudeProjectPaths,
  isClaudeProjectOwnBucketName
} from '../../../../../ai-vault/scanners/claude/claude-project-dir-encoding'
import { listClaudeProjectFolderSessions } from '../../../../../claude/claude-project-sessions'
import { agentSessionPinnedLaunchDirectory } from '../../../../agent-session/records/agent-session-record-launch-directory'
import { structuredAgentRuntimeMetadata } from '../../../../agent-session/installation/structured-agent-runtime-metadata'
import { defineMethod } from '../../../core'
import { requireInstalledStructuredHost } from '../creation/structured-agent-session-gate'

export const STRUCTURED_AGENT_SESSION_RESUME_LIST_METHODS = [
  defineMethod({
    /** What a terminal chat's Resume lists: the Claude conversations of this chat's own folder. */
    name: 'agentSession.resumeList',
    permission: 'workspace',
    params: AgentSessionResumeListParams,
    handler: async ({ sessionId }, ctx): Promise<AgentSessionResumeList> => {
      const host = await requireInstalledStructuredHost(ctx, sessionId)
      const record = host.deps.store.getRecord(sessionId)
      const home = record && agentSessionAccountHomePath(record.accountHome)
      const history = record && structuredAgentRuntimeMetadata(record.provider)?.sessionHistory
      const cwd =
        record &&
        (agentSessionPinnedLaunchDirectory(record) ??
          (await host.deps.resolveWorkspacePath?.(record.location.workspaceId)))
      if (
        record?.provider !== 'claude' ||
        !home ||
        !history ||
        !cwd ||
        !isNativeLocalLocation(record.location)
      ) {
        return { status: 'unsupported' }
      }
      const real = await realpath(cwd).catch(() => cwd)
      const encoded = [cwd, real].flatMap((path) => encodeClaudeProjectPaths(path))
      const projects = join(home, 'projects')
      const folders = (await readdir(projects).catch(() => [] as string[])).filter((name) =>
        encoded.some((path) => isClaudeProjectOwnBucketName(name, path))
      )
      const lists = await Promise.all(
        folders.map((name) => listClaudeProjectFolderSessions(join(projects, name)))
      )
      const chats = new Map(
        host.deps.store.listConversations().flatMap((conversation) => {
          const head = agentSessionProviderHandleChainHead(conversation.providerHandleChain)
          return head && conversation.provider === 'claude'
            ? [
                [
                  history.rowSessionId(head),
                  {
                    sessionId: conversation.sessionId,
                    workspaceId: conversation.location.workspaceId
                  }
                ] as const
              ]
            : []
        })
      )
      const sessions = lists
        .flat()
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((session) => {
          const chat = chats.get(session.sessionId)
          return chat ? { ...session, chat } : session
        })
      return { status: 'ok', cwd, sessions }
    }
  })
]
