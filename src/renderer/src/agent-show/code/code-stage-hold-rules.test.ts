import { describe, expect, it } from 'vitest'
import { stageHoldRules } from './code-stage-hold-rules'

describe('stageHoldRules', () => {
  it('hides nothing when no pane is held', () => {
    expect(stageHoldRules([])).toBe('')
  })

  it("hides each held pane's body and tab strip", () => {
    expect(stageHoldRules(['g1', 'g2'])).toBe(
      '[data-tab-group-body-id="g1"],\n[data-tab-group-strip-id="g1"],\n' +
        '[data-tab-group-body-id="g2"],\n[data-tab-group-strip-id="g2"] { visibility: hidden; }'
    )
  })

  it('keeps a quote or backslash in a pane id inside the attribute value', () => {
    expect(stageHoldRules(['a"b\\c'])).toBe(
      '[data-tab-group-body-id="a\\"b\\\\c"],\n' +
        '[data-tab-group-strip-id="a\\"b\\\\c"] { visibility: hidden; }'
    )
  })
})
