import { resolveExplicitFileLinkTargetPath } from '../../../../shared/file-links/explicit-file-link-target'
import type { CodeLineRange } from '../../../../shared/native-chat/native-chat-code-range'
import { openDetectedFilePath } from '@/components/terminal-pane/links/files/terminal-file-open-routing'
import { resolveNativeChatFileLinkContext } from '@/components/native-chat/links/actions/native-chat-file-link-context'
import { nativeChatFileOpenDeps } from '@/components/native-chat/links/actions/native-chat-link-target-actions'
import { useAppStore } from '@/store/index'
import { openNativeChatCodeRange } from './chat-code-show'

/** A chat visual's `data-orca-show` element was clicked: show that code, owned by the chat's tab. */
export function showNativeChatVisualCode(chatTabId: string, parsed: CodeLineRange): void {
  const context = resolveNativeChatFileLinkContext(useAppStore.getState(), chatTabId)
  const absolutePath = context
    ? resolveExplicitFileLinkTargetPath(parsed.pathText, context.worktreePath)
    : null
  if (!context || !absolutePath) {
    return
  }
  const target = { absolutePath, line: parsed.startLine, endLine: parsed.endLine }
  void openNativeChatCodeRange(target, context, () =>
    openDetectedFilePath(
      absolutePath,
      parsed.startLine,
      null,
      nativeChatFileOpenDeps({ ...target, column: null }, context)
    )
  )
}
