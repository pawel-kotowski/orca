import { useCallback, useState } from 'react'
import { History } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirmationDialog } from '@/components/dismiss/confirmation/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { makePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'
import type { ClaudeProjectSession } from '../../../../shared/native-chat/claude-project-session-types'
import {
  useNativeChatAccountScope,
  type NativeChatStructuredAccountScope
} from './native-chat-account-scope'
import {
  NativeChatConversationList,
  type NativeChatListedConversation
} from './native-chat-conversation-list'
import {
  listStructuredResumeConversations,
  resumeStructuredConversation,
  structuredChatOffersResume,
  type StructuredResumeConversation
} from './native-chat-structured-resume'
import { sendNativeChatTypedCommand } from './session/terminal/send/native-chat-runtime-send'

function sessionIdFromTranscript(transcriptPath: string | null): string | null {
  const name = transcriptPath?.split(/[\\/]/).pop() ?? null
  return name?.endsWith('.jsonl') ? name.slice(0, -'.jsonl'.length) : null
}

/** The chat tab's Claude pane: where `/resume <id>` is typed. */
function chatPtyId(terminalTabId: string): string | null {
  const state = useAppStore.getState()
  const ptyIdsByLeafId = state.terminalLayoutsByTabId[terminalTabId]?.ptyIdsByLeafId ?? {}
  const entries = Object.entries(ptyIdsByLeafId).filter(([, ptyId]) => Boolean(ptyId))
  const claude = entries.find(
    ([leafId]) =>
      state.agentStatusByPaneKey.get(makePaneKey(terminalTabId, leafId))?.agentType === 'claude'
  )
  return (claude ?? entries[0])?.[1] ?? null
}

type TerminalConversation = NativeChatListedConversation & { session: ClaudeProjectSession }

function TerminalSessionList({
  transcriptPath,
  terminalTabId,
  onPicked
}: {
  transcriptPath: string
  terminalTabId: string
  onPicked: () => void
}): React.JSX.Element {
  const load = useCallback(async (): Promise<TerminalConversation[]> => {
    const currentId = sessionIdFromTranscript(transcriptPath)
    const sessions =
      (await window.api?.nativeChat?.listClaudeProjectSessions?.(transcriptPath)) ?? []
    return sessions.map((session) => ({
      id: session.sessionId,
      title: session.title,
      firstPrompt: session.firstPrompt,
      updatedAt: session.updatedAt,
      current: session.sessionId === currentId,
      session
    }))
  }, [transcriptPath])
  const pick = ({ session, current }: TerminalConversation): void => {
    if (current) {
      onPicked()
      return
    }
    const ptyId = chatPtyId(terminalTabId)
    if (!ptyId) {
      toast.warning(
        translate(
          'components.native-chat.resumeList.noTerminal',
          "This chat's terminal isn't running."
        )
      )
      return
    }
    // Why the agent's own command: Claude swaps the conversation in this same terminal, exactly
    // as picking it from its /resume list does.
    sendNativeChatTypedCommand(ptyId, `/resume ${session.sessionId}`)
    onPicked()
  }
  return <NativeChatConversationList load={load} onPick={pick} />
}

function StructuredSessionList({
  scope,
  onPicked
}: {
  scope: NativeChatStructuredAccountScope
  onPicked: () => void
}): React.JSX.Element {
  const confirm = useConfirmationDialog()
  const load = useCallback(() => listStructuredResumeConversations(scope), [scope])
  return (
    <NativeChatConversationList
      load={load}
      onPick={({ session, current }: StructuredResumeConversation) =>
        current
          ? onPicked()
          : resumeStructuredConversation({ scope, session, dismiss: onPicked, confirm })
      }
    />
  )
}

/**
 * Resume another conversation in this chat (Paweł, 2026-11-09: "cant you just show simple list
 * like claude code in terminal shows?"): the project's conversations, newest first, as Claude
 * Code's /resume lists them; a pick resumes it here.
 */
export function NativeChatResumeButton(): React.JSX.Element | null {
  const scope = useNativeChatAccountScope()
  const [open, setOpen] = useState(false)
  // Why controlled: closing the list handed focus back to the button, which opened its tooltip,
  // and with the pointer elsewhere nothing closed it again (Paweł, 2026-11-09).
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const offered =
    scope?.kind === 'structured'
      ? structuredChatOffersResume(scope.agent)
      : scope?.agent === 'claude' && Boolean(scope.transcriptPath)
  if (!scope || !offered) {
    return null
  }
  const label = translate('components.native-chat.resumeButton', 'Resume a conversation')
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setTooltipOpen(false)
      }}
    >
      <Tooltip open={tooltipOpen && !open} onOpenChange={setTooltipOpen}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={label}
              className="text-chat-foreground-faint hover:text-chat-foreground"
            >
              <History className="size-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {label}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side="top"
        align="start"
        className="w-auto p-0"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {!open ? null : scope.kind === 'structured' ? (
          <StructuredSessionList scope={scope} onPicked={() => setOpen(false)} />
        ) : scope.transcriptPath ? (
          <TerminalSessionList
            transcriptPath={scope.transcriptPath}
            terminalTabId={scope.terminalTabId}
            onPicked={() => setOpen(false)}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
