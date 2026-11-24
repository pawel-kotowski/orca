import { afterEach, expect, it } from 'vitest'
import {
  beginStructuredChatTerminalHold,
  bindStructuredChatTerminalHold,
  endStructuredChatTerminalHold,
  forgetUnboundStructuredChatTerminalHold,
  structuredChatTerminalHeld
} from './structured-chat-terminal-holds'

const ALIVE = { reportedAt: null, paneAlive: () => true }

afterEach(() => endStructuredChatTerminalHold('chat'))

it('keeps the chat from starting until the terminal reports, even before a pane is known', () => {
  expect(structuredChatTerminalHeld('chat', ALIVE)).toBe(false)
  beginStructuredChatTerminalHold('chat', 100)
  expect(structuredChatTerminalHeld('chat', { reportedAt: null, paneAlive: () => false })).toBe(
    true
  )
  bindStructuredChatTerminalHold('chat', 'tab:leaf')
  expect(structuredChatTerminalHeld('chat', ALIVE)).toBe(true)
  // An older terminal's report of the same conversation proves nothing about this one.
  expect(structuredChatTerminalHeld('chat', { ...ALIVE, reportedAt: 99 })).toBe(true)
  // Reported: the live-writer check decides from here, and the hold is spent.
  expect(structuredChatTerminalHeld('chat', { ...ALIVE, reportedAt: 101 })).toBe(false)
  expect(structuredChatTerminalHeld('chat', ALIVE)).toBe(false)
})

it('gives the chat back when the terminal it was handed to is gone', () => {
  beginStructuredChatTerminalHold('chat', 100)
  bindStructuredChatTerminalHold('chat', 'tab:leaf')
  expect(structuredChatTerminalHeld('chat', { reportedAt: null, paneAlive: () => false })).toBe(
    false
  )
})

it('gives up only a launch that never named its pane', () => {
  beginStructuredChatTerminalHold('chat', 100)
  bindStructuredChatTerminalHold('chat', 'tab:leaf')
  forgetUnboundStructuredChatTerminalHold('chat')
  expect(structuredChatTerminalHeld('chat', ALIVE)).toBe(true)
  beginStructuredChatTerminalHold('chat', 100)
  forgetUnboundStructuredChatTerminalHold('chat')
  expect(structuredChatTerminalHeld('chat', ALIVE)).toBe(false)
})
