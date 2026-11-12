import { useMemo, type RefObject } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useTranslate } from '@/i18n/use-translate'
import { NativeChatPartyWorkerApprovalStack } from './worker-approvals/NativeChatWorkerApprovals'
import { useTerminalChatWorkerApprovalParty } from './worker-approvals/use-terminal-chat-worker-approval-party'
import { NativeChatThreadGoalBanner } from './session/goals/NativeChatThreadGoalBanner'
import { terminalChatThreadGoal } from './session/goals/terminal-chat-thread-goal'
import { NativeChatTerminalWorkerLifetimeStrip } from './worker-lifetime/NativeChatTerminalWorkerLifetimeStrip'
import type { NativeChatComposerHandle } from './composer/native-chat-composer-types'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'

const LOCAL: RuntimeClientTarget = { kind: 'local' }

type Props = {
  terminalTabId: string
  paneKey: string
  messages: readonly NativeChatMessage[]
  isVisible: boolean
  isWorking: boolean
  canSend: boolean
  composerRef: RefObject<NativeChatComposerHandle | null>
  /** The chat's own prompt card holds the box: the composer's strips step aside, as structured chats'. */
  promptShown: boolean
}

/**
 * What a structured chat shows on its message box, for a terminal-backed one: its Orca workers'
 * open permission prompts (answered through Orca, never typed into the worker), the goal Claude's
 * `/goal` set, and a temporary worker's lifetime with Keep open.
 */
export function NativeChatTerminalComposerStrips(props: Props): React.JSX.Element {
  const { terminalTabId, paneKey, isVisible } = props
  const party = useTerminalChatWorkerApprovalParty(terminalTabId, paneKey)
  return (
    <>
      {/* Workers' open prompts stay pinned here, above this chat's own prompt. */}
      <NativeChatPartyWorkerApprovalStack party={party} target={LOCAL} isVisible={isVisible} />
      {props.promptShown ? null : (
        <>
          <NativeChatTerminalGoalStrip {...props} />
          <NativeChatTerminalWorkerLifetimeStrip {...{ terminalTabId, paneKey, isVisible }} />
        </>
      )}
    </>
  )
}

/** Claude's own goal, read-only: only its `/goal` changes it, so Clear types `/goal clear`. */
function NativeChatTerminalGoalStrip({
  paneKey,
  messages,
  isVisible,
  isWorking,
  canSend,
  composerRef
}: Props): React.JSX.Element | null {
  const t = useTranslate()
  const goal = useMemo(() => terminalChatThreadGoal(messages), [messages])
  const turnStartedAt = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.turnStartedAt ?? null)
  if (!goal) {
    return null
  }
  return (
    <NativeChatThreadGoalBanner
      goal={goal}
      pending={false}
      hostChanges={false}
      sendUnavailable={!canSend || isWorking}
      isVisible={isVisible}
      runningTurn={isWorking ? { startedAt: turnStartedAt } : null}
      onChange={(change) => {
        if (change.kind !== 'clear') {
          return
        }
        if (composerRef.current?.resend?.('/goal clear') !== true) {
          toast.error(
            t(
              'components.native-chat.goal.clearNotSent',
              'Could not type /goal clear into the terminal'
            )
          )
        }
      }}
    />
  )
}
