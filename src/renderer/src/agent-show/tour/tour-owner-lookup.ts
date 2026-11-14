/**
 * The owner's tour: by its worktree and tab, else by the tab alone. Why the fallback: the CLI picks
 * the worktree from the shell's folder, so an agent that changed folders would lose its own tour.
 */
export function findOwnerTour<T extends { context: { ownerTabId: string | null } }>(
  tours: ReadonlyMap<string, T>,
  key: string,
  ownerTabId: string | null
): T | undefined {
  const exact = tours.get(key)
  if (exact || !ownerTabId) {
    return exact
  }
  return [...tours.values()].find((tour) => tour.context.ownerTabId === ownerTabId)
}
