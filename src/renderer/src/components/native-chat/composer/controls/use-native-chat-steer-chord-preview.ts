import { useEffect, useState, type RefObject } from 'react'
import type { NativeChatFollowUpBehavior } from '../../../../../../shared/native-chat/input/native-chat-follow-up-behavior'
import { createNativeChatSteerChordPreviewHook } from '../../../../../../shared/native-chat/input/use-native-chat-steer-chord-preview'

import type { NativeChatComposerSendIntent } from '../submit/native-chat-composer-send-intent'
import { isMacPlatform } from '../../pane/routing/native-chat-shortcut'

const useSteerChordPreview = createNativeChatSteerChordPreviewHook({ useEffect, useState })

/** Desktop's chord: Cmd+Enter on a Mac, Ctrl+Enter elsewhere; local: a terminal Claude's
 *  Ctrl+Enter, which sends now, on every platform. */
export function useNativeChatSteerChordPreview(
  root: RefObject<HTMLElement | null>,
  sendState: {
    alternateSend?: NativeChatFollowUpBehavior
    hasDraft: boolean
    chordSteersHead: boolean
  },
  steerHead: (() => boolean) | undefined,
  send: (intent?: NativeChatComposerSendIntent) => void,
  pickerOpen: boolean,
  ctrlEnterSendsNow = false
) {
  return useSteerChordPreview(
    root,
    sendState,
    steerHead,
    () => send(ctrlEnterSendsNow ? { sendNow: true } : { alternate: true }),
    pickerOpen,
    isMacPlatform() && !ctrlEnterSendsNow ? 'Meta' : 'Control'
  )
}
