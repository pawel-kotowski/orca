import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildProviderExec } from './build-provider-exec.mjs'
import glibcVerification from '../linux/verify-linux-glibc-floor.cjs'

let root

function writeExecutable() {
  const binary = join(root, 'native', 'provider-exec', '.build', 'linux-x64', 'orca-provider-exec')
  mkdirSync(dirname(binary), { recursive: true })
  const header = Buffer.alloc(64)
  header.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1])
  header.writeUInt16LE(glibcVerification.ELF_MACHINE_BY_ARCH.x64, 18)
  writeFileSync(binary, header)
  chmodSync(binary, 0o755)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'orca-provider-exec-build-'))
  for (const file of [
    'native/provider-exec/provider-exec.c',
    'native/wayland-clipboard/Dockerfile',
    'config/scripts/native-build/posix/build-provider-exec.mjs'
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

describe('provider exec helper build under rootless Docker', () => {
  const dockerRun = () =>
    vi.fn((_program, args) => {
      if (args[0] === 'run') {
        writeExecutable()
      }
      return { status: 0 }
    })
  const userOf = (run) => {
    const args = run.mock.calls.find((call) => call[1][0] === 'run')[1]
    return args[args.indexOf('--user') + 1]
  }

  it('runs the compile as container root, which rootless Docker maps to the invoking user', () => {
    const run = dockerRun()
    buildProviderExec({ root, target: 'linux-x64', run, rootless: true })
    expect(userOf(run)).toBe('0:0')
  })

  it('keeps the invoking uid under rootful Docker', () => {
    const run = dockerRun()
    buildProviderExec({ root, target: 'linux-x64', run, rootless: false })
    expect(userOf(run)).toBe(`${process.getuid()}:${process.getgid()}`)
  })
})
