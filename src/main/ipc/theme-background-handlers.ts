import { app, ipcMain } from 'electron'
import {
  listUserThemeBackgrounds,
  pickUserThemeBackground,
  readUserThemeBackground,
  removeUserThemeBackground,
  userThemeBackgroundDir
} from '../theme-background/user-theme-backgrounds'

/** Settings → Appearance → Background image: pick, list, read and remove the picked images. */
export function registerThemeBackgroundHandlers(): void {
  const dir = (): string => userThemeBackgroundDir(app.getPath('userData'))
  ipcMain.handle('settings:pickThemeBackground', (event) =>
    pickUserThemeBackground(dir(), event.sender)
  )
  ipcMain.handle('settings:listThemeBackgrounds', () => listUserThemeBackgrounds(dir()))
  ipcMain.handle('settings:readThemeBackground', (_event, name: unknown) =>
    readUserThemeBackground(dir(), name)
  )
  ipcMain.handle('settings:removeThemeBackground', (_event, name: unknown) =>
    removeUserThemeBackground(dir(), name)
  )
}
