import { MoveToInboxParams } from '../../../../../../shared/rpc-contract/structured-agent-session/move-to-inbox-params'
import { defineMethod } from '../../../core'
import { requireRenameStructuredHost } from '../creation/structured-agent-session-gate'

/** A terminal agent's `orca move-to-inbox` goes to the hook server; a chat's agent has no pane to post as. */
export const STRUCTURED_AGENT_SESSION_MOVE_TO_INBOX_METHODS = [
  defineMethod({
    name: 'agentSession.moveToInbox',
    permission: 'workspace',
    params: MoveToInboxParams,
    handler: async (params, ctx) => {
      // As rename: reads no journal, so the CLI's rename-only capability admits it.
      const host = await requireRenameStructuredHost(ctx, params.sessionId)
      return { moved: await host.reads.moveToInbox(params.sessionId, params.message) }
    }
  })
]
