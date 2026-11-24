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
  beginStructuredChatTerminalHold,
  claimStructuredChatTerminalSpawn,
  conversationHeldForTerminal,
  expectStructuredChatTerminalHold,
  forgetUnreadableStructuredChatTerminalHolds,
  heldStructuredChats,
  noteStructuredChatTerminalRan,
  noteStructuredChatTerminalReport,
  onStructuredChatTerminalHoldEnded,
  releaseStructuredChatTerminalHold,
  releaseUnlaunchedStructuredChatTerminalHolds,
  resetStructuredChatTerminalHoldsForTests,
  restartInStructuredChatTerminal,
  structuredChatTerminalHold,
  structuredChatTerminalHoldsUnreadable,
  structuredChatTerminalMayWrite,
  structuredChatTerminalStarting,
  type TerminalHoldPane
} from './structured-chat-terminal-holds'

const file = () => join(dir.path, 'structured-chat-terminal-holds.json')
const aside = () => join(dir.path, 'structured-chat-terminal-holds.unreadable.json')

beforeEach(() => {
  dir.path = mkdtempSync(join(tmpdir(), 'terminal-holds-'))
  resetStructuredChatTerminalHoldsForTests()
})
afterEach(() => rmSync(dir.path, { recursive: true, force: true }))

const begin = (token = 'a', sessionId = 'chat', conversationId = 'conversation') =>
  beginStructuredChatTerminalHold(sessionId, {
    token,
    id: `id-${token}`,
    agent: 'codex',
    conversationId
  })

const TERMINAL = { ptyId: 'pty', paneKey: 'tab:leaf' }

function spawn(token: string | undefined = 'a', ptyId = 'pty', incarnationId = 'i'): void {
  const claim = claimStructuredChatTerminalSpawn(token, (id) => id === 'conversation')!
  claim.admit({ ptyId, paneKey: 'tab:leaf' })
  claim.bind({ ptyId, incarnationId, paneKey: 'tab:leaf' })
  claim.settle(false)
}

function open(token = 'a', sessionId = 'chat'): void {
  begin(token, sessionId)
  spawn(token)
}

const mayWrite = (pane: TerminalHoldPane, at = 0) =>
  structuredChatTerminalMayWrite(structuredChatTerminalHold('chat')!.terminals[at], pane)

it('holds through a shell that has not run the agent yet', () => {
  open()
  expect(mayWrite('running')).toBe(true)
  // The shell is at its prompt and the agent's command is about to be typed.
  expect(mayWrite('shell')).toBe(true)
})

it('H1: a terminal that runs anything, or cannot be read, holds', () => {
  open()
  noteStructuredChatTerminalReport('pty', 'conversation')
  expect(mayWrite('running')).toBe(true)
  expect(mayWrite('unknown')).toBe(true)
  expect(mayWrite('shell')).toBe(false)
})

it('H3: ends when the terminal is gone, also one never seen alive', () => {
  open()
  expect(mayWrite('absent')).toBe(false)
})

it('H3: what was seen of the terminal outlives a restart', () => {
  open()
  noteStructuredChatTerminalRan('chat', 'pty')
  resetStructuredChatTerminalHoldsForTests()
  expect(structuredChatTerminalHold('chat')?.terminals).toMatchObject([
    { ran: true, incarnationId: 'i' }
  ])
  expect(mayWrite('shell')).toBe(false)
})

it('H3: a client that goes away before its terminal was asked for leaves no hold', () => {
  begin()
  abandonStructuredChatTerminalHold('chat', 'a')
  expect(heldStructuredChats()).toEqual([])
  // Its launch, if it still comes, starts no second writer.
  const late = claimStructuredChatTerminalSpawn('a', () => false)!
  expect(() => late.admit(TERMINAL)).toThrow('went back to its chat')
})

it('refuses the spawn of a handover that ended while it was prepared', () => {
  begin()
  const claim = claimStructuredChatTerminalSpawn('a', () => false)!
  abandonStructuredChatTerminalHold('chat', 'a')
  expect(() => claim.admit(TERMINAL)).toThrow('went back to its chat')
})

it('H3: after a restart only an inherited handover that reached no terminal ends', () => {
  begin('a', 'unlaunched')
  open('b')
  resetStructuredChatTerminalHoldsForTests()
  expect(heldStructuredChats()).toHaveLength(2)
  begin('c', 'begun now', 'another')
  releaseUnlaunchedStructuredChatTerminalHolds()
  expect(heldStructuredChats()).toEqual(['chat', 'begun now'])
})

it('keeps a hold whose terminal was asked for, whoever gives up on it', () => {
  begin()
  const claim = claimStructuredChatTerminalSpawn('a', () => false)!
  claim.admit(TERMINAL)
  claim.settle(true)
  abandonStructuredChatTerminalHold('chat', 'a')
  expect(heldStructuredChats()).toEqual(['chat'])
})

it('a spawn that fails before its terminal was asked for frees the chat', () => {
  begin()
  claimStructuredChatTerminalSpawn('a', () => false)!.settle(true)
  expect(heldStructuredChats()).toEqual([])
})

it('a start without the token joins the hold of the conversation it names', () => {
  begin()
  spawn(undefined)
  expect(structuredChatTerminalHold('chat')).toMatchObject({
    phase: 'terminal',
    terminals: [{ ptyId: 'pty', incarnationId: 'i' }]
  })
  expect(claimStructuredChatTerminalSpawn(undefined, () => false)).toBeNull()
})

it('an account restart holds both its terminals, and nothing ends between them', () => {
  open()
  noteStructuredChatTerminalRan('chat', 'pty')
  const claim = claimStructuredChatTerminalSpawn(undefined, (id) => id === 'conversation')!
  expect(structuredChatTerminalStarting(structuredChatTerminalHold('chat')!)).toBe(true)
  claim.admit({ ptyId: 'pty2', paneKey: 'tab:leaf' })
  claim.bind({ ptyId: 'pty2', incarnationId: 'j', paneKey: 'tab:leaf' })
  claim.settle(false)
  expect(structuredChatTerminalStarting(structuredChatTerminalHold('chat')!)).toBe(false)
  expect(mayWrite('absent')).toBe(false)
  expect(mayWrite('shell', 1)).toBe(true)
})

it('a login move in the same shell waits for the restarted agent to be seen', () => {
  open()
  noteStructuredChatTerminalRan('chat', 'pty')
  const release = restartInStructuredChatTerminal('conversation')
  expect(structuredChatTerminalStarting(structuredChatTerminalHold('chat')!)).toBe(true)
  release()
  release()
  expect(structuredChatTerminalStarting(structuredChatTerminalHold('chat')!)).toBe(false)
  expect(mayWrite('shell')).toBe(true)
})

it('M1: an unreadable file is not an empty one, across restarts, until the terminals were looked at', () => {
  writeFileSync(file(), '{"chat":{"tok')
  expect(heldStructuredChats()).toEqual([])
  expect(structuredChatTerminalHoldsUnreadable()).toBe(true)
  begin()
  expect(readFileSync(aside(), 'utf8')).toContain('tok')
  resetStructuredChatTerminalHoldsForTests()
  expect(structuredChatTerminalHoldsUnreadable()).toBe(true)
  forgetUnreadableStructuredChatTerminalHolds()
  expect(structuredChatTerminalHoldsUnreadable()).toBe(false)
  expect(existsSync(aside())).toBe(false)
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
  expect(mayWrite('shell')).toBe(true)
  noteStructuredChatTerminalReport('pty', 'conversation')
  expect(mayWrite('shell')).toBe(false)
})

it('M6: an abandon that overtakes its begin leaves no hold, and is forgotten with it', () => {
  const begun = expectStructuredChatTerminalHold('a')
  abandonStructuredChatTerminalHold('chat', 'a')
  expect(begin()).toBe(false)
  expect(heldStructuredChats()).toEqual([])
  begun()
  expect(begin()).toBe(true)
})

it('M6: every release tells what waits for the chat, and whether a restart paused it', () => {
  const ended: [string, boolean][] = []
  const listen = () =>
    onStructuredChatTerminalHoldEnded((end) => ended.push([end.sessionId, end.outlivedRestart]))
  listen()
  begin()
  abandonStructuredChatTerminalHold('chat', 'a')
  open('b')
  resetStructuredChatTerminalHoldsForTests()
  listen()
  releaseStructuredChatTerminalHold('chat', 'b')
  expect(ended).toEqual([
    ['chat', false],
    ['chat', true]
  ])
})

it('a restored terminal never resumes a held conversation by itself', () => {
  open()
  expect(conversationHeldForTerminal('conversation')).toBe(true)
  expect(conversationHeldForTerminal('another')).toBe(false)
})
