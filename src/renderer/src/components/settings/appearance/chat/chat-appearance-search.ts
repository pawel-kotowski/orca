import { translate } from '@/i18n/i18n'
import type { Translate } from '@/i18n/use-translate'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translateSearchKeyword } from '../../search/settings-search-keywords'
import type { SettingsSearchEntry } from '../../search/settings-search'
import { formatPrimaryShortcutLabel } from '@/hooks/useShortcutLabel'

export function chatTerminalControlledHint(t: Translate = translate): string {
  return t('settings.appearance.chat.terminalControlledHint', 'Set by terminal interface.')
}

export function chatTerminalControlledTooltip(t: Translate = translate): string {
  return t(
    'settings.appearance.chat.terminalControlledTooltip',
    'Matching your terminal interface. Turn off Match terminal interface to change this.'
  )
}

export const getChatContrastEntriesByKey = createLocalizedCatalog(
  () =>
    ({
      matchTerminalInterface: {
        title: translate(
          'settings.appearance.chat.matchTerminalInterface',
          'Match terminal interface'
        ),
        description: translate(
          'settings.appearance.chat.matchTerminalInterfaceDescription',
          "Use your terminal interface's font and colors for the whole chat. Stays in sync if you change your terminal theme later."
        ),
        targetSectionId: 'chat-match-terminal-interface'
      },
      contrast: {
        title: translate('settings.appearance.chat.contrast', 'Contrast'),
        description: translate(
          'settings.appearance.chat.contrastDescription',
          'How bright chat text is against the background. The right end matches the older, brighter look.'
        ),
        targetSectionId: 'chat-contrast'
      },
      imageOverlayOpacity: {
        title: translate(
          'settings.appearance.chat.imageOverlayOpacity',
          'Chat over a background image'
        ),
        description: translate(
          'settings.appearance.chat.imageOverlayOpacityDescription',
          "How solid the chat is over your theme's background image. Lower shows more of the image behind messages."
        ),
        keywords: [
          ...translateSearchKeyword(
            'settings.appearance.chat.imageOverlayKeywordTransparency',
            'transparency'
          ),
          ...translateSearchKeyword(
            'settings.appearance.chat.imageOverlayKeywordOpacity',
            'opacity'
          ),
          ...translateSearchKeyword(
            'settings.appearance.chat.imageOverlayKeywordWallpaper',
            'wallpaper'
          )
        ],
        targetSectionId: 'chat-image-overlay-opacity'
      }
    }) satisfies Record<string, SettingsSearchEntry>
)

export function getChatContrastSearchEntries(): SettingsSearchEntry[] {
  return Object.values(getChatContrastEntriesByKey())
}

const getChatAppearanceCatalog = createLocalizedCatalog(
  () =>
    ({
      fontFamily: {
        targetSectionId: 'chat-font-family',
        title: translate('settings.appearance.chat.fontFamily', 'Font family'),
        description: translate(
          'settings.appearance.chat.fontFamilyDescription',
          'Font used for messages, activity, and the message box.'
        ),
        keywords: [
          ...translateSearchKeyword('settings.appearance.chat.title', 'Chat UI'),
          ...translateSearchKeyword('settings.appearance.chat.fontFamily', 'Font family'),
          ...translateSearchKeyword('settings.appearance.chat.fontKeywordTypeface', 'typeface'),
          ...translateSearchKeyword('settings.appearance.chat.fontKeywordTypography', 'typography')
        ]
      },
      textSize: {
        targetSectionId: 'chat-text-size',
        title: translate('settings.appearance.chat.textSize', 'Text size'),
        keywords: [translate('settings.appearance.chat.title', 'Chat UI')]
      },
      codeTextSize: {
        targetSectionId: 'chat-code-text-size',
        title: translate('settings.appearance.chat.codeTextSize', 'Code text size'),
        description: translate(
          'settings.appearance.chat.codeTextSizeDescription',
          'Code blocks, inline code, commands and tool output.'
        ),
        keywords: [translate('settings.appearance.chat.title', 'Chat UI')]
      },
      width: {
        targetSectionId: 'chat-width',
        title: translate('settings.appearance.chat.width', 'Width'),
        description: translate(
          'settings.appearance.chat.widthDescription',
          'How wide messages and the message box can grow in a wide pane.'
        ),
        keywords: [
          translate('settings.appearance.chat.title', 'Chat UI'),
          ...getChatWidthOptions().map((option) => option.label)
        ]
      },
      textColorLight: {
        targetSectionId: 'chat-text-color-light',
        title: translate('settings.appearance.chat.textColorLight', 'Text color (light theme)'),
        description: translate(
          'settings.appearance.chat.textColorLightDescription',
          'Messages, their markdown and code, and the message box in the light theme. Leave empty for the theme color.'
        ),
        keywords: [
          translate('settings.appearance.chat.title', 'Chat'),
          translate('settings.appearance.chat.fontColorKeyword', 'font color')
        ]
      },
      textColorDark: {
        targetSectionId: 'chat-text-color-dark',
        title: translate('settings.appearance.chat.textColorDark', 'Text color (dark theme)'),
        description: translate(
          'settings.appearance.chat.textColorDarkDescription',
          'Messages, their markdown and code, and the message box in the dark theme. Leave empty for the theme color.'
        ),
        keywords: [
          translate('settings.appearance.chat.title', 'Chat'),
          translate('settings.appearance.chat.fontColorKeyword', 'font color')
        ]
      },
      userBubbleColorLight: {
        targetSectionId: 'chat-user-bubble-color-light',
        title: translate(
          'settings.appearance.chat.userBubbleColorLight',
          'Your message bubble (light theme)'
        ),
        description: translate(
          'settings.appearance.chat.userBubbleColorLightDescription',
          'Background of your messages in the light theme. Leave empty for the theme color.'
        ),
        keywords: [
          translate('settings.appearance.chat.title', 'Chat'),
          translate('settings.appearance.chat.bubbleKeyword', 'bubble')
        ]
      },
      userBubbleColorDark: {
        targetSectionId: 'chat-user-bubble-color-dark',
        title: translate(
          'settings.appearance.chat.userBubbleColorDark',
          'Your message bubble (dark theme)'
        ),
        description: translate(
          'settings.appearance.chat.userBubbleColorDarkDescription',
          'Background of your messages in the dark theme. Leave empty for the theme color.'
        ),
        keywords: [
          translate('settings.appearance.chat.title', 'Chat'),
          translate('settings.appearance.chat.bubbleKeyword', 'bubble')
        ]
      },
      reset: {
        targetSectionId: 'chat-reset',
        title: translate('settings.appearance.chat.resetAppearance', 'Reset chat appearance'),
        description: translate(
          'settings.appearance.chat.resetDescription',
          'Restore the defaults above.'
        )
      }
    }) satisfies Record<string, SettingsSearchEntry>
)

export function getChatAppearanceEntriesByKey(
  shortcuts?: { increase: string; decrease: string },
  t: Translate = translate
) {
  const entries = getChatAppearanceCatalog()
  return {
    ...entries,
    textSize: {
      ...entries.textSize,
      description: t(
        'settings.appearance.chat.textSizeDescription',
        'Messages, tool activity and the message box. {{increase}} / {{decrease}} in a chat change this too.',
        {
          increase: shortcuts?.increase ?? formatPrimaryShortcutLabel('zoom.in'),
          decrease: shortcuts?.decrease ?? formatPrimaryShortcutLabel('zoom.out')
        }
      )
    }
  }
}

export function getChatAppearanceSearchEntries(t: Translate = translate): SettingsSearchEntry[] {
  return [
    { title: t('auto.components.settings.Settings.2b4474780a', 'Appearance') },
    ...Object.values(getChatAppearanceEntriesByKey(undefined, t)),
    ...getChatContrastSearchEntries()
  ]
}

export function getChatWidthOptions(t: Translate = translate) {
  return [
    {
      value: 'comfortable',
      label: t('settings.appearance.chat.comfortable', 'Comfortable')
    },
    { value: 'wide', label: t('settings.appearance.chat.wide', 'Wide') },
    { value: 'full', label: t('settings.appearance.chat.full', 'Full') }
  ] as const
}
