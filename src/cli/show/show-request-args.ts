import {
  AGENT_SHOW_CLEAR_SCOPES,
  AGENT_SHOW_PLACEMENTS,
  type AgentShowClearScope,
  type AgentShowPlacement,
  type AgentShowRequestOf
} from '../../shared/agent-show/agent-show-contract'
import { getOptionalStringFlag } from '../arguments/flags'
import { RuntimeClientError } from '../runtime/types'

type Flags = Map<string, string | boolean>
type LineRange = { startLine: number; endLine: number }

function invalid(message: string): never {
  throw new RuntimeClientError('invalid_argument', message)
}

function parseLine(text: string, flag: string): number {
  if (!/^\d+$/.test(text) || Number(text) < 1 || !Number.isSafeInteger(Number(text))) {
    invalid(`Invalid line "${text}" in ${flag}: use a 1-based line number.`)
  }
  return Number(text)
}

/** `42` is 42-42; `40-62` is lines 40 through 62. */
export function parseLineRange(value: string, flag = '--lines'): LineRange {
  const parts = value.trim().split('-')
  if (parts.length > 2 || parts.some((part) => part === '')) {
    invalid(`Invalid ${flag} "${value}": use <line> or <start>-<end>, such as 40-62.`)
  }
  const startLine = parseLine(parts[0], flag)
  const endLine = parts.length === 2 ? parseLine(parts[1], flag) : startLine
  if (endLine < startLine) {
    invalid(`Invalid ${flag} "${value}": the end line comes before the start line.`)
  }
  return { startLine, endLine }
}

/** `src/app.ts:40-62`; the last colon splits, so Windows drive letters survive. */
export function parseCodeRef(value: string): { filePath: string; range: LineRange } {
  const colon = value.lastIndexOf(':')
  if (colon <= 0 || colon === value.length - 1) {
    invalid(`Invalid --code "${value}": use <path>:<start>-<end>, such as src/app.ts:40-62.`)
  }
  return {
    filePath: value.slice(0, colon),
    range: parseLineRange(value.slice(colon + 1), '--code')
  }
}

/** Each `--label "<path>=<label>"` names one of the paths shown, exactly as it was typed. */
export function treeEntriesFor(
  paths: string[],
  labels: string[]
): AgentShowRequestOf<'tree'>['entries'] {
  const labelByPath = new Map<string, string>()
  for (const pair of labels) {
    const equals = pair.indexOf('=')
    const path = pair.slice(0, equals)
    const label = pair.slice(equals + 1)
    if (equals <= 0 || label.length === 0) {
      invalid(`Invalid --label "${pair}": use <path>=<label>.`)
    }
    if (!paths.includes(path)) {
      invalid(`--label names ${path}, which is not one of the paths shown.`)
    }
    labelByPath.set(path, label)
  }
  return paths.map((path) => {
    const label = labelByPath.get(path)
    return label === undefined ? { path } : { path, label }
  })
}

export function getUiTarget(flags: Flags): AgentShowRequestOf<'ui'>['target'] {
  const named = (['selector', 'ref', 'text'] as const).flatMap((name) => {
    const value = getOptionalStringFlag(flags, name)
    return value === undefined ? [] : [[name, value] as const]
  })
  if (named.length !== 1) {
    invalid('Pass exactly one of --selector <css>, --ref <@e3> or --text "<text>".')
  }
  const [name, value] = named[0]
  return { [name]: value }
}

export function getClearScope(flags: Flags): AgentShowClearScope {
  const named = AGENT_SHOW_CLEAR_SCOPES.filter((scope) => flags.has(scope))
  if (named.length > 1) {
    invalid('Pass at most one of --code, --tree, --ui or --all.')
  }
  const scope = named[0] ?? 'all'
  if (flags.get(scope) !== undefined && flags.get(scope) !== true) {
    invalid(`--${scope} takes no value here.`)
  }
  return scope
}

export function getPlacement(flags: Flags): AgentShowPlacement | undefined {
  const value = getOptionalStringFlag(flags, 'place')
  if (value === undefined) {
    return undefined
  }
  const placement = AGENT_SHOW_PLACEMENTS.find((known) => known === value)
  if (!placement) {
    invalid(`Invalid --place "${value}": use ${AGENT_SHOW_PLACEMENTS.join(', ')}.`)
  }
  return placement
}
