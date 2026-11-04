import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { nativeChatToolStepsOpen } from '../../../../shared/native-chat/native-chat-appearance-settings'
import { structuredAgentLabel } from '@/lib/agent-session/launch/structured-agent-session-launch-label'
import type { NativeChatLiveSession } from './use-native-chat-live-session'
import type { NativeChatTranscriptRowContext } from './NativeChatTranscriptRow'
import type { StructuredAgentSessionHostWork } from './use-structured-agent-session-transport-state'

type NativeChatTranscriptRowContextInput = Omit<
  NativeChatTranscriptRowContext,
  'agentName' | 'actionablePromptIds'
> & {
  agent: NativeChatLiveSession['agent']
  hostWork: StructuredAgentSessionHostWork | undefined
}

export function useNativeChatTranscriptRowContext({
  agent,
  hostWork,
  expandSignal,
  revealedDiff,
  taskListPredecessors,
  expandedTurnIds,
  deliveryNotices,
  allowFileUriLinks,
  runtimeContext,
  structuredAttachments,
  onLinkClick,
  onToggleExpandedTurn,
  subagentDisclosure,
  onScrollMessageToTop,
  onRevealDiff,
  rowArrivals
}: NativeChatTranscriptRowContextInput): NativeChatTranscriptRowContext {
  // Why: "Show every tool step" opens each run the same way an expand request does.
  const toolStepsOpen = useAppStore((state) => nativeChatToolStepsOpen(state.settings))
  return useMemo<NativeChatTranscriptRowContext>(
    () => ({
      agentName: structuredAgentLabel(agent),
      actionablePromptIds: hostWork?.actionablePromptIds,
      expandSignal: expandSignal || toolStepsOpen,
      revealedDiff,
      taskListPredecessors,
      expandedTurnIds,
      deliveryNotices,
      allowFileUriLinks,
      runtimeContext,
      structuredAttachments,
      onLinkClick,
      onToggleExpandedTurn,
      subagentDisclosure,
      onScrollMessageToTop,
      onRevealDiff,
      rowArrivals
    }),
    [
      agent,
      hostWork,
      allowFileUriLinks,
      expandSignal,
      toolStepsOpen,
      expandedTurnIds,
      deliveryNotices,
      onLinkClick,
      onRevealDiff,
      revealedDiff,
      runtimeContext,
      structuredAttachments,
      onScrollMessageToTop,
      taskListPredecessors,
      subagentDisclosure,
      onToggleExpandedTurn,
      rowArrivals
    ]
  )
}
