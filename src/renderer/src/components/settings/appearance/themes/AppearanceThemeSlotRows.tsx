import type { GlobalSettings } from '../../../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { SettingsRow } from '../../form-controls/SettingsFormControls'
import { SearchableSetting } from '../../section-layout/SearchableSetting'
import { translateSearchKeyword } from '../../search/settings-search-keywords'
import { AppearanceThemeSlotSelect } from './AppearanceThemeControl'
import { ThemeBackgroundImageSetting } from './ThemeBackgroundImageSetting'

/** The light and dark app theme pickers, then the background image painted under either. */
export function AppearanceThemeSlotRows({
  settings,
  updateSettings,
  forceVisible
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  forceVisible: boolean
}): React.JSX.Element {
  const themeSlots = [
    {
      base: 'light' as const,
      title: translate(
        'auto.components.settings.AppearanceInterfaceSection.lightTheme',
        'Light theme'
      )
    },
    {
      base: 'dark' as const,
      title: translate(
        'auto.components.settings.AppearanceInterfaceSection.darkTheme',
        'Dark theme'
      )
    }
  ]
  return (
    <>
      {themeSlots.map((slot) => (
        <SearchableSetting
          key={slot.base}
          title={slot.title}
          description={translate(
            'auto.components.settings.AppearanceInterfaceSection.themeSlot.description',
            'App colors for this mode.'
          )}
          keywords={[
            'plugin',
            'theme',
            'terminal',
            slot.base,
            ...translateSearchKeyword(
              'auto.components.settings.appearance.search.matchTerminal',
              'match terminal'
            )
          ]}
          forceVisible={forceVisible}
        >
          <SettingsRow
            label={slot.title}
            control={
              <AppearanceThemeSlotSelect
                base={slot.base}
                label={slot.title}
                settings={settings}
                updateSettings={updateSettings}
              />
            }
          />
        </SearchableSetting>
      ))}

      <ThemeBackgroundImageSetting forceVisible={forceVisible} />
    </>
  )
}
