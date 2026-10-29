import { useCallback, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import type { ProspectiveWorkspace } from '@/lib/agent-launch-route-input'
import { saveProjectDefaultClaudeAccount } from '@/lib/workspace-claude-account'
import {
  isHostClaudeAccount,
  projectDefaultClaudeAccountId
} from '../../../../shared/claude-workspace-account'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { ComposerClaudeAccountFieldProps } from './ComposerClaudeAccountField'

export type ComposerClaudeAccount = {
  /** Absent when the picker does not apply: no accounts, another agent, or another host. */
  field: ComposerClaudeAccountFieldProps | undefined
  /** The account the new workspace saves as its own; null follows the global selection. */
  accountId: string | null
}

/** Preselect the project's default account; a pick holds only for the project it was made in. */
export function useComposerClaudeAccount(input: {
  workspace: ProspectiveWorkspace | undefined
  projectName: string
  agent: TuiAgent | null
}): ComposerClaudeAccount {
  const settings = useAppStore((s) => s.settings)
  const repoId = input.workspace?.repoId ?? null
  const [pick, setPick] = useState<{
    repoId: string
    accountId: string | null
  } | null>(null)
  const accounts = useMemo(
    () =>
      (settings?.claudeManagedAccounts ?? []).filter(
        (account) => account.managedAuthRuntime !== 'wsl'
      ),
    [settings?.claudeManagedAccounts]
  )
  // Accounts live on this machine, so only a workspace created here can run on one.
  const onThisMachine =
    input.workspace !== undefined &&
    (input.workspace.executionHostId ?? 'local') === 'local' &&
    !input.workspace.runtimeEnvironmentId
  const applies =
    repoId !== null &&
    accounts.length > 0 &&
    onThisMachine &&
    (input.agent === 'claude' || input.agent === null)
  const projectDefault = settings ? projectDefaultClaudeAccountId(settings, repoId) : null
  const picked =
    pick &&
    pick.repoId === repoId &&
    (pick.accountId === null || isHostClaudeAccount(settings ?? {}, pick.accountId))
      ? pick
      : null
  const accountId = picked ? picked.accountId : projectDefault
  const globalId =
    settings?.activeClaudeManagedAccountIdsByRuntime?.host ??
    settings?.activeClaudeManagedAccountId ??
    null
  const globalAccountLabel = accounts.find((account) => account.id === globalId)?.email ?? null

  const onValueChange = useCallback(
    (next: string | null) => {
      if (repoId) {
        setPick({ repoId, accountId: next })
      }
    },
    [repoId]
  )
  const onSetProjectDefault = useCallback(() => {
    if (repoId) {
      void saveProjectDefaultClaudeAccount(repoId, accountId).catch((error: unknown) => {
        console.warn('composer: could not save the project Claude account', repoId, error)
      })
    }
  }, [repoId, accountId])

  if (!applies) {
    return { field: undefined, accountId: null }
  }
  return {
    field: {
      accounts,
      value: accountId,
      onValueChange,
      globalAccountLabel,
      projectName: input.projectName,
      isProjectDefault: accountId === projectDefault,
      onSetProjectDefault
    },
    accountId
  }
}
