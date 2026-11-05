// Share exact PTY composer bytes across desktop/mobile.

import {
  sanitizeBracketedPasteText,
  UNFRAMED_AGENT_INPUT_MAX_BYTES,
  wrapTerminalBracketedPasteText
} from '../../terminal/input/terminal-bracketed-paste-text'
import { getTerminalInputByteLength } from '../../terminal/input/terminal-input'

// PTY Enter is carriage return, not newline.
const SUBMIT = '\r'

/** Any CR/LF, including a trailing newline, needs bracketed-paste framing. */
export function isMultilineDraft(text: string): boolean {
  return /[\r\n]/.test(text)
}

/** Write Enter separately from the framed body; see buildNativeChatPasteBytes. */
export const NATIVE_CHAT_SUBMIT = SUBMIT

/**
 * Claude Code's "send now" key: while it works, the message reaches the model at once instead of
 * waiting for the turn to end (plain Enter queues it); while idle it sends as Enter does. Claude
 * binds it to both Ctrl+Enter and the chord Ctrl+X Ctrl+S. Why the chord: it is plain control
 * bytes, so it survives ConPTY, SSH and tmux, which can drop the Ctrl+Enter escape sequence.
 */
export const CLAUDE_SEND_NOW_SUBMIT = '\x18\x13'

/** Build sanitized body bytes, bracket-framed for multiline or long input, without submit.
 * Agent TUIs treat CR in the same PTY write as pasted body, leaving text unsent. Write NATIVE_CHAT_SUBMIT separately after a short delay,
 * matching orca-runtime writeTerminalAction Enter handling. */
export function buildNativeChatPasteBytes(text: string): string {
  // Sanitize unframed text too so pasted scrollback cannot inject terminal escapes.
  const sanitized = sanitizeBracketedPasteText(text)
  if (
    isMultilineDraft(text) ||
    getTerminalInputByteLength(sanitized) > UNFRAMED_AGENT_INPUT_MAX_BYTES
  ) {
    return wrapTerminalBracketedPasteText(text)
  }
  return sanitized
}

/** Image attachments must look like a real terminal image paste to Claude/Codex
 *  TUIs. A plain typed path (or @file mention) is treated as text/file-read. */
export function buildNativeChatImagePasteBytes(filePath: string): string {
  return wrapTerminalBracketedPasteText(filePath)
}
