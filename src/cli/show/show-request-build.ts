import type {
  AgentShowRequestOf,
  AgentShowTourStageRequest
} from '../../shared/agent-show/agent-show-contract'
import {
  getOptionalStringFlag,
  getRepeatedStringFlag,
  getRequiredStringFlag
} from '../arguments/flags'
import { mapRequestTargets, requestTargets } from '../../shared/agent-show/tour-request-targets'
import { RuntimeClientError } from '../runtime/types'
import {
  getPlacement,
  getUiTarget,
  parseCodeRef,
  parseLineRange,
  treeEntriesFor
} from './show-request-args'

type Flags = Map<string, string | boolean>

// The contract treats an absent note or mark differently from an empty one.
function noteAndMark(flags: Flags): { note?: string; mark?: string } {
  const note = getOptionalStringFlag(flags, 'note')
  const mark = getOptionalStringFlag(flags, 'mark')
  return { ...(note ? { note } : {}), ...(mark ? { mark } : {}) }
}

/**
 * How each staging subcommand's flags become its request, paths as typed; the commands resolve
 * them from the shell folder, tours from the worktree root.
 */
export const SHOW_STAGE_BUILDERS: {
  [K in AgentShowTourStageRequest['kind']]: (flags: Flags) => AgentShowRequestOf<K>
} = {
  code: (flags) => ({
    kind: 'code',
    filePath: getRequiredStringFlag(flags, 'path'),
    range: parseLineRange(getRequiredStringFlag(flags, 'lines')),
    ...noteAndMark(flags),
    place: getPlacement(flags) ?? 'beside',
    keepOthers: flags.get('keep') === true
  }),
  file: (flags) => ({
    kind: 'file',
    filePath: getRequiredStringFlag(flags, 'path'),
    preview: flags.get('preview') === true,
    place: getPlacement(flags) ?? 'beside'
  }),
  tree: (flags) => {
    const typed = getRepeatedStringFlag(flags, 'path')
    if (typed.length === 0) {
      throw new RuntimeClientError('invalid_argument', 'Name at least one path to show.')
    }
    return {
      kind: 'tree',
      entries: treeEntriesFor(typed, getRepeatedStringFlag(flags, 'label')),
      expand: flags.get('no-expand') !== true,
      dimOthers: flags.get('dim-others') === true
    }
  },
  ui: (flags) => {
    const pageId = getOptionalStringFlag(flags, 'page')
    const codeRef = getOptionalStringFlag(flags, 'code')
    return {
      kind: 'ui',
      target: getUiTarget(flags),
      ...(pageId ? { pageId } : {}),
      ...noteAndMark(flags),
      ...(codeRef === undefined ? {} : { code: parseCodeRef(codeRef) })
    }
  }
}

/** The request with every path it names passed through `resolve`. */
export async function resolveStagePaths(
  request: AgentShowTourStageRequest,
  resolve: (path: string) => Promise<string>
): Promise<AgentShowTourStageRequest> {
  const resolved = await Promise.all(requestTargets(request).map((target) => resolve(target.path)))
  return mapRequestTargets(request, (target, index) => ({ ...target, path: resolved[index]! }))
}
