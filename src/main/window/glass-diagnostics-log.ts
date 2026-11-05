import { appendFile, mkdir, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { WebContents } from 'electron'

/** Renderer lines with this prefix are kept in a file a coding agent can read after the fact. */
export const GLASS_DIAGNOSTIC_PREFIX = '[orca-glass-diag]'
const MAX_LOG_BYTES = 2 * 1024 * 1024

// Why: the renderer's console is not saved anywhere, and a bug seen only right after a restart
// (a chat that comes up empty) cannot be inspected live; its own lines say what it saw.
export function attachGlassDiagnosticsLog(webContents: WebContents): void {
  const dir = join(app.getPath('userData'), 'logs')
  const file = join(dir, 'glass-diagnostics.log')
  let writing: Promise<void> = Promise.resolve()
  webContents.on('console-message', (...args: unknown[]) => {
    const first = args[0] as { message?: unknown } | undefined
    const message = typeof first?.message === 'string' ? first.message : args[2]
    if (typeof message !== 'string' || !message.startsWith(GLASS_DIAGNOSTIC_PREFIX)) {
      return
    }
    const line = `${new Date().toISOString()} ${message.slice(GLASS_DIAGNOSTIC_PREFIX.length).trim()}\n`
    writing = writing
      .then(async () => {
        await mkdir(dir, { recursive: true })
        const size = await stat(file).then(
          (info) => info.size,
          () => 0
        )
        if (size > MAX_LOG_BYTES) {
          await rename(file, `${file}.1`)
        }
        await appendFile(file, line)
      })
      .catch(() => undefined)
  })
}
