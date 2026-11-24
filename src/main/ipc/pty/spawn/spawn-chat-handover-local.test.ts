import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const dir = vi.hoisted(() => ({ path: '' }))
vi.mock('../../../../shared/app-lifecycle/app-environment', () => ({
  getAppEnvironment: () => ({ getPath: () => dir.path })
}))

import {
  beginStructuredChatTerminalHold,
  CHAT_HANDOVER_ENV,
  resetStructuredChatTerminalHoldsForTests
} from '../../../runtime/agent-session/ownership/structured-chat-terminal-holds'
import { claimChatHandoverSpawn, stripChatHandoverToken } from './spawn-chat-handover'

const ID = 'ce489453-5f6c-4b04-bd51-b00646a38a10'
const claims = (args: Parameters<typeof claimChatHandoverSpawn>[0]) => {
  const claim = claimChatHandoverSpawn(args)
  claim?.settle(false)
  return claim !== null
}

beforeEach(() => {
  dir.path = mkdtempSync(join(tmpdir(), 'chat-handover-'))
  resetStructuredChatTerminalHoldsForTests()
  beginStructuredChatTerminalHold('chat', {
    token: 't',
    id: 'i',
    agent: 'claude',
    conversationId: ID
  })
})
afterEach(() => rmSync(dir.path, { recursive: true, force: true }))

it('claims the starts a held conversation is in, and no others', () => {
  expect(claims({ env: { [CHAT_HANDOVER_ENV]: 't' }, command: 'claude' })).toBe(true)
  // A stale token on a plain shell of the same pane.
  expect(claims({ env: { [CHAT_HANDOVER_ENV]: 'stale' } })).toBe(false)
  expect(claims({ command: `claude --resume '${ID}'` })).toBe(true)
  expect(claims({ resumeProviderSession: { key: 'session_id', id: ID } })).toBe(true)
  expect(claims({ command: `claude --resume '${ID}' --fork-session` })).toBe(false)
  expect(claims({ command: `codex --no-daemon 'fork' '${ID}'` })).toBe(false)
  expect(claims({ command: 'claude' })).toBe(false)
  expect(claims({ command: `codex -c a=b 'resume' -m x '${ID}'` })).toBe(true)
  // A worker told to read the conversation's scratch files is another conversation.
  expect(claims({ command: `claude 'Read /tmp/x/${ID}/scratchpad/brief.md and do it'` })).toBe(
    false
  )
  expect(claims({ command: `claude 'the chat is ${ID} today'` })).toBe(false)
  // The host refuses or reattaches these itself.
  expect(claims({ command: `claude --resume ${ID}`, resumeOrigin: 'saved' })).toBe(false)
  expect(claims({ command: `claude --resume ${ID}`, sessionId: 'pty' })).toBe(false)
  expect(claims({ command: `claude --resume ${ID}`, connectionId: 'ssh' })).toBe(false)
})

it('keeps the token from the agent and from later starts of the pane', () => {
  const ctx = {
    args: { env: { A: '1', [CHAT_HANDOVER_ENV]: 't' } },
    spawnOptions: { cols: 1, rows: 1, env: { B: '2', [CHAT_HANDOVER_ENV]: 't' } }
  } as never as Parameters<typeof stripChatHandoverToken>[0]
  stripChatHandoverToken(ctx)
  expect(ctx.args.env).toEqual({ A: '1' })
  expect(ctx.spawnOptions.env).toEqual({ B: '2' })
})
