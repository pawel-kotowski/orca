import type { NativeChatAfterStopSend } from '../submit/native-chat-composer-target'
import { translate } from '../../../../i18n/i18n'
import type { Translate } from '../../../../i18n/use-translate'
import { NATIVE_CHAT_TURN_STATUS_COPY } from '../../../../../../shared/native-chat/transcript/native-chat-turn-status'

export function nativeChatComposerPlaceholder(
  hasPty: boolean,
  canSend: boolean,
  afterStop?: NativeChatAfterStopSend,
  t: Translate = translate
): string {
  if (!hasPty) {
    return t(
      'components.native-chat.composer.noPty',
      'No live terminal — toggle back to reconnect.'
    )
  }
  if (!canSend) {
    return t('components.native-chat.composer.locked', 'Input is held by another device.')
  }
  if (afterStop === 'queue') {
    return t(
      'components.native-chat.status.queueAfterStop',
      NATIVE_CHAT_TURN_STATUS_COPY.queueAfterStop
    )
  }
  if (afterStop === 'send') {
    return t(
      'components.native-chat.status.sendAfterStop',
      NATIVE_CHAT_TURN_STATUS_COPY.sendAfterStop
    )
  }
  // Why empty: Paweł asked to remove the "Ask anything, @ to mention files…" hint from chats; the
  // box shows only what it needs to say (held input, what Stop will do).
  return ''
}
