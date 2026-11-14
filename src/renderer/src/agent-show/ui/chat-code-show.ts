import type {
  AgentShowContext,
  AgentShowResult
} from '../../../../shared/agent-show/agent-show-contract'
import type { NativeChatFileLinkContext } from '@/components/native-chat/links/actions/native-chat-file-link-context'
import { showCode } from '../code/show-code'

/** A click asked to see this code, so it always moves the view, whatever the agent's own focus. */
export function showCodeOnClick(
  code: { filePath: string; range: { startLine: number; endLine: number } },
  context: Omit<AgentShowContext, 'focus'>
): Promise<AgentShowResult> {
  return showCode(
    { kind: 'code', filePath: code.filePath, range: code.range, place: 'beside', keepOthers: true },
    { ...context, focus: true }
  )
}

/** Opens `absolutePath` with lines `line`…`endLine` highlighted, owned by the chat's tab; `fallback` when that fails. */
export async function openNativeChatCodeRange(
  target: { absolutePath: string; line: number; endLine: number },
  context: NativeChatFileLinkContext,
  fallback: () => void
): Promise<void> {
  const result = await showCodeOnClick(
    {
      filePath: target.absolutePath,
      range: { startLine: target.line, endLine: target.endLine }
    },
    {
      worktreeId: context.worktreeId,
      worktreePath: context.worktreePath,
      ownerTabId: context.sourceTabId ?? null
    }
  ).catch(() => null)
  if (!result?.ok) {
    fallback()
  }
}
