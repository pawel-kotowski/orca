import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'
import type { AgentShowWindowRequestMessage } from '../../shared/agent-show/agent-show-window-relay'

export const agentShowApi = {
  onRequest: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: AgentShowWindowRequestMessage) =>
      callback(data)
    ipcRenderer.on('agentShow:request', listener)
    return () => ipcRenderer.removeListener('agentShow:request', listener)
  },
  reply: (reply) => ipcRenderer.send('agentShow:reply', reply)
} satisfies PreloadApi['agentShow']
