import { ipcRenderer } from 'electron'
import {
  AGENT_SHOW_PAGE_CLEAR_CHANNEL,
  AGENT_SHOW_PAGE_EVENT_CHANNEL,
  AGENT_SHOW_PAGE_MARK_CHANNEL,
  type AgentShowPageEvent
} from '../../../shared/agent-show/agent-show-page-marks'
import type { BrowserAgentShowMarksApi } from './browser-agent-show-marks-api'

export const browserAgentShowMarksApi = {
  agentShowMarkPage: (args) => ipcRenderer.invoke(AGENT_SHOW_PAGE_MARK_CHANNEL, args),
  agentShowClearPageMarks: (args) => ipcRenderer.invoke(AGENT_SHOW_PAGE_CLEAR_CHANNEL, args),
  onAgentShowPageEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: AgentShowPageEvent): void =>
      callback(data)
    ipcRenderer.on(AGENT_SHOW_PAGE_EVENT_CHANNEL, listener)
    return () => ipcRenderer.removeListener(AGENT_SHOW_PAGE_EVENT_CHANNEL, listener)
  }
} satisfies Required<BrowserAgentShowMarksApi>
