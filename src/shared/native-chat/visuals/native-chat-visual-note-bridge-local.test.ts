import { describe, expect, it } from 'vitest'
import {
  NATIVE_CHAT_VISUAL_NOTE_ANCHORS_TYPE,
  NATIVE_CHAT_VISUAL_NOTE_OPEN_TYPE,
  NATIVE_CHAT_VISUAL_NOTE_PICK_TYPE,
  readNativeChatVisualNoteMessage
} from './native-chat-visual-note-bridge'
import { buildNativeChatVisualDocument } from './native-chat-visual-shell'

const channel = 'c'.repeat(32)

describe('visual note messages from the sandboxed page', () => {
  it('reads a pick, a pin click and the missing anchors on its own channel', () => {
    expect(
      readNativeChatVisualNoteMessage(
        {
          channel,
          type: NATIVE_CHAT_VISUAL_NOTE_PICK_TYPE,
          selector: '#a',
          text: 'A',
          show: 'x.ts:1-2'
        },
        channel
      )
    ).toEqual({ kind: 'note-pick', selector: '#a', text: 'A', show: 'x.ts:1-2' })
    expect(
      readNativeChatVisualNoteMessage(
        { channel, type: NATIVE_CHAT_VISUAL_NOTE_OPEN_TYPE, id: 'n1' },
        channel
      )
    ).toEqual({ kind: 'note-open', id: 'n1' })
    expect(
      readNativeChatVisualNoteMessage(
        { channel, type: NATIVE_CHAT_VISUAL_NOTE_ANCHORS_TYPE, missing: ['n1'] },
        channel
      )
    ).toEqual({ kind: 'note-anchors', missing: ['n1'] })
  })

  it("refuses another document's channel and malformed fields", () => {
    const pick = { type: NATIVE_CHAT_VISUAL_NOTE_PICK_TYPE, selector: '#a', text: 'A' }
    expect(readNativeChatVisualNoteMessage({ ...pick, channel: 'other' }, channel)).toBeNull()
    expect(readNativeChatVisualNoteMessage({ ...pick, channel, selector: '' }, channel)).toBeNull()
    expect(readNativeChatVisualNoteMessage({ ...pick, channel, text: 3 }, channel)).toBeNull()
    expect(
      readNativeChatVisualNoteMessage(
        { channel, type: NATIVE_CHAT_VISUAL_NOTE_ANCHORS_TYPE, missing: [1] },
        channel
      )
    ).toBeNull()
    expect(readNativeChatVisualNoteMessage(null, channel)).toBeNull()
  })

  it('loads the note bridge after the CSP in every visual document', () => {
    const html = buildNativeChatVisualDocument({
      html: '<body></body>',
      channel,
      theme: { colorScheme: 'dark', tokens: {} }
    })
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(
      html.indexOf(NATIVE_CHAT_VISUAL_NOTE_PICK_TYPE)
    )
  })
})
