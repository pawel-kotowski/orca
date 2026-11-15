import { describe, expect, it } from 'vitest'
import { stageHoldRules } from './code-stage-hold-rules'

describe('stageHoldRules', () => {
  it('hides nothing when no pane is held', () => {
    expect(stageHoldRules([])).toBe('')
  })

  it('hides only the editors inside each held pane body', () => {
    expect(stageHoldRules(['g1', 'g2'])).toBe(
      '[data-tab-group-body-id="g1"] .monaco-editor,\n' +
        '[data-tab-group-body-id="g2"] .monaco-editor { visibility: hidden; }'
    )
  })

  it('keeps a quote or backslash in a pane id inside the attribute value', () => {
    expect(stageHoldRules(['a"b\\c'])).toBe(
      '[data-tab-group-body-id="a\\"b\\\\c"] .monaco-editor { visibility: hidden; }'
    )
  })
})
