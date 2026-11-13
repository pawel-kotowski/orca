import { AlertTriangle, ChevronRight } from 'lucide-react'
import { NativeChatMarkdown } from '../../markdown/NativeChatMarkdown'
import { NativeChatCodeBlock } from '../../markdown/code/NativeChatCodeBlock'
import { NativeChatExpandable } from '../disclosure/NativeChatExpandable'
import { useNativeChatDisclosure } from '../disclosure/native-chat-disclosure-store'
import { useTranslate } from '@/i18n/use-translate'

const HEADER = 'Stop hook feedback'

/** The hook's own words after the row's "Stop hook feedback" header, as the host wrote them. */
export function nativeChatHookFeedbackReason(text: string): string {
  return text.startsWith(HEADER)
    ? text
        .slice(HEADER.length)
        .replace(/^(:\s*|\.\s*$|\n)/, '')
        .trim()
    : text.trim()
}

/**
 * A Stop hook that sent the agent back to work, as one line: the header and the start of the
 * hook's reason, which opens to the whole reason. Paweł, 2026-11-13: the full warning box was the
 * loudest thing in a turn although it is routine harness chatter ("should be expandable one liner").
 */
export function NativeChatHookFeedbackLine({
  text,
  messageId
}: {
  text: string
  messageId?: string
}): React.JSX.Element {
  const t = useTranslate()
  const reason = nativeChatHookFeedbackReason(text)
  const firstLine = reason.split('\n').find((line) => line.trim().length > 0) ?? ''
  const { open, setOpen } = useNativeChatDisclosure(
    messageId === undefined ? undefined : `hook-feedback:${messageId}`,
    false
  )
  const header = t('components.native-chat.notices.stopHookFeedback', HEADER)
  return (
    <div data-native-chat-hook-feedback className="min-w-0 text-xs leading-relaxed">
      <button
        type="button"
        aria-expanded={open}
        disabled={reason.length === 0}
        onClick={() => setOpen(!open)}
        className="group/hook flex min-h-6 w-full min-w-0 items-center gap-1.5 rounded-md py-0.5 text-left text-chat-foreground-faint hover:text-chat-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          <AlertTriangle aria-hidden className="size-3.5" />
        </span>
        <span className="shrink-0 font-medium">{header}</span>
        {!open && firstLine ? <span className="min-w-0 truncate">{firstLine}</span> : null}
        {reason ? (
          <ChevronRight
            aria-hidden
            className={
              open
                ? 'size-3 shrink-0 rotate-90 transition-transform motion-reduce:transition-none'
                : 'size-3 shrink-0 opacity-0 transition-transform group-hover/hook:opacity-100 group-focus-visible/hook:opacity-100 motion-reduce:transition-none'
            }
          />
        ) : null}
      </button>
      <NativeChatExpandable open={open}>
        <div className="ml-5.5 mt-1 border-l border-border pl-3 text-chat-foreground-faint">
          <NativeChatMarkdown
            rowKey={messageId === undefined ? undefined : `hook-feedback:${messageId}`}
            content={reason}
            variant="document"
            renderCodeBlock={NativeChatCodeBlock}
            className="text-xs"
          />
        </div>
      </NativeChatExpandable>
    </div>
  )
}
