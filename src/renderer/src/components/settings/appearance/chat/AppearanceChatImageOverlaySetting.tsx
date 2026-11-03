import { useState } from 'react'
import type { NativeChatAppearanceSettings } from '../../../../../../shared/native-chat/native-chat-appearance-settings'
import { getChatContrastEntriesByKey } from './chat-appearance-search'
import { translate } from '@/i18n/i18n'
import { Slider } from '../../../ui/slider'
import { SearchableSetting } from '../../section-layout/SearchableSetting'
import { SettingsRow } from '../../form-controls/SettingsFormControls'

/** Local build: how solid the chat sits over a theme background image (native-chat-appearance.css). */
export function AppearanceChatImageOverlaySetting({
  value,
  onChange,
  forceVisible
}: {
  value: number
  onChange: (updates: NativeChatAppearanceSettings) => void
  forceVisible?: boolean
}): React.JSX.Element {
  const entry = getChatContrastEntriesByKey().imageOverlayOpacity
  return (
    <SearchableSetting id={entry.targetSectionId} {...entry} forceVisible={forceVisible}>
      <SettingsRow
        label={entry.title}
        description={entry.description}
        control={<ChatImageOverlaySlider value={value} onChange={onChange} />}
      />
    </SearchableSetting>
  )
}

function ChatImageOverlaySlider({
  value,
  onChange
}: {
  value: number
  onChange: (updates: NativeChatAppearanceSettings) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState({ saved: value, value })
  // Keep the thumb mounted so committed keyboard changes retain focus.
  if (draft.saved !== value) {
    setDraft({ saved: value, value })
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">
        {translate('settings.appearance.chat.imageOverlayMore', 'More image')}
      </span>
      <div className="w-40">
        <Slider
          min={30}
          max={100}
          step={1}
          value={[draft.value]}
          thumbLabels={[
            translate(
              'settings.appearance.chat.imageOverlayOpacity',
              'Chat over a background image'
            )
          ]}
          onValueChange={([next]) => setDraft({ saved: value, value: next })}
          onValueCommit={([next]) => onChange({ imageOverlayOpacity: next })}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {translate('settings.appearance.chat.imageOverlaySolid', 'Solid')}
      </span>
      <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
        {draft.value}%
      </span>
    </div>
  )
}
