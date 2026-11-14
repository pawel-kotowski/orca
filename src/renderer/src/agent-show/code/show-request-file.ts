import type {
  AgentShowContext,
  AgentShowResult
} from '../../../../shared/agent-show/agent-show-contract'
import { resolveRuntimePath } from '../../../../shared/cross-platform-path'
import { detectLanguage } from '../../../../shared/editor-language/editor-language-detect'
import { toWorktreeRelativePath } from '../../../../shared/terminal/links/terminal-links'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { runtimePathExists } from '@/runtime/files/metadata/runtime-file-metadata-client'
import { buildWorkspaceFileContextForFile } from '@/runtime/files/workspace-file-host-routing'

export type ShowRequestFile = Pick<
  OpenFile,
  'filePath' | 'relativePath' | 'worktreeId' | 'language'
>

/** A request path (worktree-relative or absolute inside it) as the editor opens it; null outside. */
export function resolveShowRequestFile(
  context: AgentShowContext,
  requestPath: string
): ShowRequestFile | null {
  const filePath = resolveRuntimePath(context.worktreePath, requestPath)
  const relativePath = toWorktreeRelativePath(filePath, context.worktreePath)
  if (!relativePath) {
    return null
  }
  return {
    filePath,
    relativePath,
    worktreeId: context.worktreeId,
    language: detectLanguage(filePath)
  }
}

export function outsideWorktreeResult(requestPath: string): AgentShowResult {
  return {
    ok: false,
    code: 'path_outside_worktree',
    message: `${requestPath} is not a file inside this worktree`
  }
}

/** A result for a path that does not exist, or null when it does (or cannot be checked). */
export async function missingFileResult(
  context: AgentShowContext,
  file: ShowRequestFile
): Promise<AgentShowResult | null> {
  try {
    const host = buildWorkspaceFileContextForFile(
      context.worktreeId,
      context.worktreePath,
      file.filePath
    )
    if (await runtimePathExists(host, file.filePath)) {
      return null
    }
  } catch {
    // Why: an unreachable host must not block the show; the editor reports its own error.
    return null
  }
  return {
    ok: false,
    code: 'file_not_found',
    message: `${file.relativePath} does not exist in this worktree (${context.worktreePath}); paths are relative to the worktree root`
  }
}

// Why: the spine adds `focus` to the context; until then every show brings the user to it.
export function contextWantsFocus(context: AgentShowContext & { focus?: boolean }): boolean {
  return context.focus !== false
}
