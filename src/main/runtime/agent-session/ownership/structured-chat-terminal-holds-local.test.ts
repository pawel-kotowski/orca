import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const dir = vi.hoisted(() => ({ path: '' }))
vi.mock('../../../../shared/app-lifecycle/app-environment', () => ({
  getAppEnvironment: () => ({ getPath: () => dir.path })
}))

import {
  abandonStructuredChatTerminalHold,
  admitStructuredChatTerminalSpawn,
  beginStructuredChatTerminalHold,
  bindStructuredChatTerminal,
  conversationHeldForTerminal,
  failStructuredChatTerminalSpawn,
  heldStructuredChats,
  noteStructuredChatTerminalReport,
  noteStructuredChatTerminalRan,
  onStructuredChatTerminalHoldEnded,
  releaseStructuredChatTerminalHold,
  releaseUnlaunchedStructuredChatTerminalHolds,
  resetStructuredChatTerminalHoldsForTests,
  structuredChatTerminalHold,
  structuredChatTerminalHoldsUnreadable,
  structuredChatTerminalMayWrite,
  type TerminalHoldPane
} from './structured-chat-terminal-holds'

const file = () => join(dir.path, 'structured-chat-terminal-holds.json')

beforeEach(() => {
  dir.path = mkdtempSync(join(tmpdir(), 'terminal-holds-'))
  resetStructuredChatTerminalHoldsForTests()
})
afterEach(() => rmSync(dir.path, { recursive: true, force: true }))

const begin = (token = 'a', sessionId = 'chat') =>
  beginStructuredChatTerminalHold(sessionId, {
    token,
    id: `id-${token}`,
    agent: 'codex',
    conversationId: 'conversation'
  })

function open(token = 'a', sessionId = 'chat'): void {
  begin(token, sessionId)
  admitStructuredChatTerminalSpawn(token, { ptyId: 'pty', paneKey: 'tab:leaf' })
  bindStructuredChatTerminal(token, { ptyId: 'pty', incarnationId: 'i', paneKey: 'tab:leaf' })
}

const mayWrite = (pane: TerminalHoldPane, rows = false) =>
  structuredChatTerminalMayWrite(structuredChatTerminalHold('chat')!, { pane, rowsMayWrite: rows })

it('holds from the press, through a shell that has not run the agent yet', () => {
  begin()
  expect(mayWrite('absent')).toBe(true)
  admitStructuredChatTerminalSpawn('a', { ptyId: 'pty', paneKey: 'tab:leaf' })
  expect(mayWrite('running')).toBe(true)
  // The shell is at its prompt and the agent's command is about to be typed.
  expect(mayWrite('shell')).toBe(true)
})

it('H1: a terminal that runs anything holds, whatever its rows say', () => {
  open()
  noteStructuredChatTerminalReport('pty', 'conversation')
  expect(mayWrite('running')).toBe(true)
  // A slow probe, or a daemon that does not answer, proves nothing.
  expect(mayWrite('unknown')).toBe(true)
  expect(mayWrite('shell')).toBe(false)
  // Another terminal may have the same conversation.
  expect(mayWrite('shell', true)).toBe(true)
})

it('H3: ends when the terminal is gone, also one never seen alive', () => {
  open()
  expect(mayWrite('absent')).toBe(false)
})

it('H3: an agent that quit without a report is done once it was seen to run', () => {
  open()
  noteStructuredChatTerminalRan('chat')
  expect(mayWrite('shell')).toBe(false)
})

it('H3: what was seen of the terminal outlives a restart', () => {
  open()
  noteStructuredChatTerminalRan('chat')
  resetStructuredChatTerminalHoldsForTests()
  expect(structuredChatTerminalHold('chat')).toMatchObject({ ran: true, incarnationId: 'i' })
  expect(mayWrite('unknown')).toBe(true)
  expect(mayWrite('shell')).toBe(false)
})

it('H3: a client that goes away before its terminal was asked for leaves no hold', () => {
  begin()
  abandonStructuredChatTerminalHold('chat', 'a')
  expect(heldStructuredChats()).toEqual([])
  // Its launch, if it still comes, starts no second writer.
  expect(() => admitStructuredChatTerminalSpawn('a', { ptyId: null, paneKey: null })).toThrow(
    'went back to its chat'
  )
})

it('H3: after a restart a handover that reached no terminal ends, and one that did stays', () => {
  begin('a', 'unlaunched')
  open('b')
  resetStructuredChatTerminalHoldsForTests()
  releaseUnlaunchedStructuredChatTerminalHolds()
  expect(heldStructuredChats()).toEqual(['chat'])
})

it('keeps a hold whose terminal was asked for, whoever gives up on it', () => {
  open()
  abandonStructuredChatTerminalHold('chat', 'a')
  failStructuredChatTerminalSpawn('a')
  expect(heldStructuredChats()).toEqual(['chat'])
})

it('a spawn that fails before its terminal was asked for frees the chat', () => {
  begin()
  failStructuredChatTerminalSpawn('a')
  expect(heldStructuredChats()).toEqual([])
})

it('M1: an unreadable file is not an empty one, and is kept', () => {
  writeFileSync(file(), '{"chat":{"tok')
  expect(heldStructuredChats()).toEqual([])
  expect(structuredChatTerminalHoldsUnreadable()).toBe(true)
  begin()
  expect(
    readFileSync(join(dir.path, 'structured-chat-terminal-holds.unreadable.json'), 'utf8')
  ).toContain('tok')
})

it('M1: no hold is begun that cannot be saved', () => {
  rmSync(dir.path, { recursive: true })
  expect(() => begin()).toThrow()
  expect(heldStructuredChats()).toEqual([])
})

it('M2: a release names its own handover', () => {
  open()
  expect(releaseStructuredChatTerminalHold('chat', 'older')).toBe(false)
  expect(releaseStructuredChatTerminalHold('chat', 'a')).toBe(true)
  expect(readFileSync(file(), 'utf8')).toBe('{}')
})

it('M3: only a report from its own terminal says its agent ran', () => {
  open()
  noteStructuredChatTerminalReport('the pane of the handover before', 'conversation')
  noteStructuredChatTerminalReport('pty', 'another conversation')
  expect(structuredChatTerminalHold('chat')?.ran).toBe(false)
  noteStructuredChatTerminalReport('pty', 'conversation')
  expect(structuredChatTerminalHold('chat')?.ran).toBe(true)
})

it('M6: an abandon that overtakes its begin leaves no hold', () => {
  abandonStructuredChatTerminalHold('chat', 'a')
  expect(begin()).toBe(false)
  expect(heldStructuredChats()).toEqual([])
  expect(existsSync(file())).toBe(false)
})

it('M6: every release tells what waits for the chat', () => {
  const ended: string[] = []
  onStructuredChatTerminalHoldEnded((sessionId) => ended.push(sessionId))
  begin()
  abandonStructuredChatTerminalHold('chat', 'a')
  open('b')
  releaseStructuredChatTerminalHold('chat', 'b')
  begin('c')
  failStructuredChatTerminalSpawn('c')
  expect(ended).toEqual(['chat', 'chat', 'chat'])
})

it('a restored terminal never resumes a held conversation by itself', () => {
  open()
  expect(conversationHeldForTerminal('conversation')).toBe(true)
  expect(conversationHeldForTerminal('another')).toBe(false)
})
