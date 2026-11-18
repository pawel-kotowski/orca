import { tmpdir } from 'node:os'
import { ipcMain, type BrowserWindow, type NativeImage } from 'electron'
import type { AgentShowTourSnapshot } from '../../shared/agent-show/agent-show-tour-library'
import { writeTourSnapshotFile } from '../agent-show/tours/tour-snapshot-file'
import {
  AGENT_SHOW_RELAY_SHOT_BASE64_BUDGET,
  type AgentShowRelayShot
} from '../../shared/agent-show/agent-show-client-relay'
import type { AgentShowResult } from '../../shared/agent-show/agent-show-contract'
import type {
  AgentShowWindowReply,
  AgentShowWindowRequest
} from '../../shared/agent-show/agent-show-window-relay'
import { withPaintingWhileHidden } from '../plugins/view/plugin-view-capture'
import { requestRendererReply } from './renderer-relays/renderer-reply-request'

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

async function captureWindowImage(mainWindow: BrowserWindow): Promise<NativeImage> {
  if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    throw new Error('renderer_unavailable')
  }
  const contents = mainWindow.webContents
  return withPaintingWhileHidden([contents], () =>
    contents.capturePage(undefined, { stayHidden: true })
  )
}

export async function captureAgentShowWindowPng(
  mainWindow: BrowserWindow
): Promise<{ png: Buffer; width: number; height: number }> {
  const image = await captureWindowImage(mainWindow)
  const { width, height } = image.getSize()
  return { png: image.toPNG(), width, height }
}

const base64Length = (bytes: number): number => Math.ceil(bytes / 3) * 4

/** The PNG when it fits one relay frame, else a smaller JPEG that does. */
export function fitRelayShot(image: NativeImage): AgentShowRelayShot {
  const png = image.toPNG()
  const size = image.getSize()
  if (base64Length(png.length) <= AGENT_SHOW_RELAY_SHOT_BASE64_BUDGET) {
    return { mime: 'image/png', base64: png.toString('base64'), ...size }
  }
  for (const width of [Math.min(size.width, 2000), 1600, 1280, 960]) {
    const scaled = width < size.width ? image.resize({ width, quality: 'good' }) : image
    for (const quality of [85, 70, 55]) {
      const jpeg = scaled.toJPEG(quality)
      if (base64Length(jpeg.length) <= AGENT_SHOW_RELAY_SHOT_BASE64_BUDGET) {
        return { mime: 'image/jpeg', base64: jpeg.toString('base64'), ...scaled.getSize() }
      }
    }
  }
  throw new Error('agent_show_snap_too_large')
}

/** The renderer answers a windowless server's `orca show snap` with its own window's capture. */
let captureHandlerOwner: BrowserWindow | null = null

export function registerAgentShowCaptureHandler(mainWindow: BrowserWindow): void {
  const contents = mainWindow.webContents
  captureHandlerOwner = mainWindow
  ipcMain.removeHandler('agentShow:captureWindow')
  ipcMain.removeHandler('agentShow:writeTourSnapshot')
  // Why here: a tour's "as it was" copy is read on the worktree's host (maybe a box) and opened
  // from this computer's temp folder, so the editor reads it as a local read-only file.
  ipcMain.handle('agentShow:writeTourSnapshot', async (event, snapshot: AgentShowTourSnapshot) => {
    if (event.sender !== contents) {
      throw new Error('renderer_unavailable')
    }
    return writeTourSnapshotFile(tmpdir(), snapshot)
  })
  ipcMain.handle('agentShow:captureWindow', async (event) => {
    if (event.sender !== contents) {
      throw new Error('renderer_unavailable')
    }
    return fitRelayShot(await captureWindowImage(mainWindow))
  })
  mainWindow.on('closed', () => {
    // A replacement window registered its own handler; a late close must leave it.
    if (captureHandlerOwner !== mainWindow) {
      return
    }
    captureHandlerOwner = null
    ipcMain.removeHandler('agentShow:captureWindow')
    ipcMain.removeHandler('agentShow:writeTourSnapshot')
  })
}
