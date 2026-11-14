import type { BrowserWindow } from 'electron'
import type { AgentShowResult } from '../../shared/agent-show/agent-show-contract'
import type {
  AgentShowWindowReply,
  AgentShowWindowRequest
} from '../../shared/agent-show/agent-show-window-relay'
import { withPaintingWhileHidden } from '../plugins/view/plugin-view-capture'
import { requestRendererReply } from './renderer-reply-request'

// Why 20s: showing code may wait for an editor to mount and lay out before it reports visibility.
const AGENT_SHOW_TIMEOUT_MS = 20_000

export async function requestAgentShowFromRenderer(
  mainWindow: BrowserWindow,
  request: AgentShowWindowRequest
): Promise<AgentShowResult> {
  const reply = await requestRendererReply<AgentShowWindowReply>(mainWindow, {
    requestChannel: 'agentShow:request',
    replyChannel: 'agentShow:reply',
    payload: request,
    timeoutMs: AGENT_SHOW_TIMEOUT_MS,
    timeoutError: 'agent_show_timeout'
  })
  return reply.result
}

export async function captureAgentShowWindowPng(
  mainWindow: BrowserWindow
): Promise<{ png: Buffer; width: number; height: number }> {
  if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    throw new Error('renderer_unavailable')
  }
  const contents = mainWindow.webContents
  const image = await withPaintingWhileHidden([contents], () =>
    contents.capturePage(undefined, { stayHidden: true })
  )
  const { width, height } = image.getSize()
  return { png: image.toPNG(), width, height }
}
