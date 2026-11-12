import { describe, expect, it } from 'vitest'
import {
  nativeChatTerminalForkAgent,
  nativeChatTerminalPromptRestartable,
  nativeChatTerminalResponseInLatestTurn,
  nativeChatTerminalRestartDraft,
  nativeChatTerminalRowOffersFork,
  nativeChatTerminalRowOffersRestart
} from './native-chat-terminal-row-actions'
import type { NativeChatMessage } from './native-chat-types'

function message(overrides: Partial<NativeChatMessage> & Pick<NativeChatMessage, 'id' | 'role'>) {
  return {
    blocks: [{ type: 'text', text: 'words' }],
    timestamp: 1,
    source: 'transcript',
    ...overrides
  } as NativeChatMessage
}

const response = message({ id: 'a1', role: 'assistant' })
const settled = { message: response, inSubagentSection: false, turnWorking: false }

describe('nativeChatTerminalForkAgent', () => {
  it('names only the CLIs Orca can copy', () => {
    expect(nativeChatTerminalForkAgent('claude')).toBe('claude')
    expect(nativeChatTerminalForkAgent('codex')).toBe('codex')
    // OpenClaude writes Claude transcripts but launches its own CLI.
    expect(nativeChatTerminalForkAgent('openclaude')).toBeNull()
    expect(nativeChatTerminalForkAgent('opencode')).toBeNull()
  })
})

describe('nativeChatTerminalRowOffersFork', () => {
  it('offers Claude any settled response, without journal positions', () => {
    expect(nativeChatTerminalRowOffersFork({ ...settled, inLatestTurn: false }, 'claude')).toBe(
      true
    )
  })

  it('offers Codex only its newest turn', () => {
    expect(nativeChatTerminalRowOffersFork({ ...settled, inLatestTurn: true }, 'codex')).toBe(true)
    expect(nativeChatTerminalRowOffersFork({ ...settled, inLatestTurn: false }, 'codex')).toBe(
      false
    )
  })

  it('skips running turns, subagents, hook previews and non-responses', () => {
    const row = { ...settled, inLatestTurn: true }
    expect(nativeChatTerminalRowOffersFork({ ...row, turnWorking: true }, 'claude')).toBe(false)
    expect(nativeChatTerminalRowOffersFork({ ...row, inSubagentSection: true }, 'claude')).toBe(
      false
    )
    expect(
      nativeChatTerminalRowOffersFork(
        { ...row, message: { ...response, agentId: 'sub-1' } as NativeChatMessage },
        'claude'
      )
    ).toBe(false)
    expect(
      nativeChatTerminalRowOffersFork(
        { ...row, message: { ...response, source: 'hook' } },
        'claude'
      )
    ).toBe(false)
    expect(
      nativeChatTerminalRowOffersFork({ ...row, message: { ...response, role: 'user' } }, 'claude')
    ).toBe(false)
  })
})

describe('nativeChatTerminalRowOffersRestart', () => {
  const prompt = message({ id: 'u1', role: 'user' })
  const opener = { depth: 0, turnKey: 'u1' }

  it('offers a Claude prompt that opens its turn', () => {
    expect(nativeChatTerminalRowOffersRestart(prompt, opener, false, 'claude')).toBe(true)
    expect(nativeChatTerminalPromptRestartable(prompt, 'claude')).toBe(true)
  })

  it('never offers Codex, which cannot cut its conversation', () => {
    expect(nativeChatTerminalRowOffersRestart(prompt, opener, false, 'codex')).toBe(false)
  })

  it('skips steers, unsent echoes, other agents mail and images not on disk', () => {
    expect(
      nativeChatTerminalRowOffersRestart(prompt, { depth: 0, turnKey: 'u0' }, false, 'claude')
    ).toBe(false)
    expect(nativeChatTerminalRowOffersRestart(prompt, opener, true, 'claude')).toBe(false)
    expect(
      nativeChatTerminalRowOffersRestart(
        { ...prompt, pendingSend: 'active' },
        opener,
        false,
        'claude'
      )
    ).toBe(false)
    expect(
      nativeChatTerminalRowOffersRestart(
        { ...prompt, from: { kind: 'agent' } as NativeChatMessage['from'] },
        opener,
        false,
        'claude'
      )
    ).toBe(false)
    expect(
      nativeChatTerminalRowOffersRestart(
        { ...prompt, blocks: [{ type: 'image-ref', url: 'data:' }] },
        opener,
        false,
        'claude'
      )
    ).toBe(false)
  })
})

describe('nativeChatTerminalResponseInLatestTurn', () => {
  const rows = [
    message({ id: 'u1', role: 'user' }),
    message({ id: 'a1', role: 'assistant' }),
    message({ id: 't1', role: 'tool' }),
    message({ id: 'a2', role: 'assistant' }),
    message({ id: 'u2', role: 'user' }),
    message({ id: 'a3', role: 'assistant' })
  ]

  it('is true only after the last prompt; tool results start no turn', () => {
    expect(nativeChatTerminalResponseInLatestTurn(rows, 'a3')).toBe(true)
    expect(nativeChatTerminalResponseInLatestTurn(rows, 'a2')).toBe(false)
    expect(nativeChatTerminalResponseInLatestTurn(rows.slice(0, 4), 'a1')).toBe(true)
    expect(nativeChatTerminalResponseInLatestTurn(rows, 'missing')).toBe(false)
  })
})

describe('nativeChatTerminalRestartDraft', () => {
  it('keeps the words and the images on disk', () => {
    expect(
      nativeChatTerminalRestartDraft(
        message({
          id: 'u1',
          role: 'user',
          blocks: [
            { type: 'text', text: 'look at this' },
            { type: 'image-ref', path: '/tmp/shot.png' },
            { type: 'text', text: 'and fix it' }
          ]
        })
      )
    ).toEqual({ text: 'look at this\n\nand fix it', imagePaths: ['/tmp/shot.png'] })
  })
})
