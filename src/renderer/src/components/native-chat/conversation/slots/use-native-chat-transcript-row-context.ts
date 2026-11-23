import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { nativeChatToolStepsOpen } from '../../../../../../shared/native-chat/settings/native-chat-appearance-settings'
import { structuredAgentLabel } from '@/lib/agent-session/launch/structured-agent-session-launch-label'
import type { NativeChatLiveSession } from '../../session/terminal/read/native-chat-live-session-contract'
import type { NativeChatTranscriptRowContext } from '../../messages/rows/NativeChatTranscriptRow'
import type { StructuredAgentSessionHostWork } from '../../session/structured/use-structured-agent-session-transport-state'

type NativeChatTranscriptRowContextInput = Omit<
  NativeChatTranscriptRowContext,
  'agentName' | 'actionablePromptIds' | 'timedRows'
> & {
  agent: NativeChatLiveSession['agent']
  hostWork: StructuredAgentSessionHostWork | undefined
}

export function useNativeChatTranscriptRowContext({
  agent,
  turnBot,
  hostWork,
  expandSignal,
  revealedDiff,
  taskListPredecessors,
  expandedTurnIds,
  latestTurnKey,
  deliveryNotices,
  runtimeContext,
  structuredAttachments,
  onToggleExpandedTurn,
  onOpenSubagent,
  onScrollMessageToTop,
  readerAtEnd,
  onRevealDiff
}: NativeChatTranscriptRowContextInput): NativeChatTranscriptRowContext {
  // Why: "Show every tool step" opens each run the same way an expand request does.
  const toolStepsOpen = useAppStore((state) => nativeChatToolStepsOpen(state.settings))
  return useMemo<NativeChatTranscriptRowContext>(
    () => ({
      turnBot,
      agentName: structuredAgentLabel(agent),
      actionablePromptIds: hostWork?.actionablePromptIds,
      expandSignal: expandSignal || toolStepsOpen,
      revealedDiff,
      taskListPredecessors,
      expandedTurnIds,
      latestTurnKey,
      deliveryNotices,
      runtimeContext,
      structuredAttachments,
      onToggleExpandedTurn,
      onOpenSubagent,
      onScrollMessageToTop,
      readerAtEnd,
      onRevealDiff
    }),
    [
      agent,
      turnBot,
      hostWork,
      expandSignal,
      toolStepsOpen,
      expandedTurnIds,
      latestTurnKey,
      deliveryNotices,
      onRevealDiff,
      revealedDiff,
      runtimeContext,
      structuredAttachments,
      onScrollMessageToTop,
      readerAtEnd,
      taskListPredecessors,
      onOpenSubagent,
      onToggleExpandedTurn
    ]
  )
}
