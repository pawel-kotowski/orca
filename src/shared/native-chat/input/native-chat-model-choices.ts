import type { CatalogModel } from '../../agent-session/options/catalog-providers/agent-session-option-catalog-types'
import { unlistedModelLabel } from '../../agent-session/options/model-catalog/model-id-label'

/**
 * The rows a model picker lists. Claude's listing repeats each versioned row as a family row
 * ("Opus 5.5 alias", `opus` → `claude-opus-5-5`); the same model twice, one marked "alias", read
 * as noise (Paweł, 2026-11-14: "still see this alias shit in selector"). A model has one row: its
 * versioned one, or the family row a chat is set to, named as the model it runs. Labels only:
 * the row keeps the value that is sent.
 */
export function nativeChatPickerModels(
  models: readonly CatalogModel[],
  currentId: string | null
): CatalogModel[] {
  const byId = new Map(models.map((model) => [model.id, model]))
  const current = currentId === null ? undefined : byId.get(currentId)
  const currentRuns = current && runsOtherModel(current) ? current.resolvedModel : undefined
  return models
    .filter(
      (model) =>
        model.id === currentId ||
        (model.id !== currentRuns &&
          (!runsOtherModel(model) || !byId.has(model.resolvedModel ?? '')))
    )
    .map((model) =>
      model === current && currentRuns
        ? { ...model, label: runningModelLabel(byId.get(currentRuns), currentRuns, model.label) }
        : /\s+alias$/iu.test(model.label)
          ? { ...model, label: model.label.replace(/\s+alias$/iu, '') }
          : model
    )
}

function runsOtherModel(model: CatalogModel): boolean {
  return Boolean(model.resolvedModel) && model.resolvedModel !== model.id
}

function runningModelLabel(listed: CatalogModel | undefined, id: string, alias: string): string {
  if (listed) {
    return listed.label
  }
  return /^claude-/iu.test(id) ? unlistedModelLabel('claude', id) : alias.replace(/\s+alias$/iu, '')
}
