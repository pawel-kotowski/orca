import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { SquareArrowOutUpRight } from 'lucide-react'
import { ArtifactPublishButton } from '@/components/artifacts/ArtifactPublishButton'
import { ArtifactPublishPreparationError } from '@/components/artifacts/artifact-publish-flow'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import { fileArtifactSourceKey } from '@/lib/files/artifacts/file-artifact-source-key'
import { useDiffCommentView } from '@/components/diff-comments/use-diff-comment-owner'
import { openChatVisualTab } from './popout/open-chat-visual-tab'
import { notesOnVisual, visualNotePins } from './popout/chat-visual-notes'
import { basename } from '@/lib/path'
import {
  getRuntimeTargetHostId,
  runtimeTargetEnvironmentId
} from '@/runtime/rpc/targets/runtime-client-target'
import { NATIVE_CHAT_VISUAL_RESERVED_HEIGHT, NativeChatVisualFrame } from './NativeChatVisualFrame'
import { showNativeChatVisualCode } from '@/agent-show/ui/chat-visual-code-show'
import { observeTranscriptVisibility } from '../images/native-chat-image-visibility'
import { NativeChatForwardedGestureContext } from '../../viewport/scroll/native-chat-reader-scroll-input'
import { readNativeChatVisual } from './native-chat-visual-read-client'
import { useNativeChatVisualDocument } from './use-native-chat-visual-document'
import type { ArtifactWriteRequest } from '../../../../../../shared/artifacts/artifacts'
import type { NativeChatVisualOwner } from './native-chat-visual-owner'

export function NativeChatVisualUnavailable(): React.JSX.Element {
  const t = useTranslate()
  return (
    <p className="my-2 text-xs text-chat-foreground-faint last:mb-0">
      {t('components.native-chat.visualUnavailable', 'Visualization unavailable')}
    </p>
  )
}

/** Opens the visual in a tab of its own beside the chat (Paweł, 2026-11-26: it "will get lost in chat"). */
function openNativeChatVisualTab(
  owner: NativeChatVisualOwner,
  file: string,
  title: string | null,
  options?: { noteId?: string; commentMode?: boolean }
): void {
  if (!owner.tabId) {
    return
  }
  openChatVisualTab(
    {
      environmentId: owner.target.kind === 'environment' ? owner.target.environmentId : null,
      sessionId: owner.sessionId,
      file,
      chatTabId: owner.tabId,
      title
    },
    owner.worktreeId,
    options
  )
}

/** The file's own key on the chat's host, so Share here and on the opened file update one link. */
export function nativeChatVisualShareKey(owner: NativeChatVisualOwner, path: string): string {
  return fileArtifactSourceKey(
    {
      executionHostId: getRuntimeTargetHostId(owner.target),
      runtimeEnvironmentId: runtimeTargetEnvironmentId(owner.target)
    },
    path
  )
}

/** Publishes the file as saved now, never the copy on screen; a failed read publishes nothing. */
export async function readNativeChatVisualShareRequest(
  owner: NativeChatVisualOwner,
  file: string
): Promise<ArtifactWriteRequest> {
  const { target, sessionId } = owner
  const outcome = await readNativeChatVisual({ target, sessionId, file }, { fresh: true })
  if (!outcome.ok) {
    throw new ArtifactPublishPreparationError('visual-unreadable')
  }
  return {
    sourceKey: nativeChatVisualShareKey(owner, outcome.document.path),
    content: outcome.document.html,
    contentType: 'text/html',
    fileName: basename(outcome.document.path)
  }
}

/** Mount near the viewport, then keep the frame mounted so interactive state survives scrolling away. */
export function NativeChatInlineVisual({
  owner,
  file,
  title
}: {
  owner: NativeChatVisualOwner
  file: string
  title: string | null
}): React.JSX.Element {
  const t = useTranslate()
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [near, setNear] = useState(false)
  const [retired, setRetired] = useState(false)
  // Share's popover is portalled, so hover and focus-within can't keep the toolbar shown.
  const [shareOpen, setShareOpen] = useState(false)
  const forwardGesture = useContext(NativeChatForwardedGestureContext)
  const state = useNativeChatVisualDocument(
    { target: owner.target, sessionId: owner.sessionId, file },
    near
  )
  const { comments } = useDiffCommentView(owner.worktreeId, 'selection')
  const shownPath = state.status === 'ready' ? state.document.path : null
  const pins = useMemo(
    () => visualNotePins(notesOnVisual(comments ?? [], shownPath), null),
    [comments, shownPath]
  )

  useEffect(() => {
    const element = boxRef.current
    if (!element || near) {
      return
    }
    return observeTranscriptVisibility(element, (visible) => {
      if (visible) {
        setNear(true)
      }
    })
  }, [near])

  if (retired || state.status === 'unavailable') {
    return <NativeChatVisualUnavailable />
  }
  const label = title ?? file
  const chatTabId = owner.tabId
  const openLabel = t('components.native-chat.visualOpenInNewTab', 'Open in new tab')

  return (
    <div ref={boxRef} className="group/visual my-3 last:mb-0">
      {state.status === 'ready' && near ? (
        <>
          {/* Above the frame, not over it: the page owns every pixel of its box. */}
          <div
            data-share-open={shareOpen}
            className="flex items-center justify-end gap-1 pb-1 transition-opacity can-hover:opacity-0 group-hover/visual:opacity-100 focus-within:opacity-100 data-[share-open=true]:opacity-100"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-xs"
                  aria-label={openLabel}
                  onClick={() => openNativeChatVisualTab(owner, file, title)}
                >
                  <SquareArrowOutUpRight />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {openLabel}
              </TooltipContent>
            </Tooltip>
            <ArtifactPublishButton
              variant="outline"
              size="icon-xs"
              sourceKey={nativeChatVisualShareKey(owner, state.document.path)}
              createRequest={() => readNativeChatVisualShareRequest(owner, file)}
              open={shareOpen}
              onOpenChange={setShareOpen}
            />
          </div>
          <NativeChatVisualFrame
            document={state.document}
            title={label}
            themeScope={boxRef}
            onRetired={() => setRetired(true)}
            onReaderGesture={forwardGesture ?? undefined}
            onShowCode={
              chatTabId ? (location) => showNativeChatVisualCode(chatTabId, location) : undefined
            }
            notePins={pins}
            onNoteMessage={(message) => {
              if (message.kind === 'note-open') {
                openNativeChatVisualTab(owner, file, title, { noteId: message.id })
              }
            }}
          />
        </>
      ) : (
        <div
          role="status"
          aria-label={t('components.native-chat.visualLoading', 'Loading visualization')}
          className="w-full rounded-md bg-muted/30"
          style={{ height: NATIVE_CHAT_VISUAL_RESERVED_HEIGHT }}
        />
      )}
    </div>
  )
}
