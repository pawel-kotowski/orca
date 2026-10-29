import React from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'

/** Select needs a non-empty value; this one means "no account of its own". */
const FOLLOW_GLOBAL = '__follow-global__'

export type ComposerClaudeAccountFieldProps = {
  accounts: readonly { id: string; email: string }[]
  /** null follows the account Orca has selected for every launch. */
  value: string | null
  onValueChange: (accountId: string | null) => void
  /** Email of Orca's selected account, or null for System default. */
  globalAccountLabel: string | null
  projectName: string
  isProjectDefault: boolean
  onSetProjectDefault: () => void
}

export function ComposerClaudeAccountField({
  accounts,
  value,
  onValueChange,
  globalAccountLabel,
  projectName,
  isProjectDefault,
  onSetProjectDefault
}: ComposerClaudeAccountFieldProps): React.JSX.Element {
  const followLabel = translate(
    'components.newWorkspace.claudeAccountFollowGlobal',
    "Orca's account ({{value0}})",
    {
      value0:
        globalAccountLabel ??
        translate('components.newWorkspace.claudeAccountSystemDefault', 'System default')
    }
  )
  return (
    <div className="min-w-0 space-y-1" data-testid="composer-claude-account">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground">
          {translate('components.newWorkspace.claudeAccount', 'Claude account')}
        </label>
        {isProjectDefault ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="size-3" />
            {translate('components.newWorkspace.claudeAccountIsDefault', 'Default for {{value0}}', {
              value0: projectName
            })}
          </span>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onSetProjectDefault}
            tabIndex={-1}
            className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {translate(
              'components.newWorkspace.claudeAccountSetDefault',
              'Make default for {{value0}}',
              { value0: projectName }
            )}
          </Button>
        )}
      </div>
      <Select
        value={value ?? FOLLOW_GLOBAL}
        onValueChange={(next) => onValueChange(next === FOLLOW_GLOBAL ? null : next)}
      >
        <SelectTrigger
          className="h-9 w-full min-w-0 text-sm"
          aria-label={translate('components.newWorkspace.claudeAccount', 'Claude account')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FOLLOW_GLOBAL}>{followLabel}</SelectItem>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
