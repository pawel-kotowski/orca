import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import type { PluginThemeBackground } from '../../../shared/plugins/artifacts/plugin-theme-background'
import {
  USER_THEME_BACKGROUND_MIME,
  readUserThemeBackgroundChoice,
  type UserThemeBackgroundChoice
} from '../../../shared/theme-background/user-theme-background'

// Why blob URLs: the image bytes cross IPC once and the page paints them from memory; no file:
// path or protocol handler is opened to the renderer.
const urls = new Map<string, Promise<string | null>>()

/** An object URL for one stored image, read once and shared by the window and the gallery. */
export function userThemeBackgroundUrl(name: string): Promise<string | null> {
  let url = urls.get(name)
  if (!url) {
    url = window.api.settings
      .readThemeBackground(name)
      .then((image) =>
        image
          ? URL.createObjectURL(
              new Blob([image.bytes as Uint8Array<ArrayBuffer>], {
                type: USER_THEME_BACKGROUND_MIME[image.kind]
              })
            )
          : null
      )
      .catch(() => null)
    urls.set(name, url)
  }
  return url
}

export function forgetUserThemeBackgroundUrl(name: string): void {
  const url = urls.get(name)
  urls.delete(name)
  void url?.then((value) => value && URL.revokeObjectURL(value))
}

/** The saved choice (`nativeChatAppearance.themeBackground`), or null. */
export function useUserThemeBackgroundChoice(): UserThemeBackgroundChoice | null {
  // Why select the raw value: parsing in the selector would hand back a new object every render.
  const raw = useAppStore(
    (state) =>
      (state.settings?.nativeChatAppearance as { themeBackground?: unknown } | undefined)
        ?.themeBackground
  )
  return useMemo(() => readUserThemeBackgroundChoice({ themeBackground: raw }), [raw])
}

/** The picked image as a theme background, in place of the theme's own; null when none is picked. */
export function useUserThemeBackground(): PluginThemeBackground | null {
  const choice = useUserThemeBackgroundChoice()
  const name = choice?.name ?? null
  const [loaded, setLoaded] = useState<{ name: string; url: string | null } | null>(null)
  useEffect(() => {
    if (!name) {
      return
    }
    let live = true
    void userThemeBackgroundUrl(name).then((url) => {
      if (live) {
        setLoaded({ name, url })
      }
    })
    return () => {
      live = false
    }
  }, [name])
  return useMemo(() => {
    if (!choice || loaded?.name !== choice.name || !loaded.url) {
      return null
    }
    return {
      url: loaded.url,
      opacity: choice.opacity,
      size: choice.size,
      position: choice.position
    }
  }, [choice, loaded])
}
