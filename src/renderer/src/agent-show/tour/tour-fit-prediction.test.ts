import { describe, expect, it } from 'vitest'
import { predictTour, type PredictionGeometry } from './tour-fit-prediction'
import type { TourStep } from './tour-steps'

// 14 px font, Monaco's 1.5 ratio: 21 px lines, 17 px at the 11 px floor; a pane spends 80 px on
// chrome and the fit keeps half a line (11 px) free, so a 500 px stage pane fits 409 px of code.
const geometry: PredictionGeometry = {
  ownerWidthPx: 1000,
  stageWidthPx: 0,
  heightPx: 500,
  explorer: { open: false, widthPx: 300 },
  projectList: { open: false, widthPx: 300 },
  user: { fontSize: 14, lineHeight: 0 },
  lineHeightRatio: 1.5,
  wordWrap: false
}

const code = (
  filePath: string,
  startLine: number,
  endLine: number,
  more: Partial<{ mark: string; place: 'beside' | 'below' | 'right'; keepOthers: boolean }> = {}
): TourStep['requests'][number] => ({
  kind: 'code',
  filePath,
  range: { startLine, endLine },
  place: more.place ?? 'beside',
  keepOthers: more.keepOthers ?? false,
  ...(more.mark ? { mark: more.mark } : {})
})

const step = (...requests: TourStep['requests']): TourStep => ({
  title: 't',
  caption: 'c',
  holdMs: null,
  requests
})

const noLengths = (): null => null

describe('predictTour', () => {
  it('finds nothing wrong when a range fits the stage at the user font', () => {
    // 15 lines * 21 px = 315 <= 409.
    expect(predictTour([step(code('a.ts', 1, 15))], geometry, noLengths)).toEqual([
      { problems: [], unpredicted: [] }
    ])
  })

  it('reports a range cut off at the floor font, with the lines that do fit', () => {
    // 25 lines * 17 px = 425 > 409 at 11 px; 409 / 17 = 24 lines.
    const [prediction] = predictTour(
      [step(code('a.ts', 1, 25, { mark: '1' }))],
      geometry,
      noLengths
    )
    expect(prediction!.problems).toEqual([
      'mark 1 (a.ts:1-25): only 24 of 25 lines fit',
      'mark 1 (a.ts:1-25) is not on screen; split the step or shorten its ranges'
    ])
  })

  it('finds nothing wrong when only the note card runs past the pane, as the measure sees it', () => {
    // 24 lines at 11 px = 408 <= 409, but the 1-line note card (88 px) does not fit: every line shows.
    const noted: TourStep['requests'][number] = {
      ...code('a.ts', 1, 24),
      note: 'why'
    } as TourStep['requests'][number]
    expect(predictTour([step(noted)], geometry, noLengths)[0]!.problems).toEqual([])
  })

  it('stacks a second range below when both fit, sharing the height toward the user font', () => {
    // Floors 170 + 170 + 2 * 80 chrome = 500 <= 540, so it splits. Each pane gets
    // 170 + (380 - 340) / 2 + 80 = 270 px, leaving 179 px: 10 lines at 11 px (170) fit.
    const tall = { ...geometry, heightPx: 540 }
    const steps = [
      step(
        code('a.ts', 1, 10, { mark: '1' }),
        code('b.ts', 1, 10, { mark: '2', place: 'below', keepOthers: true })
      )
    ]
    expect(predictTour(steps, tall, noLengths)[0]!.problems).toEqual([])
  })

  it('reports the reused pane and the range it hides when no pane can be added', () => {
    // 170 + 170 + 160 = 500 > 400: the second range takes the only pane, over the first.
    const short = { ...geometry, heightPx: 400 }
    const steps = [
      step(
        code('a.ts', 1, 10, { mark: '1' }),
        code('b.ts', 1, 10, { mark: '2', place: 'below', keepOthers: true })
      )
    ]
    expect(predictTour(steps, short, noLengths)[0]!.problems).toEqual([
      'mark 2 (b.ts:1-10): no room for another pane with every range readable, so it replaces the pane showing a.ts',
      'mark 1 (a.ts:1-10) is not on screen; split the step or shorten its ranges'
    ])
  })

  it('counts wrapped rows: long lines in a narrow pane need more height', () => {
    // 580 px stage: at 11 px a row holds (580 - 70) / 6.6 = 77 chars, so a 200-char line is 3
    // rows (51 px); 10 lines need 510 > 409 and 8 fit.
    const wrapped = { ...geometry, wordWrap: true }
    const lengths = (): number[] => Array.from({ length: 10 }, () => 200)
    expect(predictTour([step(code('a.ts', 1, 10))], wrapped, lengths)[0]!.problems).toEqual([
      '(a.ts:1-10): only 8 of 10 lines fit',
      '(a.ts:1-10) is not on screen; split the step or shorten its ranges'
    ])
  })

  it('says code opens as a background tab when the window has no room beside the chat', () => {
    // 500 px: the chat would keep 210 px, under its 320 px minimum.
    const narrow = { ...geometry, ownerWidthPx: 500 }
    expect(
      predictTour([step(code('a.ts', 1, 5, { mark: '1' }))], narrow, noLengths)[0]!.problems
    ).toEqual([
      'mark 1 (a.ts:1-5) opens as a background tab: the window is too narrow for code beside the chat'
    ])
  })

  it('folds the project list when that makes room, as the stage does', () => {
    // 500 + 300 = 800: the chat keeps 336 px and the stage shows 61 columns at the floor.
    const narrow = { ...geometry, ownerWidthPx: 500, projectList: { open: true, widthPx: 300 } }
    expect(predictTour([step(code('a.ts', 1, 5))], narrow, noLengths)[0]!.problems).toEqual([])
  })

  it('keeps the explorer open after a step lights folders, so later code has less width', () => {
    const narrow = { ...geometry, ownerWidthPx: 500, explorer: { open: true, widthPx: 300 } }
    const tree: TourStep['requests'][number] = {
      kind: 'tree',
      entries: [{ path: 'src' }],
      expand: true,
      dimOthers: false
    }
    expect(predictTour([step(code('a.ts', 1, 5))], narrow, noLengths)[0]!.problems).toEqual([])
    const lit = predictTour([step(tree), step(code('a.ts', 1, 5))], narrow, noLengths)
    expect(lit[0]).toEqual({ problems: [], unpredicted: ['folder marks'] })
    expect(lit[1]!.problems).toEqual([
      '(a.ts:1-5) opens as a background tab: the window is too narrow for code beside the chat'
    ])
  })

  it('keeps the Tours panel open, so code has its width less', () => {
    const narrow = {
      ...geometry,
      ownerWidthPx: 500,
      explorer: { open: true, widthPx: 300, tab: 'tours' }
    }
    expect(predictTour([step(code('a.ts', 1, 5))], narrow, noLengths)[0]!.problems).toEqual([
      '(a.ts:1-5) opens as a background tab: the window is too narrow for code beside the chat'
    ])
  })

  it('lists what it cannot foresee instead of guessing', () => {
    const preview: TourStep['requests'][number] = {
      kind: 'file',
      filePath: 'docs/flow.mmd',
      preview: true,
      place: 'beside'
    }
    expect(predictTour([step(preview)], geometry, noLengths)).toEqual([
      { problems: [], unpredicted: ['a preview of docs/flow.mmd'] }
    ])
  })
})
