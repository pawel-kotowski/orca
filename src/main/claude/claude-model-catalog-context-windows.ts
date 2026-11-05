import { readdir, readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

/** Model id to the context window Claude Code itself was told it has, in tokens. */
export type ClaudeModelContextWindows = Record<string, number>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The account home a transcript was written under: Claude Code keeps sessions in
 * `<home>/projects/<project>/<session>.jsonl`, so the home is two folders up from `projects`.
 */
export function claudeConfigDirForTranscript(transcriptPath: string): string | null {
  if (!transcriptPath.endsWith('.jsonl')) {
    return null
  }
  const projects = dirname(dirname(transcriptPath))
  return basename(projects) === 'projects' ? dirname(projects) : null
}

/** One cached catalog file, as `{ fetchedAt, windows }`; null when it is not a model catalog. */
export function parseClaudeModelCatalog(
  text: string
): { fetchedAt: number; windows: ClaudeModelContextWindows } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  const catalog = isRecord(parsed) && isRecord(parsed.catalog) ? parsed.catalog : null
  const models = catalog && isRecord(catalog.config) ? catalog.config.models : null
  if (!Array.isArray(models)) {
    return null
  }
  const windows: ClaudeModelContextWindows = {}
  for (const model of models.filter(isRecord)) {
    const tokens = isRecord(model.runtime) ? model.runtime.max_input_tokens : null
    if (typeof model.id === 'string' && typeof tokens === 'number' && tokens > 0) {
      windows[model.id] = tokens
    }
  }
  const fetchedAt = isRecord(parsed) && typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : 0
  return { fetchedAt, windows }
}

/**
 * The context windows from the model catalog Claude Code caches in the transcript's account home
 * (`cache/model-catalog`). Why this file: a terminal session's transcript names the model but not
 * its window, and the same model id can carry 200k or 1M depending on the plan, which this catalog
 * already settled for that account. Empty when the home holds no catalog (older CLIs, remote hosts).
 */
export async function readClaudeModelContextWindows(
  transcriptPath: string
): Promise<ClaudeModelContextWindows> {
  const configDir = claudeConfigDirForTranscript(transcriptPath)
  if (!configDir) {
    return {}
  }
  const folder = join(configDir, 'cache', 'model-catalog')
  let names: string[]
  try {
    names = (await readdir(folder)).filter((name) => name.endsWith('.json'))
  } catch {
    return {}
  }
  const catalogs = await Promise.all(
    names.map((name) =>
      readFile(join(folder, name), 'utf8').then(parseClaudeModelCatalog, () => null)
    )
  )
  // Oldest first, so the newest fetch has the last word on a model both list.
  const sorted = catalogs
    .flatMap((catalog) => (catalog ? [catalog] : []))
    .sort((left, right) => left.fetchedAt - right.fetchedAt)
  return Object.assign({}, ...sorted.map((catalog) => catalog.windows))
}
