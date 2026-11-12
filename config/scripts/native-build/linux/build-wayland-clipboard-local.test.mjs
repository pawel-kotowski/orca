import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildWaylandClipboard, dockerIsRootless } from './build-wayland-clipboard.mjs'
import glibcVerification from './verify-linux-glibc-floor.cjs'

let root

function writeExecutable(arch) {
  const binary = join(root, 'native', 'wayland-clipboard', '.build', arch, 'orca-wayland-clipboard')
  mkdirSync(dirname(binary), { recursive: true })
  const header = Buffer.alloc(64)
  header.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1])
  header.writeUInt16LE(glibcVerification.ELF_MACHINE_BY_ARCH[arch], 18)
  writeFileSync(binary, header)
  chmodSync(binary, 0o755)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'orca-wayland-build-'))
  for (const file of [
    'native/wayland-clipboard/wayland-clipboard.c',
    'native/wayland-clipboard/x11-clipboard-publisher.c',
    'native/wayland-clipboard/x11-clipboard-publisher.h',
    'native/wayland-clipboard/protocol_test.py',
    'native/wayland-clipboard/x11_test.py',
    'native/wayland-clipboard/Dockerfile',
    'config/scripts/native-build/linux/build-wayland-clipboard.mjs'
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), file)
  }
  vi.spyOn(glibcVerification, 'verifyLinuxGlibcFloor').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

describe('Wayland clipboard build under rootless Docker', () => {
  it('runs the compile as container root, which rootless Docker maps to the invoking user', () => {
    const run = vi.fn((_program, args) => {
      if (args[0] === 'run') {
        writeExecutable('x64')
      }
      return { status: 0 }
    })
    buildWaylandClipboard({ root, arch: 'x64', run, rootless: true })
    const args = run.mock.calls[1][1]
    expect(args[args.indexOf('--user') + 1]).toBe('0:0')
  })

  it('detects rootless Docker from its security options', () => {
    const reply = (stdout) => vi.fn(() => ({ status: 0, stdout }))
    expect(dockerIsRootless(reply('["name=seccomp,profile=builtin","name=rootless"]'))).toBe(true)
    expect(dockerIsRootless(reply('["name=seccomp,profile=builtin"]'))).toBe(false)
    expect(dockerIsRootless(vi.fn(() => ({ status: 1, stdout: '' })))).toBe(false)
  })
})
