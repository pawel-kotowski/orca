import { useEffect, useRef, useState } from 'react'
import { Code2, CornerDownLeft, Trash } from 'lucide-react'
import { ImeTextarea } from '@/lib/text-input/ime/ime-text-field'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import { NoteThread } from '@/components/diff-comments/NoteThread'
import type { DiffCommentOwner } from '@/store/slices/diff-comments/diff-comment-owner'
import { useAppStore } from '@/store'
import type { DiffComment } from '../../../../../../../shared/file-review/diff-comment-types'
import type { NativeChatVisualNotePick } from '../../../../../../../shared/native-chat/visuals/native-chat-visual-note-bridge'

function PartQuote({ text }: { text: string }): React.JSX.Element | null {
  return text ? (
    <div className="max-h-24 scrollbar-sleek overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-primary/40 pl-2 text-xs text-muted-foreground">
      {text}
    </div>
  ) : null
}

function PinNumber({ n, resolved }: { n: number; resolved: boolean }): React.JSX.Element {
  return (
    <span
      className={cn(
        'flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full rounded-bl-sm px-1 text-xs font-semibold tabular-nums',
        resolved ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'
      )}
    >
      {n}
    </span>
  )
}

export function ChatVisualNoteDraft({
  pick,
  onCancel,
  onSubmit
}: {
  pick: NativeChatVisualNotePick
  onCancel: () => void
  onSubmit: (body: string) => Promise<boolean>
}): React.JSX.Element {
  const t = useTranslate()
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => ref.current?.focus(), [pick])
  const submit = async (): Promise<void> => {
    if (!body.trim() || saving) {
      return
    }
    setSaving(true)
    const ok = await onSubmit(body.trim())
    setSaving(false)
    if (ok) {
      setBody('')
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/50 bg-card p-3 shadow-xs">
      <PartQuote text={pick.text} />
      <ImeTextarea
        ref={ref}
        className="orca-diff-comment-popover-textarea"
        value={body}
        rows={3}
        placeholder={t('components.chatVisual.commentPlaceholder', 'Comment on this part…')}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            void submit()
          }
        }}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          {t('auto.components.diff.comments.DiffCommentCard.0203bed775', 'Cancel')}
        </Button>
        <Button size="sm" onClick={() => void submit()} disabled={saving || !body.trim()}>
          {t('components.chatVisual.comment', 'Comment')}
          <CornerDownLeft className="size-3 opacity-70" />
        </Button>
      </div>
    </div>
  )
}

export function ChatVisualNoteCard({
  note,
  n,
  owner,
  active,
  missing,
  onActivate,
  onShowCode
}: {
  note: DiffComment
  n: number
  owner: DiffCommentOwner
  active: boolean
  missing: boolean
  onActivate: () => void
  onShowCode: (show: string) => void
}): React.JSX.Element {
  const t = useTranslate()
  const resolved = note.resolvedAt !== undefined
  const cardRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (active) {
      cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [active])
  return (
    <div
      ref={cardRef}
      data-active={active}
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors',
        active ? 'border-primary/60 shadow-xs' : 'border-border hover:border-foreground/20'
      )}
      onClick={onActivate}
    >
      <div className="flex items-start gap-2">
        <PinNumber n={n} resolved={resolved} />
        <div className="min-w-0 flex-1">
          <PartQuote text={note.visual?.text ?? ''} />
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t('auto.components.diff.comments.DiffCommentCard.cce596969e', 'Delete note')}
          onClick={(event) => {
            event.stopPropagation()
            void useAppStore.getState().deleteDiffComment(owner, note.id)
          }}
        >
          <Trash />
        </Button>
      </div>
      {note.visual?.show ? (
        <Button
          variant="ghost"
          size="xs"
          className="self-start"
          onClick={(event) => {
            event.stopPropagation()
            onShowCode(note.visual?.show ?? '')
          }}
        >
          <Code2 />
          <span className="font-mono">{note.visual.show}</span>
        </Button>
      ) : null}
      <div
        className={cn(
          'whitespace-pre-wrap break-words text-sm',
          resolved ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        {note.body}
      </div>
      {missing || note.sentAt ? (
        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {missing ? (
            <span>
              {t('components.chatVisual.partGone', 'This part is no longer on the page.')}
            </span>
          ) : null}
          {note.sentAt ? <span>{t('components.chatVisual.sent', 'Sent to the chat')}</span> : null}
        </div>
      ) : null}
      <NoteThread
        replies={note.replies ?? []}
        resolved={resolved}
        onReply={(body) => useAppStore.getState().replyToDiffComment(owner, note.id, body)}
        onResolvedChange={(next) =>
          useAppStore.getState().setDiffCommentResolved(owner, note.id, next)
        }
      />
    </div>
  )
}
