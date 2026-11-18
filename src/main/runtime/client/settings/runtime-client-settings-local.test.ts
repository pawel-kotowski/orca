import { describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/orca-profiles/constants'
import type { GlobalSettings } from '../../../../shared/settings/global-settings-types'
import { SettingsUpdate } from '../../../../shared/rpc-contract/client-ui/client-settings-params'
import { RuntimeClientSettingsController } from './runtime-client-settings'

vi.mock('../../../claude/agent-view/agent-view-service', () => ({
  getClaudeAgentViewService: () => ({ reconcile: async () => {} })
}))

// Local build (2026-11-15): settings.update takes the chat's appearance, merged key by key, so an
// agent can set the chat font or Light text without resending (or clobbering) the rest.
describe('settings.update nativeChatAppearance', () => {
  it('merges the given keys into the existing appearance', async () => {
    let settings: GlobalSettings = {
      ...getDefaultSettings('/home/me'),
      nativeChatAppearance: { fontSize: 18, width: 'wide' }
    }
    const store = {
      getSettings: () => settings,
      updateSettings: (updates: Partial<GlobalSettings>) => {
        settings = { ...settings, ...updates }
        return settings
      },
      runDurableMutation: vi.fn()
    }
    const controller = new RuntimeClientSettingsController(
      store as unknown as ConstructorParameters<typeof RuntimeClientSettingsController>[0]
    )
    const params = SettingsUpdate.parse({
      nativeChatAppearance: { fontFamily: 'Albert Sans', lightText: true }
    })
    await controller.update(params)
    expect(settings.nativeChatAppearance).toEqual({
      fontSize: 18,
      width: 'wide',
      fontFamily: 'Albert Sans',
      lightText: true
    })
  })

  it('accepts the interface font', () => {
    expect(SettingsUpdate.parse({ appFontFamily: ' Albert Sans ' })).toEqual({
      appFontFamily: 'Albert Sans'
    })
  })

  it('accepts the browser profile scope, Per account included', () => {
    expect(SettingsUpdate.parse({ browserProfileScope: 'account' })).toEqual({
      browserProfileScope: 'account'
    })
    expect(() => SettingsUpdate.parse({ browserProfileScope: 'everywhere' })).toThrow()
  })
})
