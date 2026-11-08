import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: {}, dialog: {} }))

import {
  listUserThemeBackgrounds,
  readUserThemeBackground,
  removeUserThemeBackground,
  storeUserThemeBackground
} from './user-theme-backgrounds'
import { readUserThemeBackgroundChoice } from '../../shared/theme-background/user-theme-background'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 9])

describe('user theme backgrounds', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'theme-bg-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('stores an image under its hash, lists, reads and removes it', async () => {
    const stored = await storeUserThemeBackground(dir, PNG)
    expect(stored).toEqual({ name: expect.stringMatching(/^[0-9a-f]{16}\.png$/) })
    const name = (stored as { name: string }).name
    expect(await listUserThemeBackgrounds(dir)).toEqual([name])
    const image = await readUserThemeBackground(dir, name)
    expect(image?.kind).toBe('png')
    expect([...(image?.bytes ?? [])]).toEqual([...PNG])
    await removeUserThemeBackground(dir, name)
    expect(await listUserThemeBackgrounds(dir)).toEqual([])
  })

  it('tells the kind from the bytes, refusing anything that is not an image', async () => {
    expect(await storeUserThemeBackground(dir, WEBP)).toEqual({
      name: expect.stringMatching(/\.webp$/)
    })
    expect(await storeUserThemeBackground(dir, new TextEncoder().encode('<svg/>'))).toEqual({
      error: 'not-an-image'
    })
  })

  it('never reads or removes a name outside the stored pattern', async () => {
    await writeFile(join(dir, 'secret.txt'), 'x')
    expect(await readUserThemeBackground(dir, '../secret.txt')).toBeNull()
    expect(await readUserThemeBackground(dir, 'secret.txt')).toBeNull()
    await removeUserThemeBackground(dir, 'secret.txt')
    expect(await listUserThemeBackgrounds(dir)).toEqual([])
  })

  it('reads a saved choice with defaults, and drops one with a bad name', () => {
    expect(
      readUserThemeBackgroundChoice({ themeBackground: { name: '0123456789abcdef.jpg' } })
    ).toEqual({ name: '0123456789abcdef.jpg', opacity: 0.6, size: 'cover', position: 'center' })
    expect(readUserThemeBackgroundChoice({ themeBackground: { name: '/etc/passwd' } })).toBeNull()
    expect(readUserThemeBackgroundChoice(undefined)).toBeNull()
  })
})
