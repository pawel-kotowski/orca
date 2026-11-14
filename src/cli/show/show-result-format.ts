import { formatTourResult } from './show-tour-format'
import type {
  AgentShowCodeFit,
  AgentShowRequest,
  AgentShowResult,
  AgentShowState
} from '../../shared/agent-show/agent-show-contract'

type ShownResult = Extract<AgentShowResult, { ok: true }>

function formatState(state: AgentShowState): string {
  const yes = (value: boolean): string => (value ? 'yes' : 'no')
  const lines = [
    `Worktree on screen: ${yes(state.worktreeOnScreen)}`,
    `Your tab visible: ${yes(state.ownerTabVisible)}`,
    `Groups (${state.layout.groups.length}):`
  ]
  for (const group of state.layout.groups) {
    const focused = group.groupId === state.layout.activeGroupId ? ' (focused)' : ''
    lines.push(`- ${group.groupId}${focused}`)
    for (const tab of group.tabs) {
      const marks = [tab.tabId === group.activeTabId ? 'active' : '', tab.isOwner ? 'yours' : '']
        .filter(Boolean)
        .join(', ')
      lines.push(`  ${tab.contentType} ${tab.filePath ?? tab.label}${marks ? ` [${marks}]` : ''}`)
    }
  }
  for (const editor of state.editors) {
    const range = editor.visibleRange
      ? ` lines ${editor.visibleRange.startLine}-${editor.visibleRange.endLine}`
      : ''
    const marks = editor.marks.length > 0 ? ` marks ${editor.marks.join(', ')}` : ''
    const fits = editor.marks.length > 0 ? (editor.fits ? ', range fits' : ', range cut off') : ''
    lines.push(
      `Editor ${editor.filePath}${range}${marks} (${editor.fontSize}px, ${editor.paneLines} lines tall${fits})`
    )
  }
  const highlighted = state.explorer.highlighted.length
  lines.push(
    `Explorer: ${state.explorer.open ? 'open' : 'closed'}${highlighted > 0 ? `, ${highlighted} highlighted` : ''}`
  )
  for (const page of state.browser) {
    lines.push(
      `Browser ${page.pageId} ${page.url}${page.marks.length > 0 ? ` marks ${page.marks.join(', ')}` : ''}`
    )
  }
  return lines.join('\n')
}

export function formatShowResult(kind: AgentShowRequest['kind'], result: ShownResult): string {
  if (result.state) {
    return formatState(result.state)
  }
  if (result.tour) {
    return formatTourResult(result)
  }
  if (kind === 'clear') {
    return `Cleared your marks: ${result.detail ?? 'code, tree, ui'}.`
  }
  const head = result.visible
    ? `Shown ${kind}; it is on screen.`
    : `Shown ${kind}, but it is not on screen.`
  const lines = [result.detail ? `${head} ${result.detail}` : head]
  if (result.fit) {
    lines.push(formatCodeFit(result.fit))
  }
  return lines.join('\n')
}

/** `fits: 18/18 lines at 12px (yours 14px)`, or a cut-off range with what to do. */
export function formatCodeFit(fit: AgentShowCodeFit): string {
  const font =
    fit.fontSize === fit.userFontSize
      ? `${fit.fontSize}px`
      : `${fit.fontSize}px (yours ${fit.userFontSize}px)`
  const head = `fits: ${fit.linesVisible}/${fit.rangeLines} lines at ${font}`
  return fit.linesVisible >= fit.rangeLines ? head : `${head}; pick a shorter range`
}
