import { useMemo } from 'react'
import { useAppStore } from '@/store/index'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/workspace/ownership/worktree-runtime-owner'
import {
  useWorkerAutoClose,
  workerAutoCloseStripText,
  workerKeepOpenLabel
} from '@/runtime/agent-orchestration/worker-auto-close'
import { useTranslate } from '@/i18n/use-translate'
import { NativeChatWorkerLifetimeStrip } from './NativeChatWorkerLifetimeStrip'
import { useNativeChatTabOwnerWorktreeId } from '../pane/ownership/use-native-chat-tab-owner'

/** A temporary orchestration worker's terminal, in Chat UI: when it closes, with Keep open.
 *  The pane's own banner (WorkerAutoCloseBanner) sits under the chat's cover, so this shows
 *  only while the chat does; both read one published state by the same pane key. */
export function NativeChatTerminalWorkerLifetimeStrip({
  terminalTabId,
  paneKey,
  isVisible
}: {
  terminalTabId: string
  paneKey: string
  isVisible: boolean
}): React.JSX.Element | null {
  const t = useTranslate()
  const worktreeId = useNativeChatTabOwnerWorktreeId(terminalTabId)
  const environmentId = useAppStore((state) =>
    runtimeEnvironmentIdOrLocalUnlessTwin(state, worktreeId)
  )
  const target = useMemo(
    () =>
      environmentId !== null
        ? { kind: 'environment' as const, environmentId }
        : { kind: 'local' as const },
    [environmentId]
  )
  const subject = useMemo(() => ({ paneKey }), [paneKey])
  const { state, nowMs, keepOpen } = useWorkerAutoClose(target, subject, paneKey, isVisible)
  const text = workerAutoCloseStripText(state, nowMs, t)
  return text ? (
    <NativeChatWorkerLifetimeStrip
      text={text}
      keepOpenLabel={workerKeepOpenLabel(t)}
      onKeepOpen={keepOpen}
    />
  ) : null
}
