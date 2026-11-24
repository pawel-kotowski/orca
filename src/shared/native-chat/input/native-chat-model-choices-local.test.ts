import { describe, expect, it } from 'vitest'
import { nativeChatPickerModels } from './native-chat-model-choices'

const versioned = { id: 'claude-opus-5-5', label: 'Opus 5.5', options: [] }
const family = {
  id: 'opus',
  label: 'Opus alias',
  resolvedModel: 'claude-opus-5-5',
  options: []
}
const rows = (models: Parameters<typeof nativeChatPickerModels>[0], current: string | null) =>
  nativeChatPickerModels(models, current).map(({ id, label }) => [id, label])

describe('nativeChatPickerModels', () => {
  it('names a chat set to a family row by the model it runs, once, keeping its value', () => {
    expect(rows([versioned, family], 'opus')).toEqual([['opus', 'Opus 5.5']])
  })

  it('names it from the resolved id when the versioned row is not listed', () => {
    expect(rows([family], 'opus')).toEqual([['opus', 'Opus 5.5']])
  })

  it('lists only the versioned row for a chat on it, or on nothing yet', () => {
    expect(rows([versioned, family], 'claude-opus-5-5')).toEqual([['claude-opus-5-5', 'Opus 5.5']])
    expect(rows([versioned, family], null)).toEqual([['claude-opus-5-5', 'Opus 5.5']])
  })

  it('keeps a family row whose model the listing does not resolve', () => {
    expect(rows([{ id: 'opus', label: 'Opus alias', options: [] }], 'opus')).toEqual([
      ['opus', 'Opus']
    ])
  })
})
