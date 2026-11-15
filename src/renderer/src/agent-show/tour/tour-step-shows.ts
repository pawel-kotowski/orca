import type {
  AgentShowContext,
  AgentShowResult
} from '../../../../shared/agent-show/agent-show-contract'
import { showCode, showCodeSnapshot, showFile } from '../code/show-code'
import { showTree } from '../tree/show-tree'
import { showUi } from '../ui/show-ui'
import { fetchTourSnapshot } from './tour-library-client'
import type { TourStep } from './tour-steps'

type StepShow = TourStep['requests'][number]

export function runShow(request: StepShow, context: AgentShowContext): Promise<AgentShowResult> {
  switch (request.kind) {
    case 'code':
      return showCode(request, context)
    case 'file':
      return showFile(request, context)
    case 'tree':
      return showTree(request, context)
    case 'ui':
      return showUi(request, context)
  }
}

/** A stale step's code at the tour's commit, read-only with the same marks; else the show itself. */
export async function runShowAsItWas(
  request: StepShow,
  context: AgentShowContext,
  commit: string
): Promise<AgentShowResult> {
  if (request.kind !== 'code') {
    return runShow(request, context)
  }
  try {
    const snapshot = await fetchTourSnapshot(
      context.worktreeId,
      context.worktreePath,
      commit,
      request.filePath
    )
    return await showCodeSnapshot(request, context, snapshot)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      code: 'snapshot_failed',
      message: `could not read ${request.filePath} at ${commit.slice(0, 7)}: ${message}`
    }
  }
}
