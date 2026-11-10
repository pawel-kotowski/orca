/**
 * The effort a running Claude started with, before it reports one on a tool or Stop hook: its
 * `--effort` flag, else its config folder's saved level for a model, else the folder's own.
 */
export type ClaudeSessionEffortSettings = {
  flag: string | null
  byModel: Record<string, string>
  fallback: string | null
}

/** The level Claude runs `model` at, by the order Claude itself applies them. */
export function claudeStartingEffort(
  settings: ClaudeSessionEffortSettings | null,
  model: string | null | undefined
): string | null {
  if (!settings) {
    return null
  }
  return settings.flag ?? (model ? settings.byModel[model] : undefined) ?? settings.fallback
}
