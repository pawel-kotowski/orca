import { describe, expect, it } from 'vitest'
import type { CatalogModel } from '../../../../../../../shared/agent-session/options/agent-session-option-catalog-types'
import type { SessionOptionDescriptor } from '../../../../../../../shared/native-chat/input/native-chat-session-options'
import {
  nativeChatModelPillLabel,
  sayNativeChatSessionOptionEnglish
} from '../../../../../../../shared/native-chat/input/native-chat-session-option-labels'
import {
  claudeSessionValuesToReport,
  claudeVersionedModelId
} from './claude-terminal-model-identity'
import {
  claudeTranscriptSessionValues,
  readClaudeSessionOptionsFromTerminalScreen
} from './claude-terminal-session-options'

const EFFORT = {
  id: 'effort',
  label: 'Effort',
  kind: {
    type: 'select' as const,
    choices: ['low', 'medium', 'high'].map((value) => ({ value, label: value })),
    defaultValue: 'high'
  },
  apply: {}
}

// The host's listing as of 2026-11: a versioned row per model, then the family rows as aliases.
const LISTED: CatalogModel[] = [
  {
    id: 'claude-opus-5-5',
    resolvedModel: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    isDefault: true,
    options: [EFFORT]
  },
  {
    id: 'claude-fable-5-2',
    resolvedModel: 'claude-fable-5-2',
    label: 'Claude Fable 5.2',
    options: [EFFORT]
  },
  { id: 'opus', resolvedModel: 'claude-opus-5-5', label: 'Opus 5.5 alias', options: [EFFORT] },
  { id: 'fable', resolvedModel: 'claude-fable-5-2', label: 'Fable 5.2 alias', options: [EFFORT] }
]

const START = {
  flag: null,
  byModel: { 'claude-opus-5-5': 'high' },
  fallback: 'medium',
  model: 'opus'
}

function modelDescriptor(value: string | null, source: 'reported' | 'unknown') {
  return {
    id: 'model',
    label: 'Model',
    kind: {
      type: 'select',
      ...(value ? { currentValue: value } : {}),
      choices: LISTED.map(({ id, label }) => ({ value: id, label }))
    },
    valueSource: source,
    transport: 'catalog',
    settable: true
  } as SessionOptionDescriptor
}

describe('a Claude terminal chat always names its model and effort (local)', () => {
  // Paweł, 2026-11-14: three pills for one model: "Model", "Opus 5.5 alias", "Claude Opus 5.5".
  it('reads the startup frame as the versioned row, not the alias row', () => {
    const frame = 'Claude Code v2.1.325\r\nOpus 5.5 with high effort · Claude Team\r\n~/repo'
    expect(readClaudeSessionOptionsFromTerminalScreen(frame, LISTED)).toEqual({
      model: 'claude-opus-5-5',
      effort: 'high'
    })
  })

  it('maps a family row to the versioned row the host lists for it', () => {
    expect(claudeVersionedModelId('opus', LISTED)).toBe('claude-opus-5-5')
    expect(claudeVersionedModelId('claude-fable-5-2', LISTED)).toBe('claude-fable-5-2')
    expect(claudeVersionedModelId('opus', [LISTED[2]!])).toBe('opus')
  })

  it('names the frame model and the transcript model the same, each with an effort', () => {
    const fromFrame = claudeSessionValuesToReport({
      found: { model: 'opus' },
      snapshot: [],
      models: LISTED,
      hookEffort: null,
      start: START
    })
    const fromTranscript = claudeSessionValuesToReport({
      found: claudeTranscriptSessionValues('claude-opus-5-5', LISTED, null),
      snapshot: [],
      models: LISTED,
      hookEffort: null,
      start: START
    })
    expect(fromFrame).toEqual({ model: 'claude-opus-5-5', effort: 'high' })
    expect(fromTranscript).toEqual(fromFrame)
  })

  it('falls back to the model the session started on, then the host default', () => {
    const args = { found: null, snapshot: [], models: LISTED, hookEffort: null }
    expect(claudeSessionValuesToReport({ ...args, start: { ...START, model: 'fable' } })).toEqual({
      model: 'claude-fable-5-2',
      effort: 'medium'
    })
    expect(claudeSessionValuesToReport({ ...args, start: null })).toEqual({
      model: 'claude-opus-5-5'
    })
  })

  it('prefers the hook effort and never replaces an effort already shown', () => {
    expect(
      claudeSessionValuesToReport({
        found: { model: 'claude-opus-5-5', effort: 'high' },
        snapshot: [],
        models: LISTED,
        hookEffort: 'low',
        start: START
      })
    ).toEqual({ model: 'claude-opus-5-5', effort: 'low' })
    const shownEffort = {
      ...EFFORT,
      kind: { ...EFFORT.kind, currentValue: 'low' },
      valueSource: 'dispatched',
      transport: 'catalog',
      settable: true
    } as SessionOptionDescriptor
    expect(
      claudeSessionValuesToReport({
        found: { model: 'claude-opus-5-5' },
        snapshot: [modelDescriptor('claude-opus-5-5', 'reported'), shownEffort],
        models: LISTED,
        hookEffort: null,
        start: START
      })
    ).toEqual({ model: 'claude-opus-5-5' })
    expect(
      claudeSessionValuesToReport({
        found: null,
        snapshot: [modelDescriptor('claude-opus-5-5', 'reported'), shownEffort],
        models: LISTED,
        hookEffort: null,
        start: { ...START, model: 'fable' }
      })
    ).toBeNull()
  })

  it('never prints "alias" on the pill', () => {
    expect(
      nativeChatModelPillLabel(
        modelDescriptor('opus', 'reported'),
        sayNativeChatSessionOptionEnglish
      )
    ).toBe('Opus 5.5')
  })
})

describe('the model picker lists each Claude model once (local)', () => {
  it('drops a family row whose versioned row is listed, and never says alias', async () => {
    const { nativeChatPickerModels } =
      await import('../../../../../../../shared/native-chat/input/native-chat-model-choices')
    expect(
      nativeChatPickerModels(LISTED, 'claude-opus-5-5').map(({ id, label }) => [id, label])
    ).toEqual([
      ['claude-opus-5-5', 'Claude Opus 5.5'],
      ['claude-fable-5-2', 'Claude Fable 5.2']
    ])
    // A chat still on the family row keeps it, named without "alias".
    expect(nativeChatPickerModels(LISTED, 'opus').map(({ label }) => label)).toContain('Opus 5.5')
    // A family row with no versioned row listed (structured chats) stays.
    expect(nativeChatPickerModels([LISTED[2]!], null)).toEqual([
      { ...LISTED[2]!, label: 'Opus 5.5' }
    ])
  })

  it('a cached family row becomes the versioned row even with the frame gone', () => {
    expect(
      claudeSessionValuesToReport({
        found: null,
        snapshot: [
          modelDescriptor('opus', 'reported'),
          {
            ...EFFORT,
            kind: { ...EFFORT.kind, currentValue: 'high' },
            valueSource: 'reported',
            transport: 'catalog',
            settable: true
          } as SessionOptionDescriptor
        ],
        models: LISTED,
        hookEffort: null,
        start: START
      })
    ).toEqual({ model: 'claude-opus-5-5', effort: 'high' })
  })

  it('shows a Claude model as Claude Code names it', () => {
    expect(
      nativeChatModelPillLabel(
        modelDescriptor('claude-opus-5-5', 'reported'),
        sayNativeChatSessionOptionEnglish
      )
    ).toBe('Opus 5.5')
  })
})
