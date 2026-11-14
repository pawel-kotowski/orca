import type {
  AgentShowContext,
  AgentShowResult
} from '../../../../shared/agent-show/agent-show-contract'
import { resolveRuntimePath } from '../../../../shared/cross-platform-path'
import { detectLanguage } from '../../../../shared/editor-language/editor-language-detect'
import { toWorktreeRelativePath } from '../../../../shared/terminal/links/terminal-links'
import type { OpenFile } from '@/store/slices/editor/types/open-file'

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

// Why: the spine adds `focus` to the context; until then every show brings the user to it.
export function contextWantsFocus(context: AgentShowContext & { focus?: boolean }): boolean {
  return context.focus !== false
}
