import { SettingsSwitchRow } from '../../form-controls/SettingsFormControls'
import {
  nativeChatFinishedTurnsOpen,
  nativeChatShowsBareWorkingLine,
  nativeChatSoleCallAsLine,
  nativeChatActivityFollowsConversation,
  nativeChatActivityHoverChat,
  nativeChatCompactComposer,
  nativeChatCtrlEnterSendsNow,
  nativeChatToolStepsOpen
} from '../../../../../../shared/native-chat/native-chat-appearance-settings'
import {
  NATIVE_CHAT_COLOR_KEYS,
  normalizeNativeChatAppearanceSettings,
  type NativeChatColorKey,
  resetNativeChatAppearanceSettings,
  resolveNativeChatAppearanceSettings,
  type NativeChatAppearanceSettings
} from '../../../../../../shared/native-chat/native-chat-appearance-settings'
import { useAppStore } from '../../../../store/index'
import { formatPrimaryShortcutLabel } from '@/hooks/useShortcutLabel'
import { translate } from '@/i18n/i18n'
import { AppearanceChatContrastControls } from './AppearanceChatContrastControls'
import { AppearanceChatImageOverlaySetting } from './AppearanceChatImageOverlaySetting'
import { ChatFontFamilySetting } from './ChatFontFamilySetting'
import { Button } from '../../../ui/button'
import { SearchableSetting } from '../../section-layout/SearchableSetting'
import {
  ColorField,
  NumberField,
  SettingsRow,
  SettingsSegmentedControl
} from '../../form-controls/SettingsFormControls'
import {
  chatTerminalControlledHint,
  chatTerminalControlledTooltip,
  getChatAppearanceEntriesByKey,
  getChatWidthOptions
} from './chat-appearance-search'
import { writeNativeChatAppearance } from '../../../native-chat/native-chat-appearance-write'
import type { GlobalSettings } from '../../../../../../shared/global-settings-types'

// Why: approximate the themes' chat colors so a picker opens near the current color.
const CHAT_COLOR_PICKER_START: Record<NativeChatColorKey, string> = {
  textColorLight: '#363636',
  textColorDark: '#c8c8c8',
  userBubbleColorLight: '#f5f5f5',
  userBubbleColorDark: '#262626'
}

export type AppearanceChatSectionProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  forceVisiblePrimary?: boolean
  fontSuggestions?: string[]
  onRequestFontSuggestions?: () => void
}

export function AppearanceChatSection({
  settings,
  updateSettings,
  fontSuggestions,
  onRequestFontSuggestions,
  forceVisiblePrimary = false
}: AppearanceChatSectionProps): React.JSX.Element {
  const appearance = resolveNativeChatAppearanceSettings(settings.nativeChatAppearance)
  const matching = appearance.matchTerminalInterface
  const keybindings = useAppStore((state) => state.keybindings)
  const increase = formatPrimaryShortcutLabel('zoom.in', keybindings)
  const decrease = formatPrimaryShortcutLabel('zoom.out', keybindings)
  const entries = getChatAppearanceEntriesByKey({ increase, decrease })
  const update = (updates: NativeChatAppearanceSettings): void => {
    void writeNativeChatAppearance(
      (current) => normalizeNativeChatAppearanceSettings({ ...current, ...updates }),
      updateSettings
    )
  }
  return (
    <div className="divide-y divide-border/40">
      <AppearanceChatContrastControls
        appearance={appearance}
        onChange={update}
        forceVisiblePrimary={forceVisiblePrimary}
      />
      <AppearanceChatImageOverlaySetting
        value={appearance.imageOverlayOpacity}
        onChange={update}
        forceVisible={forceVisiblePrimary}
      />
      <SettingsSwitchRow
        label={translate('settings.chat.appearance.toolStepsOpen', 'Show every tool step')}
        description={translate(
          'settings.chat.appearance.toolStepsOpenDescription',
          'Runs of commands and tools list each step, headed by what the agent said it does. Off folds each run into one line.'
        )}
        checked={nativeChatToolStepsOpen(settings)}
        onChange={() => update({ toolStepsOpen: !nativeChatToolStepsOpen(settings) })}
      />
      <SettingsSwitchRow
        label={translate(
          'settings.chat.appearance.finishedTurnsOpen',
          'Keep everything the agent said'
        )}
        description={translate(
          'settings.chat.appearance.finishedTurnsOpenDescription',
          'A finished turn stays open with every message the agent wrote while working, as the terminal shows it. Off folds the turn behind its answer.'
        )}
        checked={nativeChatFinishedTurnsOpen(settings)}
        onChange={() => update({ finishedTurnsOpen: !nativeChatFinishedTurnsOpen(settings) })}
      />
      <SettingsSwitchRow
        label={translate(
          'settings.chat.appearance.bareWorkingLine',
          'Show Working… under the last step'
        )}
        description={translate(
          'settings.chat.appearance.bareWorkingLineDescription',
          'The turn bar already counts the time; this adds a line saying the agent is working when nothing more specific is known.'
        )}
        checked={nativeChatShowsBareWorkingLine(settings)}
        onChange={() => update({ bareWorkingLine: !nativeChatShowsBareWorkingLine(settings) })}
      />
      <SettingsSwitchRow
        label={translate(
          'settings.chat.appearance.soleCallAsLine',
          'Show a single command as its own step'
        )}
        description={translate(
          'settings.chat.appearance.soleCallAsLineDescription',
          'A run of one command opens straight to its code and output, without a run header above it.'
        )}
        checked={nativeChatSoleCallAsLine(settings)}
        onChange={() => update({ soleCallAsLine: !nativeChatSoleCallAsLine(settings) })}
      />
      <SettingsSwitchRow
        label={translate('settings.chat.appearance.compactComposer', 'Compact message box')}
        description={translate(
          'settings.chat.appearance.compactComposerDescription',
          'One line with only Attach, the model and option pickers, and Stop while the agent works. Enter sends.'
        )}
        checked={nativeChatCompactComposer(settings)}
        onChange={() => update({ compactComposer: !nativeChatCompactComposer(settings) })}
      />
      <SettingsSwitchRow
        label={translate(
          'settings.chat.appearance.ctrlEnterSendsNow',
          'Ctrl+Enter sends now while Claude works'
        )}
        description={translate(
          'settings.chat.appearance.ctrlEnterSendsNowDescription',
          "In a Claude chat that runs in its terminal, Ctrl+Enter gives Claude the message right away, as Ctrl+Enter does in Claude's terminal. Enter waits until Claude finishes what it is doing."
        )}
        checked={nativeChatCtrlEnterSendsNow(settings)}
        onChange={() => update({ ctrlEnterSendsNow: !nativeChatCtrlEnterSendsNow(settings) })}
      />
      <SettingsSwitchRow
        label={translate(
          'settings.chat.appearance.activityFollowsConversation',
          'Activity view follows the conversation'
        )}
        description={translate(
          'settings.chat.appearance.activityFollowsConversationDescription',
          'Each card shows the first and latest prompt, the latest steps and the answer.'
        )}
        checked={nativeChatActivityFollowsConversation(settings)}
        onChange={() =>
          update({ activityFollowsConversation: !nativeChatActivityFollowsConversation(settings) })
        }
      />
      <SettingsSwitchRow
        label={translate(
          'settings.chat.appearance.activityHoverChat',
          'Show the chat when hovering an activity card'
        )}
        description={translate(
          'settings.chat.appearance.activityHoverChatDescription',
          'Hovering a card opens its live chat beside the list. When off, a click anywhere on a card opens its workspace.'
        )}
        checked={nativeChatActivityHoverChat(settings)}
        onChange={() => update({ activityHoverChat: !nativeChatActivityHoverChat(settings) })}
      />
      <ChatFontFamilySetting
        settings={settings}
        onChange={(fontFamily) => update({ fontFamily })}
        fontSuggestions={fontSuggestions}
        onRequestFontSuggestions={onRequestFontSuggestions}
        forceVisible={forceVisiblePrimary}
      />
      <SearchableSetting
        id={entries.textSize.targetSectionId}
        {...entries.textSize}
        forceVisible={forceVisiblePrimary}
      >
        <NumberField
          label={entries.textSize.title}
          description={matching ? chatTerminalControlledHint() : entries.textSize.description}
          value={appearance.fontSize}
          defaultValue={matching ? undefined : 14}
          disabled={matching}
          disabledReason={chatTerminalControlledTooltip()}
          min={12}
          max={20}
          integer
          suffix={translate('settings.appearance.chat.pixels', 'px')}
          onChange={(fontSize) => update({ fontSize })}
        />
      </SearchableSetting>
      <SearchableSetting
        id={entries.codeTextSize.targetSectionId}
        {...entries.codeTextSize}
        forceVisible={forceVisiblePrimary}
      >
        <NumberField
          label={entries.codeTextSize.title}
          description={matching ? chatTerminalControlledHint() : entries.codeTextSize.description}
          value={appearance.codeFontSize}
          defaultValue={matching ? undefined : 12}
          disabled={matching}
          disabledReason={chatTerminalControlledTooltip()}
          min={10}
          max={18}
          integer
          suffix={translate('settings.appearance.chat.pixels', 'px')}
          onChange={(codeFontSize) => update({ codeFontSize })}
        />
      </SearchableSetting>
      <SearchableSetting
        id={entries.width.targetSectionId}
        {...entries.width}
        forceVisible={forceVisiblePrimary}
      >
        <SettingsRow
          label={entries.width.title}
          description={entries.width.description}
          control={
            <SettingsSegmentedControl
              value={appearance.width}
              onChange={(width) => update({ width })}
              options={getChatWidthOptions()}
              ariaLabel={entries.width.title}
            />
          }
        />
      </SearchableSetting>
      {NATIVE_CHAT_COLOR_KEYS.map((key) => (
        <SearchableSetting
          key={key}
          id={entries[key].targetSectionId}
          {...entries[key]}
          forceVisible={forceVisiblePrimary}
        >
          <ColorField
            label={entries[key].title}
            description={entries[key].description}
            value={settings.nativeChatAppearance?.[key] ?? ''}
            fallback={CHAT_COLOR_PICKER_START[key]}
            onChange={(color) => update({ [key]: color })}
          />
        </SearchableSetting>
      ))}
      <SearchableSetting
        id={entries.reset.targetSectionId}
        {...entries.reset}
        forceVisible={forceVisiblePrimary}
      >
        <SettingsRow
          label={entries.reset.title}
          description={entries.reset.description}
          control={
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void writeNativeChatAppearance(resetNativeChatAppearanceSettings, updateSettings)
              }
            >
              {translate('settings.appearance.chat.reset', 'Reset')}
            </Button>
          }
        />
      </SearchableSetting>
    </div>
  )
}
