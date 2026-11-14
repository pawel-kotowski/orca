/** The user's editor font; `lineHeight` 0 means Monaco derives it from the font size. */
export type CodeTypography = { fontSize: number; lineHeight: number }

export type CodeFit = {
  fontSize: number
  /** 0 when Monaco derives it from the font, as the user's setting does. */
  lineHeight: number
  /** Lines of the range on screen at this font, at most `rangeLines`. */
  linesVisible: number
  rangeLines: number
  /** Lines the pane shows at this font, with no note card. */
  paneLines: number
  fits: boolean
  /** Height the range and its cards would need at the floor font, and at the user's. */
  needPxAtFloor: number
  needPxAtUser: number
}

export const MIN_CODE_FONT_PX = 11
const FONT_STEP_DOWN_LIMIT = 3

/** The smallest font a stage editor may use: 11 px or the user's size minus 3, never above the user's. */
export function codeFontFloor(userFontSize: number): number {
  return Math.min(userFontSize, Math.max(MIN_CODE_FONT_PX, userFontSize - FONT_STEP_DOWN_LIMIT))
}

/** Line height at `fontSize`, scaled from the user's: Monaco's auto height is a ratio of the font. */
export function codeLineHeightAt(
  fontSize: number,
  user: CodeTypography,
  autoLineHeightRatio: number
): number {
  const base = user.lineHeight > 0 ? user.lineHeight / user.fontSize : autoLineHeightRatio
  return Math.round(fontSize * base)
}

export type CodeFontChoice = {
  fontSize: number
  lineHeight: number
  blockPx: number
  fits: boolean
}

/**
 * The largest font from the user's size down to the floor at which the range's rendered block
 * (wrapped rows and note cards included, as `measureBlockPx` reports it) fits `availablePx`;
 * the floor when nothing fits. `lineHeight` is what Monaco takes: 0 keeps its derived height.
 */
export function fitCodeFont(input: {
  availablePx: number
  user: CodeTypography
  autoLineHeightRatio: number
  measureBlockPx: (fontSize: number, lineHeight: number) => number
}): CodeFontChoice {
  const { availablePx, user, autoLineHeightRatio, measureBlockPx } = input
  const floor = codeFontFloor(user.fontSize)
  let choice: CodeFontChoice | null = null
  for (let fontSize = user.fontSize; fontSize >= floor; fontSize -= 1) {
    const lineHeight =
      user.lineHeight > 0 ? codeLineHeightAt(fontSize, user, autoLineHeightRatio) : 0
    const blockPx = measureBlockPx(fontSize, lineHeight)
    choice = { fontSize, lineHeight, blockPx, fits: blockPx <= availablePx }
    if (choice.fits) {
      return choice
    }
  }
  return choice as CodeFontChoice
}

/** Pixels a pane's editor needs to show `rangeLines` plus `reservedPx` at the floor font. */
export function codePaneNeedPx(
  rangeLines: number,
  reservedPx: number,
  user: CodeTypography,
  autoLineHeightRatio: number
): number {
  const floorLine = codeLineHeightAt(codeFontFloor(user.fontSize), user, autoLineHeightRatio)
  return rangeLines * floorLine + reservedPx
}

/** Columns of code a pane `widthPx` wide shows at the floor font (gutter excluded). */
export function codeColumnsAtFloor(
  widthPx: number,
  gutterPx: number,
  userFontSize: number
): number {
  // Why 0.6: monospace advance is about 0.6 em in the fonts Orca ships and most users pick.
  return Math.floor((widthPx - gutterPx) / (codeFontFloor(userFontSize) * 0.6))
}
