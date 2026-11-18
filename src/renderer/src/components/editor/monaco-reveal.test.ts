import { describe, expect, it, vi } from 'vitest'
import type { editor } from 'monaco-editor'
import { performReveal } from './monaco/monaco-reveal'

function fakeEditor(paneHeightPx: number) {
  const calls = {
    revealRangeInCenter: vi.fn(),
    revealLineNearTop: vi.fn(),
    revealPositionInCenter: vi.fn()
  }
  const ed = {
    ...calls,
    getModel: () => ({ getLineCount: () => 200, getLineMaxColumn: () => 40 }),
    setPosition: vi.fn(),
    setSelection: vi.fn(),
    getTopForLineNumber: (line: number) => line * 20,
    getBottomForLineNumber: (line: number) => line * 20 + 20,
    getLayoutInfo: () => ({ height: paneHeightPx }),
    focus: vi.fn(),
    createDecorationsCollection: vi.fn()
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: performReveal reads only the members above.
  return { ed: ed as unknown as editor.IStandaloneCodeEditor, calls }
}

const reveal = (ed: editor.IStandaloneCodeEditor, extent: Parameters<typeof performReveal>[7]) =>
  performReveal(ed, 40, 1, 0, () => {}, { current: null }, { current: null }, extent)

describe('performReveal scroll type', () => {
  it('scrolls smoothly by default (Monaco ScrollType.Smooth = 0)', () => {
    const { ed, calls } = fakeEditor(1000)
    reveal(ed, { endLine: 50, focus: false })
    expect(calls.revealRangeInCenter.mock.calls[0]![1]).toBe(0)
  })

  it('jumps at once for an instant reveal, short or tall range (ScrollType.Immediate = 1)', () => {
    const short = fakeEditor(1000)
    reveal(short.ed, { endLine: 50, focus: false, instant: true })
    expect(short.calls.revealRangeInCenter.mock.calls[0]![1]).toBe(1)
    const tall = fakeEditor(100)
    reveal(tall.ed, { endLine: 90, focus: false, instant: true })
    expect(tall.calls.revealLineNearTop).toHaveBeenCalledWith(40, 1)
    const point = fakeEditor(1000)
    reveal(point.ed, { focus: false, instant: true })
    expect(point.calls.revealPositionInCenter.mock.calls[0]![1]).toBe(1)
  })
})
