import { mkdirSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { nativeChatScratchFolderFor } from './native-chat-scratch-folder'
import { sweepNativeChatVisualsFolders } from './native-chat-visuals-sweep'

describe('the scratch folder sweep', () => {
  it('keeps the folder a live chat inherited after the chat it came from was deleted', async () => {
    const stateDirectory = mkdtempSync(join(tmpdir(), 'sweep-'))
    const inherited = nativeChatScratchFolderFor(stateDirectory, 'old-chat')
    const orphan = nativeChatScratchFolderFor(stateDirectory, 'gone-chat')
    mkdirSync(inherited, { recursive: true })
    mkdirSync(orphan, { recursive: true })
    const logger = { warn: () => {}, error: () => {} }
    await sweepNativeChatVisualsFolders({
      stateDirectory,
      // The old chat is deleted; the chat that took its conversation over is held.
      listHeldSessionIds: () => ['new-chat'],
      scratchSource: (id) => (id === 'new-chat' ? 'old-chat' : id),
      logger
    })
    expect(existsSync(inherited)).toBe(true)
    expect(existsSync(orphan)).toBe(false)
  })
})
