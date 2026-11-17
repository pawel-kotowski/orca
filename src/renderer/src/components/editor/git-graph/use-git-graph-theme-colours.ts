// Local (glass build): the Git Graph's branch colours from the terminal theme's own palette, the way
// the chat takes its colours (native-chat-appearance-style.ts), so a Gruvbox user gets Gruvbox's
// blue, green, yellow, red, aqua and purple and every other theme its own (Paweł, 2026-11-17:
// "branch colors also should match grvbox more"). main.css keeps fixed colours for a theme that
// has no palette. main is the palette's blue, development its green, the current branch the text
// colour; other branches cycle through the rest, plus an orange mixed from its red and yellow.
import { useMemo } from 'react'
import type React from 'react'
import { useAppStore } from '@/store'
import { useSystemPrefersDark } from '@/hooks/theme/use-system-prefers-dark'
import { resolveTerminalPalette } from '../../../../../shared/terminal-themes/terminal-theme-selection'
import { isTerminalBackgroundLight } from '../../../../../shared/terminal-themes/terminal-title-contrast'

type Hue = 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan'

export function useGitGraphThemeColours(): React.CSSProperties | undefined {
  const settings = useAppStore((s) => s.settings)
  const systemPrefersDark = useSystemPrefersDark()
  return useMemo(() => {
    const theme = resolveTerminalPalette(
      {
        theme: settings?.theme ?? 'dark',
        terminalThemeDark: settings?.terminalThemeDark ?? '',
        terminalThemeLight: settings?.terminalThemeLight ?? '',
        terminalUseSeparateLightTheme: settings?.terminalUseSeparateLightTheme ?? false,
        terminalCustomThemes: settings?.terminalCustomThemes,
        terminalPluginPalettes: settings?.terminalPluginPalettes,
        pluginSystemEnabled: settings?.pluginSystemEnabled,
        disabledPlugins: settings?.disabledPlugins,
        terminalColorOverrides: settings?.terminalColorOverrides,
        terminalColorOverridesLight: settings?.terminalColorOverridesLight
      },
      systemPrefersDark
    ).theme
    if (!theme) {
      return undefined
    }
    const dark = theme.background ? !isTerminalBackgroundLight(theme.background) : true
    // On a dark background the bright variants read better; a light theme's plain ones are its
    // darker, readable set. `plain` is the other set, for more distinct palette entries.
    const pick = (hue: Hue, plain = false): string | undefined => {
      const brightKey = `bright${hue[0]!.toUpperCase()}${hue.slice(1)}` as const
      const bright = theme[brightKey] as string | undefined
      const normal = theme[hue] as string | undefined
      return dark !== plain ? (bright ?? normal) : (normal ?? bright)
    }
    const red = pick('red')
    const yellow = pick('yellow')
    const colours: Record<string, string | undefined> = {
      '--git-graph-branch-pin-1': pick('blue'),
      '--git-graph-branch-pin-2': pick('green'),
      '--git-graph-branch-pin-3': pick('magenta'),
      '--git-graph-branch-1': yellow,
      '--git-graph-branch-2': red,
      '--git-graph-branch-3': pick('cyan'),
      '--git-graph-branch-4': pick('magenta'),
      '--git-graph-branch-5':
        red && yellow ? `color-mix(in oklab, ${red} 50%, ${yellow})` : undefined,
      '--git-graph-branch-6': pick('yellow', true),
      '--git-graph-branch-7': pick('cyan', true)
    }
    const style: Record<string, string> = {}
    for (const [key, value] of Object.entries(colours)) {
      if (value) {
        style[key] = value
      }
    }
    return style as React.CSSProperties
  }, [settings, systemPrefersDark])
}
