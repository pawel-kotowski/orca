import type { ReactNode } from 'react'
import { Activity, Bot, SquareTerminal, Square, Workflow } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { formatNativeChatDuration } from '../../../../shared/native-chat/transcript/turns/native-chat-turn-status'
import type { NativeChatActivityCell } from './NativeChatActivityLine'

/** One running subagent, shell or watch, whichever kind of chat runs it. */
export type NativeChatRunningWork = {
  id: string
  kind: 'agent' | 'workflow' | 'command' | 'monitor' | 'unknown'
  label: string
  /** What hover says; the label itself when absent. */
  hover?: string
  startedAt?: number
  /** It waits on someone: its glyph takes the warning colour and the words say what for. */
  attention?: string
  /** The view the chat shows now is this one's. */
  current?: boolean
  onOpen?: (opener: HTMLElement) => void
  /** Only where the agent can stop one task (a terminal's Claude cannot). */
  onStop?: () => void
  stopping?: boolean
}

const GLYPHS = {
  agent: Bot,
  workflow: Workflow,
  command: SquareTerminal,
  monitor: Activity,
  unknown: SquareTerminal
} as const

/** The stop button a cell shows on hover or focus; it keeps its room, so nothing moves. */
export function NativeChatActivityCellStop({
  label,
  pending,
  onStop
}: {
  label: string
  pending?: boolean
  onStop: () => void
}): React.JSX.Element {
  const words = pending
    ? translate('components.native-chat.runningWork.stopping', 'Stopping {{name}}', { name: label })
    : translate('components.native-chat.runningWork.stop', 'Stop {{name}}', { name: label })
  return (
    <button
      type="button"
      aria-label={words}
      title={words}
      disabled={pending}
      onClick={onStop}
      className={cn(
        'flex size-4 shrink-0 cursor-pointer items-center justify-center rounded text-destructive/80 outline-none hover:bg-destructive/15 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring',
        pending ? 'opacity-60' : 'opacity-0 group-hover/cell:opacity-100 pointer-coarse:opacity-100'
      )}
    >
      <Square aria-hidden="true" className="size-2.5 fill-current" />
    </button>
  )
}

/** One cell of a one-line strip: the glyph, the work's own name and how long it has run. */
export function nativeChatRunningWorkCell(
  work: NativeChatRunningWork,
  now: number
): NativeChatActivityCell {
  const Icon = GLYPHS[work.kind]
  const words: ReactNode = (
    <>
      <Icon
        aria-hidden="true"
        className={cn(
          'size-3 shrink-0',
          work.attention
            ? 'text-chat-warning'
            : work.kind === 'monitor'
              ? 'text-yellow-500'
              : undefined
        )}
      />
      <span
        className={cn('min-w-0 truncate text-chat-foreground', work.current && 'font-semibold')}
      >
        {work.label}
      </span>
      {work.attention ? (
        <span className="min-w-0 truncate text-chat-warning">{work.attention}</span>
      ) : null}
      {work.startedAt !== undefined ? (
        <span className="shrink-0 font-mono tabular-nums">
          {formatNativeChatDuration(Math.max(0, (now - work.startedAt) / 1000))}
        </span>
      ) : null}
    </>
  )
  const { onOpen, onStop } = work
  return {
    key: `${work.kind}:${work.id}`,
    node: (
      <span className="group/cell flex h-4 w-full min-w-0 items-center gap-1">
        {onOpen ? (
          <button
            type="button"
            title={work.hover ?? work.label}
            aria-current={work.current || undefined}
            onClick={(event) => onOpen(event.currentTarget)}
            className="flex h-4 min-w-0 flex-1 cursor-pointer items-center gap-1 rounded text-left outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          >
            {words}
          </button>
        ) : (
          <span
            title={work.hover ?? work.label}
            className="flex h-4 min-w-0 flex-1 items-center gap-1"
          >
            {words}
          </span>
        )}
        {onStop ? (
          <NativeChatActivityCellStop label={work.label} pending={work.stopping} onStop={onStop} />
        ) : null}
      </span>
    )
  }
}
