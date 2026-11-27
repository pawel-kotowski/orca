// Local (glass build): how solid every tab is over a theme background image (Paweł, 2026-11-27:
// "i should see transparent background in git graph, same as in chats", then "this should work for
// any part of orca really, like files, md, code, etc"). Chats read the Settings slider Chat over a
// background image from their own style; the other tabs (files, Markdown, code, diffs, Git Graph)
// read the same number from the root, so one slider sets them all (main.css, "Every tab shows the
// theme image").
import { useEffect } from 'react'
import { resolveNativeChatAppearanceSettings } from '../../../../shared/native-chat/settings/native-chat-appearance-settings'
import { useAppStore } from '../../store/index'

export const TAB_IMAGE_OVERLAY_TOKEN = '--orca-tab-image-overlay-opacity'

export function useTabImageOverlayOpacity(): void {
  const percent = useAppStore(
    (state) =>
      resolveNativeChatAppearanceSettings(state.settings?.nativeChatAppearance).imageOverlayOpacity
  )
  useEffect(() => {
    document.documentElement.style.setProperty(TAB_IMAGE_OVERLAY_TOKEN, String(percent / 100))
  }, [percent])
}
