import type { AgentShowTourStageRequest } from './agent-show-contract'
import type { LineRange } from './tour-diff-hunks'

/** A path a show points at, with the lines it highlights when it is code. */
export type TourTarget = { path: string; range?: LineRange }

/** The paths and lines a show points at, in order; a page mark alone has none. */
export function requestTargets(request: AgentShowTourStageRequest): TourTarget[] {
  switch (request.kind) {
    case 'code':
      return [{ path: request.filePath, range: request.range }]
    case 'file':
      return [{ path: request.filePath }]
    case 'tree':
      return request.entries.map((entry) => ({ path: entry.path }))
    case 'ui':
      return request.code ? [{ path: request.code.filePath, range: request.code.range }] : []
  }
}

/** The show with each of its targets (in `requestTargets` order) replaced by `map`'s. */
export function mapRequestTargets(
  request: AgentShowTourStageRequest,
  map: (target: TourTarget, index: number) => TourTarget
): AgentShowTourStageRequest {
  const to = requestTargets(request).map(map)
  switch (request.kind) {
    case 'code':
      return { ...request, filePath: to[0]!.path, range: to[0]!.range ?? request.range }
    case 'file':
      return { ...request, filePath: to[0]!.path }
    case 'tree':
      return {
        ...request,
        entries: request.entries.map((entry, index) => ({ ...entry, path: to[index]!.path }))
      }
    case 'ui':
      return request.code
        ? { ...request, code: { filePath: to[0]!.path, range: to[0]!.range ?? request.code.range } }
        : request
  }
}

/** Every path a tour's steps point at, once each. */
export function tourPaths(
  steps: readonly { requests: readonly AgentShowTourStageRequest[] }[]
): string[] {
  return [
    ...new Set(
      steps.flatMap((step) =>
        step.requests.flatMap((request) => requestTargets(request).map((target) => target.path))
      )
    )
  ]
}
