/**
 * The effort a running Claude started with, before it reports one on a tool or Stop hook: its
 * `--effort` flag, else its config folder's saved level for a model, else the folder's own.
 */
export type ClaudeSessionEffortSettings = {
  flag: string | null
  byModel: Record<string, string>
  fallback: string | null
  /** The model it started on: its `--model` flag, else its config folder's saved model. */
  model?: string | null
}

/** The level Claude runs `model` at, by the order Claude itself applies them. */
export function claudeStartingEffort(
  settings: ClaudeSessionEffortSettings | null,
  model: string | null | undefined
): string | null {
  if (!settings) {
    return null
  }
  // Why: settings key a level by the bare model id; a picker id may carry a context suffix.
  const bare = model?.replace(/\[[^\]]*\]$/u, '')
  return settings.flag ?? (bare ? settings.byModel[bare] : undefined) ?? settings.fallback
}
