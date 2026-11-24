import * as z from 'zod'
import { SessionId } from './structured-agent-session-identifiers'

export const AgentSessionClaudeAccountParams = z.object({ sessionId: SessionId }).strict()

export const AgentSessionSetClaudeAccountParams = z
  .object({ sessionId: SessionId, accountId: z.string().min(1) })
  .strict()
