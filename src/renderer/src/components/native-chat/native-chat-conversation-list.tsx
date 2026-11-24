import { useEffect, useMemo, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { formatShortTimeAgo } from '@/lib/time-format/short-time-ago'
import { useNow } from '@/lib/window-activity/use-now'

export type NativeChatListedConversation = {
  id: string
  title: string | null
  firstPrompt: string | null
  updatedAt: number
  /** The one this chat shows now. */
  current: boolean
}

/**
 * The plain list Resume opens, whichever chat it belongs to (Paweł, 2026-11-09: "cant you just show
 * simple list like claude code in terminal shows?"): search, then one row per conversation.
 */
export function NativeChatConversationList<T extends NativeChatListedConversation>({
  load,
  onPick
}: {
  /** Stable while the list is open: it is read once per identity. */
  load: () => Promise<readonly T[]>
  onPick: (conversation: T) => void
}): React.JSX.Element {
  const [conversations, setConversations] = useState<readonly T[] | null>(null)
  const [query, setQuery] = useState('')
  useEffect(() => {
    let live = true
    void load()
      .then((list) => live && setConversations(list))
      .catch(() => live && setConversations([]))
    return () => {
      live = false
    }
  }, [load])
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (conversations ?? []).filter(
      (entry) =>
        !needle || `${entry.title ?? ''} ${entry.firstPrompt ?? ''}`.toLowerCase().includes(needle)
    )
  }, [conversations, query])
  const now = useNow(30_000)
  return (
    <div className="flex max-h-[min(480px,60vh)] w-[min(460px,80vw)] flex-col">
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={translate('components.native-chat.resumeList.search', 'Search conversations')}
        className="mx-2 mt-2 mb-1 rounded-md border border-border/70 bg-background/60 px-2 py-1.5 text-xs leading-normal outline-none focus:border-ring"
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-1 scrollbar-sleek" role="listbox">
        {conversations === null ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            {translate('components.native-chat.resumeList.loading', 'Loading…')}
          </div>
        ) : shown.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            {translate('components.native-chat.resumeList.empty', 'No conversations to resume.')}
          </div>
        ) : (
          shown.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="option"
              aria-selected={entry.current}
              onClick={() => onPick(entry)}
              className={cn(
                'flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent',
                entry.current && 'bg-accent/50'
              )}
            >
              <span className="flex min-w-0 items-baseline gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {entry.title ?? entry.firstPrompt}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {entry.current
                    ? translate('components.native-chat.resumeList.current', 'this chat')
                    : formatShortTimeAgo(entry.updatedAt, now)}
                </span>
              </span>
              {entry.title && entry.firstPrompt ? (
                <span className="truncate text-2xs text-muted-foreground">{entry.firstPrompt}</span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
