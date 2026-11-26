import type {
  AgentShowTourList,
  AgentShowTourSnapshot
} from '../../../../shared/agent-show/agent-show-tour-library'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { toRuntimeWorktreeSelector } from '@/runtime/rpc/targets/runtime-worktree-selector'
import { buildWorkspaceFileContext } from '@/runtime/files/workspace-file-host-routing'

// Why main: tours are read and compared with git on the worktree's host, not by the renderer.
const TOURS_TIMEOUT_MS = 20_000

/** A worktree's `docs/tours`, each tour checked against today's code. */
export function fetchWorktreeTours(
  worktreeId: string,
  worktreePath: string,
  /** The paired server the workspace is on, when known; ids can repeat across hosts. */
  runtimeEnvironmentId?: string | null
): Promise<AgentShowTourList> {
  return callRuntimeRpc<AgentShowTourList>(
    buildWorkspaceFileContext(worktreeId, worktreePath, runtimeEnvironmentId).target,
    'agentShow.tours',
    { worktree: toRuntimeWorktreeSelector(worktreeId) },
    { timeoutMs: TOURS_TIMEOUT_MS }
  )
}

/**
 * The file as it was at `commit`, as a read-only file in this computer's temp folder: the
 * worktree's host (this computer or a box) reads the text, this computer writes the copy, so
 * local and remote workspaces open it the same way.
 */
export async function fetchTourSnapshot(
  worktreeId: string,
  worktreePath: string,
  commit: string,
  path: string
): Promise<string> {
  const snapshot = await callRuntimeRpc<AgentShowTourSnapshot>(
    buildWorkspaceFileContext(worktreeId, worktreePath).target,
    'agentShow.tourSnapshot',
    { worktree: toRuntimeWorktreeSelector(worktreeId), commit, path },
    { timeoutMs: TOURS_TIMEOUT_MS }
  )
  return window.api.agentShow.writeTourSnapshot(snapshot)
}
