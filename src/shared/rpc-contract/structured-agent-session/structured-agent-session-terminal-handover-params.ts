import * as z from 'zod'
import { SessionId } from './structured-agent-session-identifiers'

export const AgentSessionTerminalHandoverParams = z
  .object({
    sessionId: SessionId,
    action: z.enum(['begin', 'bind', 'end']),
    /** `bind`: the pane the terminal's agent was launched in, as this host names it. */
    paneKey: z.string().min(1).optional()
  })
  .strict()

export const AgentSessionResumeListParams = z.object({ sessionId: SessionId }).strict()
