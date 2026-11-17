/**
 * A server with no app window (`orca serve` on a box) relays `orca show` to a connected desktop that
 * shows the workspace, the way it asks a desktop to host its browser pages. The desktop shows it in
 * its own window and answers with `agentShow.relayResult`.
 */
import { z } from 'zod'
import type { AgentShowContext, AgentShowRequest, AgentShowResult } from './agent-show-contract'

/** Desktops that show a server's `orca show` requests; servers ask only sockets advertising it. */
export const AGENT_SHOW_CLIENT_RELAY_CAPABILITY = 'agentShow.clientRelay.v1' as const

export type AgentShowRelayAsk =
  | { kind: 'show'; request: AgentShowRequest; context: AgentShowContext }
  | { kind: 'snap' }

/** Addressed to one desktop's renderer subscription, never broadcast. */
export type AgentShowRelayRequestEvent = {
  type: 'agentShowRequested'
  requestId: string
} & AgentShowRelayAsk

/** A window capture small enough for one RPC frame (base64). */
export type AgentShowRelayShot = {
  mime: 'image/png' | 'image/jpeg'
  base64: string
  width: number
  height: number
}

const Identity = z.string().min(1).max(256)

export const AgentShowRelayResultParams = z.object({
  requestId: Identity,
  /** This desktop does not show that workspace; the server asks the next one. */
  declined: z.boolean().optional(),
  result: z.unknown().optional(),
  shot: z
    .object({
      mime: z.enum(['image/png', 'image/jpeg']),
      // Why the cap: one inbound frame is 1 MiB; the desktop shrinks the capture to fit.
      base64: z.string().max(900_000),
      width: z.number().int().positive(),
      height: z.number().int().positive()
    })
    .optional(),
  error: z.string().max(2_000).optional()
})
export type AgentShowRelayResultParams = z.infer<typeof AgentShowRelayResultParams>

export type AgentShowRelayAnswer =
  | { kind: 'shown'; result: AgentShowResult }
  | { kind: 'shot'; shot: AgentShowRelayShot }
  | { kind: 'failed'; error: string }
  | 'declined'

/** The base64 budget a relayed capture must fit (frame cap less the envelope). */
export const AGENT_SHOW_RELAY_SHOT_BASE64_BUDGET = 880_000
