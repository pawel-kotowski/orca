import type { CatalogModel } from '../../agent-session/options/agent-session-option-catalog-types'

/**
 * The rows a model picker lists. Claude's listing repeats each versioned row as a family row
 * ("Opus 5.5 alias", `opus` → `claude-opus-5-5`); the same model twice, one marked "alias", read
 * as noise (Paweł, 2026-11-14: "still see this alias shit in selector"). A family row whose
 * model is listed is left out unless it is the chat's current model, and no row says "alias".
 */
export function nativeChatPickerModels(
  models: readonly CatalogModel[],
  currentId: string | null
): CatalogModel[] {
  const ids = new Set(models.map((model) => model.id))
  return models
    .filter(
      (model) =>
        model.id === currentId ||
        !model.resolvedModel ||
        model.resolvedModel === model.id ||
        !ids.has(model.resolvedModel)
    )
    .map((model) =>
      /\s+alias$/iu.test(model.label)
        ? { ...model, label: model.label.replace(/\s+alias$/iu, '') }
        : model
    )
}
