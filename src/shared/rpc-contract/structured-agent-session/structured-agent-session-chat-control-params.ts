import * as z from 'zod'
import { SessionId } from './structured-agent-session-identifiers'
import {
  ChatLaunchProfilePath,
  ChatLaunchProfileSchema
} from '../../agent-launch/contracts/chat-launch-profile'

/** A chat by its session id, or a chat worker by its handle (`structworker_…`). */
const ChatTarget = {
  sessionId: SessionId.optional(),
  worker: z.string().max(512).startsWith('structworker_').optional()
}

const oneTarget = (value: { sessionId?: string; worker?: string }): boolean =>
  Boolean(value.sessionId) !== Boolean(value.worker)

/** `orca chat send`: a person's or a program's text, as if typed in the chat. */
export const AgentSessionSendTextParams = z
  .object({
    ...ChatTarget,
    text: z.string().min(1).max(1_000_000),
    /** Wait for the running turn to end instead of steering it. */
    queue: z.boolean().optional()
  })
  .strict()
  .refine(oneTarget, 'Name a chat or a worker')

export const AgentSessionChatControlParams = z
  .object(ChatTarget)
  .strict()
  .refine(oneTarget, 'Name a chat or a worker')

/** `orca chat login` / `orca chat profile`: the login (Claude config folder) the chat's agent runs
 *  on, and with `profile` its whole launch profile, from its next start. */
export const AgentSessionSetLaunchProfileParams = z
  .object({
    ...ChatTarget,
    claudeConfigDir: ChatLaunchProfilePath.optional(),
    profile: ChatLaunchProfileSchema.optional()
  })
  .strict()
  .refine(oneTarget, 'Name a chat or a worker')
  .refine((value) => value.claudeConfigDir || value.profile, 'Name a login or a profile')
