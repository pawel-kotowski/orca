import { describe, expect, it, vi } from 'vitest'
import { loadNodeOniguruma } from './oniguruma-test-harness'
import {
  applyTerminalSyntaxThemes,
  loadedSyntaxHighlighter,
  loadSyntaxLanguage
} from './syntax-highlighter'
import { selectedSyntaxThemes, syntaxThemeGeneration } from './syntax-terminal-themes'
import { terminalSyntaxThemeNames } from '../../components/native-chat/markdown/code/use-native-chat-terminal-syntax-themes'

vi.mock('./oniguruma', () => ({ loadOniguruma: () => loadNodeOniguruma() }))

// Paweł, 2026-11-15: the chat's code in Gruvbox Dark's colours when the terminal theme is Gruvbox Dark.
describe('terminal syntax themes', () => {
  it('colours code in Gruvbox Dark under the Gruvbox Dark terminal theme, Dark+ otherwise', async () => {
    await expect(loadSyntaxLanguage('typescript')).resolves.toBe('ready')
    const highlight = loadedSyntaxHighlighter('typescript')!
    const keyword = () =>
      highlight('const x = 1')
        .lines.flat()
        .find((token) => token.content.trim() === 'const')
    const darkPlus = keyword()?.dark

    const before = syntaxThemeGeneration()
    await applyTerminalSyntaxThemes({ light: null, dark: 'Gruvbox Dark' })
    expect(selectedSyntaxThemes()).toEqual({ light: 'light-plus', dark: 'gruvbox-dark-medium' })
    expect(syntaxThemeGeneration()).toBe(before + 1)
    const gruvbox = keyword()?.dark
    expect(gruvbox).toBeDefined()
    expect(gruvbox?.toLowerCase()).not.toBe(darkPlus?.toLowerCase())
    // Gruvbox's orange, which its theme gives `const` (storage.type).
    expect(gruvbox?.toLowerCase()).toBe('#fe8019')

    await applyTerminalSyntaxThemes({ light: null, dark: 'Some Unknown Theme' })
    expect(selectedSyntaxThemes()).toEqual({ light: 'light-plus', dark: 'dark-plus' })
    expect(keyword()?.dark).toBe(darkPlus)
  })

  it('follows the terminal themes only while the chat takes colour', () => {
    const settings = {
      terminalThemeDark: 'Gruvbox Dark',
      terminalThemeLight: 'Builtin Tango Light',
      terminalUseSeparateLightTheme: true
    }
    expect(terminalSyntaxThemeNames({ ...settings, nativeChatAppearance: {} })).toEqual({
      light: 'Builtin Tango Light',
      dark: 'Gruvbox Dark'
    })
    expect(
      terminalSyntaxThemeNames({
        ...settings,
        terminalUseSeparateLightTheme: false,
        nativeChatAppearance: {}
      })
    ).toEqual({ light: 'Gruvbox Dark', dark: 'Gruvbox Dark' })
    expect(
      terminalSyntaxThemeNames({ ...settings, nativeChatAppearance: { chatColors: false } })
    ).toEqual({ light: null, dark: null })
  })
})
