import type { CatalogModel } from '../../../../../../../shared/agent-session/options/agent-session-option-catalog-types'
import type {
  SessionOptionDescriptor,
  SessionOptionValue
} from '../../../../../../../shared/native-chat/input/native-chat-session-options'
import type { ClaudeSessionEffortSettings } from '../../../../../../../shared/native-chat/claude-session-effort-types'
import {
  claudeTranscriptSessionValues,
  withClaudeHookEffort,
  withClaudeStartingEffort
} from './claude-terminal-session-options'

/**
 * The versioned row a family row runs (`opus` → `claude-opus-5-5`) when the host lists both, so
 * one model has one name on the pill however it was read (Paweł, 2026-11-14: the same Opus 5.5
 * read "Opus 5.5 alias" from the startup frame and "Claude Opus 5.5" from the transcript).
 */
export function claudeVersionedModelId(
  id: string,
  models: readonly CatalogModel[] | null | undefined
): string {
  const runs = models?.find((model) => model.id === id)?.resolvedModel
  return runs && runs !== id && models?.some((model) => model.id === runs) ? runs : id
}

function shown(snapshot: readonly SessionOptionDescriptor[], id: string): string | null {
  const descriptor = snapshot.find((entry) => entry.id === id)
  if (!descriptor || descriptor.valueSource === 'unknown' || descriptor.valueSource === 'default') {
    return null
  }
  const value = descriptor.kind.currentValue
  return typeof value === 'string' ? value : null
}

/**
 * What the pill should say for a Claude terminal chat: `found` (its startup frame, else its
 * newest reply), else the model it started on, else the host's default; with an effort always:
 * the hook's, else the frame's, else the level it started with. The start model, the default and
 * the starting effort only fill a gap, so they never undo a pick made in the picker.
 */
export function claudeSessionValuesToReport(args: {
  found: Record<string, SessionOptionValue> | null
  snapshot: readonly SessionOptionDescriptor[]
  models: readonly CatalogModel[] | null | undefined
  hookEffort: string | null
  start: ClaudeSessionEffortSettings | null
}): Record<string, SessionOptionValue> | null {
  const { snapshot, models, hookEffort, start } = args
  const shownModel = shown(snapshot, 'model')
  if (!args.found && shownModel && shown(snapshot, 'effort') !== null) {
    return null
  }
  const found =
    args.found ??
    (shownModel
      ? { model: shownModel }
      : (claudeTranscriptSessionValues(start?.model ?? null, models ?? undefined, null) ??
        defaultModelValues(models)))
  if (!found || typeof found.model !== 'string') {
    return found
  }
  const model = claudeVersionedModelId(found.model, models)
  const values = withClaudeHookEffort({ ...found, model }, hookEffort)
  // Why: an effort already shown for this model is a pick or a report, fresher than the start's.
  const keepsShownEffort = shownModel === model && shown(snapshot, 'effort') !== null
  return keepsShownEffort ? values : withClaudeStartingEffort(values, start)
}

function defaultModelValues(
  models: readonly CatalogModel[] | null | undefined
): Record<string, SessionOptionValue> | null {
  const model = models?.find((entry) => entry.isDefault)
  return model ? { model: model.id } : null
}
