import * as z from 'zod'
import { SessionId } from './structured-agent-session-identifiers'

export const AgentSessionTerminalHandoverParams = z
  .object({
    sessionId: SessionId,
    action: z.enum(['begin', 'abandon', 'end', 'status']),
    /** `begin`, `abandon`: the client's own mark for this handover. */
    token: z.string().min(1).optional(),
    /** `end`: the handover meant, so a late retry never ends a newer one. */
    holdId: z.string().min(1).optional()
  })
  .strict()

export const AgentSessionResumeListParams = z.object({ sessionId: SessionId }).strict()
