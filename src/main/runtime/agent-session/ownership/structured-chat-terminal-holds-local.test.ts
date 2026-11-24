import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const dir = vi.hoisted(() => ({ path: '' }))
vi.mock('../../../../shared/app-lifecycle/app-environment', () => ({
  getAppEnvironment: () => ({ getPath: () => dir.path })
}))

import {
  beginStructuredChatTerminalHold,
  bindStructuredChatTerminalHold,
  noteStructuredChatTerminalReport,
  releaseStructuredChatTerminalHold,
  resetStructuredChatTerminalHoldsForTests,
  structuredChatTerminalHold,
  structuredChatTerminalMayWrite
} from './structured-chat-terminal-holds'

beforeEach(() => {
  dir.path = mkdtempSync(join(tmpdir(), 'terminal-holds-'))
  resetStructuredChatTerminalHoldsForTests()
})
afterEach(() => rmSync(dir.path, { recursive: true, force: true }))

it('holds the chat from the press, before the terminal exists and until its agent reports', () => {
  expect(structuredChatTerminalMayWrite('chat', 'missing', false)).toBe(false)
  beginStructuredChatTerminalHold('chat', 'a', 'conversation')
  // The pane is bound before its process is spawned: not there yet is not gone.
  bindStructuredChatTerminalHold('chat', 'a', 'tab:leaf')
  expect(structuredChatTerminalMayWrite('chat', 'missing', false)).toBe(true)
  expect(structuredChatTerminalMayWrite('chat', 'dead', false)).toBe(true)
  // The shell is up and the agent's command is about to be typed into it.
  expect(structuredChatTerminalMayWrite('chat', 'shell', false)).toBe(true)
})

it('gives the chat back once the agent is done or its pane is gone', () => {
  beginStructuredChatTerminalHold('chat', 'a', 'conversation')
  bindStructuredChatTerminalHold('chat', 'a', 'tab:leaf')
  noteStructuredChatTerminalReport('another')
  expect(structuredChatTerminalMayWrite('chat', 'shell', false)).toBe(true)
  noteStructuredChatTerminalReport('conversation')
  expect(structuredChatTerminalMayWrite('chat', 'running', true)).toBe(true)
  expect(structuredChatTerminalMayWrite('chat', 'shell', false)).toBe(false)

  beginStructuredChatTerminalHold('closed', 'b', 'other')
  structuredChatTerminalMayWrite('closed', 'running', false)
  expect(structuredChatTerminalMayWrite('closed', 'dead', false)).toBe(false)
})

it('lets only the handover that began it bind or abandon it', () => {
  beginStructuredChatTerminalHold('chat', 'a', 'conversation')
  bindStructuredChatTerminalHold('chat', 'b', 'other:leaf')
  expect(structuredChatTerminalHold('chat')?.paneKey).toBeNull()
  expect(releaseStructuredChatTerminalHold('chat', 'b')).toBe(false)
  expect(releaseStructuredChatTerminalHold('chat', 'a')).toBe(true)
})

it('outlives a restart, where a pane not yet reattached is unknown rather than gone', async () => {
  beginStructuredChatTerminalHold('chat', 'a', 'conversation')
  bindStructuredChatTerminalHold('chat', 'a', 'tab:leaf')
  noteStructuredChatTerminalReport('conversation')
  structuredChatTerminalMayWrite('chat', 'running', true)
  expect(readFileSync(join(dir.path, 'structured-chat-terminal-holds.json'), 'utf8')).toContain(
    'tab:leaf'
  )
  vi.resetModules()
  const restarted = await import('./structured-chat-terminal-holds')
  expect(restarted.structuredChatTerminalHold('chat')?.reported).toBe(true)
  expect(restarted.structuredChatTerminalMayWrite('chat', 'missing', false)).toBe(true)
  expect(restarted.structuredChatTerminalMayWrite('chat', 'shell', false)).toBe(false)
})
