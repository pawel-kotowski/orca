import { ImeTextarea } from '@/lib/text-input/ime/ime-text-field'
import { Bot, Check, CornerDownLeft, RotateCcw } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useMountedRef } from '@/hooks/useMountedRef'
import { useTranslate } from '@/i18n/use-translate'
import type { DiffCommentReply } from '../../../../shared/file-review/diff-comment-types'

/** A note's thread: the replies (the agent's from `orca notes reply`), a reply box, Resolve. */
export function NoteThread({
  replies,
  resolved,
  onReply,
  onResolvedChange,
  onContentResize
}: {
  replies: readonly DiffCommentReply[]
  resolved: boolean
  onReply: (body: string) => Promise<boolean>
  onResolvedChange: (resolved: boolean) => Promise<boolean>
  onContentResize?: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const [replying, setReplying] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const mountedRef = useMountedRef()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const onContentResizeRef = useRef(onContentResize)
  onContentResizeRef.current = onContentResize

  useLayoutEffect(() => {
    if (replying) {
      textareaRef.current?.focus()
    }
    onContentResizeRef.current?.()
  }, [replying, replies.length, resolved])

  const submit = async (): Promise<void> => {
    const body = draft.trim()
    if (!body || busy) {
      return
    }
    setBusy(true)
    try {
      if ((await onReply(body)) && mountedRef.current) {
        setDraft('')
        setReplying(false)
      }
    } finally {
      if (mountedRef.current) {
        setBusy(false)
      }
    }
  }

  return (
    <div className="orca-note-thread" onMouseDown={(event) => event.stopPropagation()}>
      {replies.map((reply) => (
        <div key={reply.id} className="orca-note-thread-reply">
          <div className="orca-note-thread-author">
            {reply.author === 'agent' ? <Bot className="size-3" /> : null}
            {reply.author === 'agent'
              ? t('components.noteThread.agent', 'Agent')
              : t('components.noteThread.you', 'You')}
          </div>
          <div className="orca-note-thread-body">{reply.body}</div>
        </div>
      ))}
      {replying ? (
        <div className="flex flex-col gap-2">
          <ImeTextarea
            ref={textareaRef}
            className="orca-diff-comment-popover-textarea"
            value={draft}
            placeholder={t('components.noteThread.replyPlaceholder', 'Reply…')}
            rows={2}
            onChange={(event) => {
              setDraft(event.target.value)
              onContentResizeRef.current?.()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setReplying(false)
                return
              }
              if (event.key === 'Enter' && !event.nativeEvent.isComposing && !event.shiftKey) {
                event.preventDefault()
                void submit()
              }
            }}
          />
          <div className="orca-diff-comment-popover-footer">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setReplying(false)}>
              {t('auto.components.diff.comments.DiffCommentCard.0203bed775', 'Cancel')}
            </Button>
            <Button size="sm" disabled={busy || !draft.trim()} onClick={() => void submit()}>
              {t('components.noteThread.reply', 'Reply')}
              <CornerDownLeft className="ml-1 size-3 opacity-70" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="orca-note-thread-actions">
          <Button variant="ghost" size="xs" onClick={() => setReplying(true)}>
            {t('components.noteThread.reply', 'Reply')}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void onResolvedChange(!resolved).finally(() => {
                if (mountedRef.current) {
                  setBusy(false)
                }
              })
            }}
          >
            {resolved ? <RotateCcw className="size-3" /> : <Check className="size-3" />}
            {resolved
              ? t('components.noteThread.reopen', 'Reopen')
              : t('components.noteThread.resolve', 'Resolve')}
          </Button>
        </div>
      )}
    </div>
  )
}
