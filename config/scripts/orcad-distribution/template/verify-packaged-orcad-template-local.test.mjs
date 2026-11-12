import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ORCAD_TEMPLATE_MANIFEST_FILENAME,
  ORCAD_TEMPLATE_TARGETS_DIR
} from '../../../../src/shared/orcad-artifacts.ts'
import { writeOrcadTemplateTestFixture } from './orcad-template-test-fixture.mjs'

const require = createRequire(import.meta.url)
const { verifyPackagedOrcadTemplate } = require('./verify-packaged-orcad-template.cjs')
const roots = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('verifyPackagedOrcadTemplate on a single-host local build', () => {
  it('checks only the targets ORCA_ORCAD_TEMPLATE_TARGETS names', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-packaged-orcad-template-'))
    roots.push(root)
    const templateDir = await writeOrcadTemplateTestFixture(root)
    const kept = ['linux-x64-glibc', 'linux-x64-musl']
    const manifestPath = join(templateDir, ORCAD_TEMPLATE_MANIFEST_FILENAME)
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    for (const target of Object.keys(manifest.targets).filter((name) => !kept.includes(name))) {
      delete manifest.targets[target]
      await rm(join(templateDir, ORCAD_TEMPLATE_TARGETS_DIR, target), { recursive: true })
    }
    await writeFile(manifestPath, JSON.stringify(manifest))

    const previous = process.env.ORCA_ORCAD_TEMPLATE_TARGETS
    try {
      delete process.env.ORCA_ORCAD_TEMPLATE_TARGETS
      expect(() => verifyPackagedOrcadTemplate(root)).toThrow('target manifest inventory mismatch')
      process.env.ORCA_ORCAD_TEMPLATE_TARGETS = kept.join(',')
      expect(() => verifyPackagedOrcadTemplate(root)).not.toThrow()
      process.env.ORCA_ORCAD_TEMPLATE_TARGETS = 'linux-x64-glibc,plan9-x64'
      expect(() => verifyPackagedOrcadTemplate(root)).toThrow('plan9-x64')
    } finally {
      if (previous === undefined) {
        delete process.env.ORCA_ORCAD_TEMPLATE_TARGETS
      } else {
        process.env.ORCA_ORCAD_TEMPLATE_TARGETS = previous
      }
    }
  })
})
