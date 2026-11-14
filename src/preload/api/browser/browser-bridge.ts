import { browserGuestRegistrationAndDownloadsApi } from './browser-bridge-guest-registration-and-downloads'
import { browserPageInteractionAndSessionsApi } from './browser-bridge-page-interaction-and-sessions'
import { browserExtensionsApi } from './browser-bridge-extensions'
import { browserExtensionToolbarApi } from './browser-bridge-extension-toolbar'
import { browserExtensionWebStoreApi } from './browser-bridge-extension-webstore'
import { browserExtensionContextMenuApi } from './browser-bridge-extension-context-menu'
import { browserRemoteHostControlApi } from './browser-bridge-remote-host-control'
import { browserAgentShowMarksApi } from './browser-bridge-agent-show-marks'
import type { PreloadApi } from '../../api-types'

export const browserApi = {
  ...browserGuestRegistrationAndDownloadsApi,
  ...browserPageInteractionAndSessionsApi,
  ...browserExtensionsApi,
  ...browserExtensionToolbarApi,
  ...browserExtensionWebStoreApi,
  ...browserExtensionContextMenuApi,
  ...browserRemoteHostControlApi,
  ...browserAgentShowMarksApi
} satisfies PreloadApi['browser']
