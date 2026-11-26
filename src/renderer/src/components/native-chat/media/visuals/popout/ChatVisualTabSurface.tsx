import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquarePlus, MessagesSquare, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ArtifactPublishButton } from '@/components/artifacts/ArtifactPublishButton'
import { useDiffCommentView } from '@/components/diff-comments/use-diff-comment-owner'
import { useTranslate } from '@/i18n/use-translate'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { showNativeChatVisualCode } from '@/agent-show/ui/chat-visual-code-show'
import { parseVisualCodeLocation } from '../../../../../../../shared/native-chat/native-chat-code-range'
import type { ChatVisualTabIdentity } from '../../../../../../../shared/native-chat/visuals/chat-visual-tab-identity'
import type {
  NativeChatVisualNoteMessage,
  NativeChatVisualNotePick
} from '../../../../../../../shared/native-chat/visuals/native-chat-visual-note-bridge'
import type { NativeChatVisualOwner } from '../native-chat-visual-owner'
import { NativeChatVisualFrame } from '../NativeChatVisualFrame'
import {
  nativeChatVisualShareKey,
  readNativeChatVisualShareRequest
} from '../NativeChatInlineVisual'
import { NATIVE_CHAT_VISUAL_PAGE_MAX_WIDTH } from '../../../../../../../shared/native-chat/visuals/native-chat-visual-shell'
import { useFollowedChatVisual } from './use-followed-chat-visual'
import { notesOnVisual, sendVisualNotesToChat, visualNotePins } from './chat-visual-notes'
import { ChatVisualNoteCard, ChatVisualNoteDraft } from './ChatVisualNotesPanel'
import { subscribeChatVisualTabFocus, takeChatVisualTabFocus } from './open-chat-visual-tab'

// The page's --background (read from --chat-canvas first) is the editor surface here.
const PAGE_SCOPE_STYLE = { '--chat-canvas': 'var(--editor-surface)' } as React.CSSProperties
// The page's gutter (5vw inside the frame) measured on the column the frame fills.
const HEADER_GUTTER = 'clamp(16px, 5cqw, 48px)'

function ownerOf(identity: ChatVisualTabIdentity, worktreeId: string): NativeChatVisualOwner {
  return {
    target: identity.environmentId
      ? { kind: 'environment', environmentId: identity.environmentId }
      : { kind: 'local' },
    sessionId: identity.sessionId,
    worktreeId,
    tabId: identity.chatTabId
  }
}

function showCode(identity: ChatVisualTabIdentity, show: string): void {
  const location = parseVisualCodeLocation(show)
  if (location) {
    showNativeChatVisualCode(identity.chatTabId, location, 'below')
  }
}

/** A chat visual in a tab of its own: the page fills it, with comments on its parts beside it. */
export function ChatVisualTabSurface({
  file,
  identity
}: {
  file: OpenFile
  identity: ChatVisualTabIdentity
}): React.JSX.Element {
  const t = useTranslate()
  const scopeRef = useRef<HTMLDivElement | null>(null)
  const owner = useMemo(() => ownerOf(identity, file.worktreeId), [file.worktreeId, identity])
  const visual = useFollowedChatVisual(
    { target: owner.target, sessionId: identity.sessionId, file: identity.file },
    true
  )
  const path = visual.status === 'ready' ? visual.document.path : null
  const { owner: notesOwner, comments } = useDiffCommentView(file.worktreeId, file)
  const notes = useMemo(() => notesOnVisual(comments ?? [], path), [comments, path])
  // What the open that made this tab asked for first; the tab is keyed by its file id.
  const [opened] = useState(() => takeChatVisualTabFocus(file.id))
  const [commentMode, setCommentMode] = useState(opened?.commentMode === true)
  const [activeId, setActiveId] = useState<string | null>(opened?.noteId ?? null)
  const [draft, setDraft] = useState<NativeChatVisualNotePick | null>(null)
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const pins = useMemo(() => visualNotePins(notes, activeId), [activeId, notes])
  const unsent = useMemo(() => notes.filter((note) => !note.sentAt && !note.resolvedAt), [notes])

  useEffect(
    () =>
      subscribeChatVisualTabFocus(file.id, (noteId, mode) => {
        if (noteId) {
          setActiveId(noteId)
          setPanelOpen(true)
        }
        if (mode) {
          setCommentMode(true)
        }
      }),
    [file.id]
  )

  // Esc leaves comment mode wherever focus is; inside the page the page reports it.
  useEffect(() => {
    if (!commentMode) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        setCommentMode(false)
        setDraft(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commentMode])

  const onNoteMessage = useCallback((message: NativeChatVisualNoteMessage) => {
    if (message.kind === 'note-pick') {
      setDraft({ selector: message.selector, text: message.text, show: message.show })
      setActiveId(null)
    } else if (message.kind === 'note-open') {
      setActiveId(message.id)
      setPanelOpen(true)
    } else if (message.kind === 'note-anchors') {
      setMissing(new Set(message.missing))
    } else {
      setCommentMode(false)
      setDraft(null)
    }
  }, [])

  const addNote = async (body: string): Promise<boolean> => {
    if (!draft || !notesOwner || !path) {
      return false
    }
    const note = await useAppStore.getState().addDiffComment(notesOwner, {
      worktreeId: file.worktreeId,
      filePath: path,
      source: 'visual',
      lineNumber: 0,
      body,
      side: 'modified',
      visual: {
        file: identity.file,
        sessionId: identity.sessionId,
        ...(identity.environmentId ? { environmentId: identity.environmentId } : {}),
        chatTabId: identity.chatTabId,
        ...(identity.title ? { title: identity.title } : {}),
        selector: draft.selector,
        text: draft.text,
        ...(draft.show ? { show: draft.show } : {})
      }
    })
    if (!note) {
      toast.error(t('auto.components.editor.diffCommentSaveFailed', 'Failed to save comment'))
      return false
    }
    setDraft(null)
    setActiveId(note.id)
    return true
  }

  const send = async (): Promise<void> => {
    if (!notesOwner || !path || unsent.length === 0 || sending) {
      return
    }
    setSending(true)
    const outcome = await sendVisualNotesToChat({
      identity,
      worktreeId: file.worktreeId,
      owner: notesOwner,
      path,
      notes: unsent
    })
    setSending(false)
    if (outcome === 'sent') {
      toast.success(t('components.chatVisual.sentToast', 'Comments sent to the chat'))
    } else {
      toast.error(
        outcome === 'no-chat'
          ? t('components.chatVisual.noChat', 'The chat this visual came from is not open.')
          : t(
              'components.chatVisual.sendRefused',
              'The chat did not take the message. Try again when it is ready.'
            )
      )
    }
  }

  const title = identity.title ?? identity.file
  // The page gets the whole tab until there is something to show beside it.
  const showPanel = draft !== null || (notes.length > 0 && panelOpen)
  const sendLabel =
    unsent.length > 0
      ? t('components.chatVisual.sendCount', 'Send {{count}} to chat', { count: unsent.length })
      : t('components.chatVisual.send', 'Send to chat')
  return (
    <div
      ref={scopeRef}
      className="flex h-full min-h-0 bg-editor-surface"
      // The page's own background is the editor's, as every other document tab.
      style={PAGE_SCOPE_STYLE}
    >
      <div className="@container flex min-w-0 flex-1 flex-col">
        <div
          className="shrink-0 border-b border-border py-2"
          style={{ paddingInline: HEADER_GUTTER }}
        >
          <div
            className="mx-auto flex min-h-8 flex-wrap items-center gap-2"
            style={{ maxWidth: NATIVE_CHAT_VISUAL_PAGE_MAX_WIDTH }}
          >
            <div className="min-w-0 flex-[1_1_12rem]">
              <div className="break-words text-sm font-medium text-foreground">{title}</div>
              {identity.title ? (
                <div className="break-all text-xs text-muted-foreground">{identity.file}</div>
              ) : null}
            </div>
            <Button
              variant={commentMode ? 'secondary' : 'ghost'}
              size="xs"
              aria-pressed={commentMode}
              onClick={() => {
                setCommentMode((on) => !on)
                setDraft(null)
              }}
            >
              <MessageSquarePlus />
              {t('components.chatVisual.comment', 'Comment')}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={unsent.length === 0 || sending || !notesOwner}
                    onClick={() => void send()}
                  >
                    <Send />
                    {sendLabel}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                {unsent.length > 0
                  ? t(
                      'components.chatVisual.sendTooltip',
                      'Send your new comments to the chat as your message'
                    )
                  : t('components.chatVisual.allSent', 'No new comments to send')}
              </TooltipContent>
            </Tooltip>
            {notes.length > 0 ? (
              <Button
                variant={showPanel ? 'secondary' : 'ghost'}
                size="xs"
                aria-pressed={showPanel}
                onClick={() => {
                  setPanelOpen(!showPanel)
                  setDraft(null)
                }}
              >
                <MessagesSquare />
                {t('components.chatVisual.commentsCount', 'Comments {{count}}', {
                  count: notes.length
                })}
              </Button>
            ) : null}
            {path ? (
              <ArtifactPublishButton
                variant="ghost"
                size="icon-xs"
                sourceKey={nativeChatVisualShareKey(owner, path)}
                createRequest={() => readNativeChatVisualShareRequest(owner, identity.file)}
              />
            ) : null}
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          {commentMode ? (
            // Over the page, not above it: a bar would move the page under the pointer.
            <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center px-3">
              <div className="rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-xs">
                {t(
                  'components.chatVisual.commentHint',
                  'Click any part of the page to comment on it. Press Esc to stop.'
                )}
              </div>
            </div>
          ) : null}
          {visual.status === 'ready' ? (
            <NativeChatVisualFrame
              document={visual.document}
              title={title}
              themeScope={scopeRef}
              fit="fill"
              notePins={pins}
              commentMode={commentMode}
              onNoteMessage={onNoteMessage}
              onRetired={() => undefined}
              onShowCode={(location) =>
                showNativeChatVisualCode(identity.chatTabId, location, 'below')
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
              {visual.status === 'loading'
                ? t('components.native-chat.visualLoading', 'Loading visualization')
                : t('components.native-chat.visualUnavailable', 'Visualization unavailable')}
            </div>
          )}
        </div>
      </div>
      {showPanel ? (
        <aside className="flex w-80 max-w-1/2 shrink-0 flex-col gap-2 scrollbar-sleek overflow-y-auto border-l border-border bg-sidebar p-3">
          {draft ? (
            <ChatVisualNoteDraft pick={draft} onCancel={() => setDraft(null)} onSubmit={addNote} />
          ) : null}
          {notesOwner
            ? notes.map((note, index) => (
                <ChatVisualNoteCard
                  key={note.id}
                  note={note}
                  n={index + 1}
                  owner={notesOwner}
                  active={note.id === activeId}
                  missing={missing.has(note.id)}
                  onActivate={() => setActiveId(note.id)}
                  onShowCode={(show) => showCode(identity, show)}
                />
              ))
            : null}
        </aside>
      ) : null}
    </div>
  )
}
