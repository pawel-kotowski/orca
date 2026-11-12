import { useCallback, useEffect, useState } from 'react'
import { ImageOff, ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Slider } from '../../../ui/slider'
import { SettingsRow, SettingsSegmentedControl } from '../../form-controls/SettingsFormControls'
import { SearchableSetting } from '../../section-layout/SearchableSetting'
import { writeNativeChatAppearance } from '../../../native-chat/appearance/native-chat-appearance-write'
import {
  forgetUserThemeBackgroundUrl,
  useUserThemeBackgroundChoice,
  userThemeBackgroundUrl
} from '@/lib/user-theme-background'
import type {
  UserThemeBackgroundChoice,
  UserThemeBackgroundPosition,
  UserThemeBackgroundSize
} from '../../../../../../shared/theme-background/user-theme-background'

const DEFAULT_STRENGTH = 0.6

function saveChoice(choice: UserThemeBackgroundChoice | null): void {
  void writeNativeChatAppearance((current) => {
    const rest = { ...current } as Record<string, unknown>
    delete rest.themeBackground
    return choice ? { ...rest, themeBackground: choice } : rest
  })
}

function Thumbnail({
  name,
  selected,
  onSelect,
  onRemove
}: {
  name: string
  selected: boolean
  onSelect: () => void
  onRemove: () => void
}): React.JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void userThemeBackgroundUrl(name).then((value) => live && setUrl(value))
    return () => {
      live = false
    }
  }, [name])
  return (
    <div className="group/thumb relative">
      <button
        type="button"
        aria-pressed={selected}
        aria-label={translate('settings.themeBackground.use', 'Use this image')}
        onClick={onSelect}
        className={cn(
          'block h-14 w-24 cursor-pointer overflow-hidden rounded-md border bg-muted bg-cover bg-center outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selected ? 'border-primary ring-2 ring-primary/60' : 'border-border hover:border-ring'
        )}
        style={url ? { backgroundImage: `url(${JSON.stringify(url)})` } : undefined}
      />
      <button
        type="button"
        aria-label={translate('settings.themeBackground.remove', 'Remove this image')}
        onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 hidden size-5 cursor-pointer items-center justify-center rounded-full border border-border bg-popover text-muted-foreground shadow-sm hover:text-foreground group-hover/thumb:flex focus-visible:flex"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

/**
 * Settings → Appearance → Background image: pictures from disk painted behind terminals and chats,
 * in place of the theme's own (Paweł, 2026-11-08: "add option to change background of my theme,
 * via selecting images from disk"). Every picked image stays in the gallery to switch back to.
 */
export function ThemeBackgroundImageSetting({
  forceVisible
}: {
  forceVisible: boolean
}): React.JSX.Element {
  const choice = useUserThemeBackgroundChoice()
  const surfaceOpacity = useAppStore((s) => s.settings?.terminalBackgroundOpacity ?? 1)
  const reduceEffects = useAppStore((s) => s.settings?.reduceVisualEffects === true)
  const [names, setNames] = useState<string[]>([])
  const refresh = useCallback(async () => {
    setNames(await window.api.settings.listThemeBackgrounds())
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const select = (name: string): void =>
    saveChoice({
      name,
      opacity: choice?.opacity ?? DEFAULT_STRENGTH,
      size: choice?.size ?? 'cover',
      position: choice?.position ?? 'center'
    })
  const add = async (): Promise<void> => {
    const result = await window.api.settings.pickThemeBackground()
    if (!result) {
      return
    }
    if ('error' in result) {
      toast.error(
        result.error === 'too-large'
          ? translate('settings.themeBackground.tooLarge', 'That image is over 25 MB.')
          : translate('settings.themeBackground.notImage', 'Choose a PNG, JPEG, WebP or GIF image.')
      )
      return
    }
    await refresh()
    select(result.name)
  }
  const remove = async (name: string): Promise<void> => {
    await window.api.settings.removeThemeBackground(name)
    forgetUserThemeBackgroundUrl(name)
    if (choice?.name === name) {
      saveChoice(null)
    }
    await refresh()
  }
  const update = (patch: Partial<UserThemeBackgroundChoice>): void => {
    if (choice) {
      saveChoice({ ...choice, ...patch })
    }
  }

  const title = translate('settings.themeBackground.title', 'Background image')
  const hidden = surfaceOpacity >= 1 || reduceEffects
  const description = hidden
    ? translate(
        'settings.themeBackground.hidden',
        'Shows behind terminals and chats once Terminal → Background Opacity is below 1 and Reduce Visual Effects is off.'
      )
    : translate(
        'settings.themeBackground.description',
        'An image from your disk behind terminals and chats, in place of the theme’s own.'
      )

  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={['background', 'image', 'wallpaper', 'picture', 'theme']}
      forceVisible={forceVisible}
    >
      <SettingsRow label={title} description={description} alignTop control={null} />
      <div className="flex flex-wrap items-center gap-2.5 pb-3">
        <button
          type="button"
          aria-pressed={!choice}
          onClick={() => saveChoice(null)}
          className={cn(
            'flex h-14 w-24 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            !choice ? 'border-primary ring-2 ring-primary/60' : 'border-border hover:border-ring'
          )}
        >
          <ImageOff className="size-4" />
          {translate('settings.themeBackground.none', 'Theme’s own')}
        </button>
        {names.map((name) => (
          <Thumbnail
            key={name}
            name={name}
            selected={choice?.name === name}
            onSelect={() => select(name)}
            onRemove={() => void remove(name)}
          />
        ))}
        <button
          type="button"
          onClick={() => void add()}
          className="flex h-14 w-24 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-border text-[11px] text-muted-foreground outline-none hover:border-ring hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ImagePlus className="size-4" />
          {translate('settings.themeBackground.add', 'Add image…')}
        </button>
      </div>
      {choice ? (
        <div className="space-y-1 pb-3">
          <SettingsRow
            label={translate('settings.themeBackground.strength', 'Strength')}
            control={
              <div className="flex w-56 items-center gap-3">
                <Slider
                  value={[choice.opacity]}
                  min={0.05}
                  max={1}
                  step={0.05}
                  thumbLabels={[translate('settings.themeBackground.strength', 'Strength')]}
                  onValueChange={([value]) => update({ opacity: value ?? DEFAULT_STRENGTH })}
                />
                <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                  {Math.round(choice.opacity * 100)}%
                </span>
              </div>
            }
          />
          <SettingsRow
            label={translate('settings.themeBackground.fit', 'Fit')}
            control={
              <SettingsSegmentedControl<UserThemeBackgroundSize>
                size="sm"
                value={choice.size}
                onChange={(size) => update({ size })}
                options={[
                  { value: 'cover', label: translate('settings.themeBackground.cover', 'Fill') },
                  { value: 'contain', label: translate('settings.themeBackground.contain', 'Fit') },
                  { value: 'tile', label: translate('settings.themeBackground.tile', 'Tile') }
                ]}
              />
            }
          />
          <SettingsRow
            label={translate('settings.themeBackground.position', 'Anchor')}
            control={
              <SettingsSegmentedControl<UserThemeBackgroundPosition>
                size="sm"
                value={choice.position}
                onChange={(position) => update({ position })}
                options={(['center', 'top', 'bottom', 'left', 'right'] as const).map((value) => ({
                  value,
                  label: translate(
                    `settings.themeBackground.at.${value}`,
                    value[0]!.toUpperCase() + value.slice(1)
                  )
                }))}
              />
            }
          />
        </div>
      ) : null}
    </SearchableSetting>
  )
}
