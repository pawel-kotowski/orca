import { useEffect, useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatShortTimeAgo } from '@/lib/short-time-ago'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { makePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'
import type { ClaudeProjectSession } from '../../../../shared/native-chat/claude-project-session-types'
import { useNativeChatAccountScope } from './native-chat-account-usage'
import { sendNativeChatTypedCommand } from './native-chat-runtime-send'

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
      state.agentStatusByPaneKey[makePaneKey(terminalTabId, leafId)]?.agentType === 'claude'
  )
  return (claude ?? entries[0])?.[1] ?? null
}

function SessionList({
  transcriptPath,
  terminalTabId,
  onPicked
}: {
  transcriptPath: string
  terminalTabId: string
  onPicked: () => void
}): React.JSX.Element {
  const [sessions, setSessions] = useState<ClaudeProjectSession[] | null>(null)
  const [query, setQuery] = useState('')
  const currentId = sessionIdFromTranscript(transcriptPath)
  useEffect(() => {
    let live = true
    void (
      window.api?.nativeChat?.listClaudeProjectSessions?.(transcriptPath) ?? Promise.resolve([])
    )
      .then((list) => live && setSessions(list))
      .catch(() => live && setSessions([]))
    return () => {
      live = false
    }
  }, [transcriptPath])
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (sessions ?? []).filter(
      (session) =>
        !needle ||
        `${session.title ?? ''} ${session.firstPrompt ?? ''}`.toLowerCase().includes(needle)
    )
  }, [query, sessions])
  const now = useNow(30_000)
  const pick = (session: ClaudeProjectSession): void => {
    if (session.sessionId === currentId) {
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
  return (
    <div className="flex max-h-[min(480px,60vh)] w-[min(460px,80vw)] flex-col">
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={translate('components.native-chat.resumeList.search', 'Search conversations')}
        className="mx-2 mt-2 mb-1 h-7 rounded-md border border-border/70 bg-background/60 px-2 text-xs outline-none focus:border-ring"
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-1 scrollbar-sleek" role="listbox">
        {sessions === null ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            {translate('components.native-chat.resumeList.loading', 'Loading…')}
          </div>
        ) : shown.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            {translate('components.native-chat.resumeList.empty', 'No conversations to resume.')}
          </div>
        ) : (
          shown.map((session) => {
            const current = session.sessionId === currentId
            return (
              <button
                key={session.sessionId}
                type="button"
                role="option"
                aria-selected={current}
                onClick={() => pick(session)}
                className={cn(
                  'flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent',
                  current && 'bg-accent/50'
                )}
              >
                <span className="flex min-w-0 items-baseline gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {session.title ?? session.firstPrompt}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {current
                      ? translate('components.native-chat.resumeList.current', 'this chat')
                      : formatShortTimeAgo(session.updatedAt, now)}
                  </span>
                </span>
                {session.title && session.firstPrompt ? (
                  <span className="truncate text-2xs text-muted-foreground">
                    {session.firstPrompt}
                  </span>
                ) : null}
              </button>
            )
          })
        )}
      </div>
    </div>
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
  if (!scope || scope.agent !== 'claude' || !scope.transcriptPath) {
    return null
  }
  const label = translate('components.native-chat.resumeButton', 'Resume a conversation')
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
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
      <PopoverContent side="top" align="start" className="w-auto p-0">
        {open ? (
          <SessionList
            transcriptPath={scope.transcriptPath}
            terminalTabId={scope.terminalTabId}
            onPicked={() => setOpen(false)}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
