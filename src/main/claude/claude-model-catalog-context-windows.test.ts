import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  claudeConfigDirForTranscript,
  readClaudeModelContextWindows
} from './claude-model-catalog-context-windows'

// Trimmed from the catalog Claude Code 2.1.318 caches in `<home>/cache/model-catalog/`.
function catalog(fetchedAt: number, models: { id: string; tokens: number }[]): string {
  return JSON.stringify({
    version: 2,
    fetchedAt,
    catalog: {
      surface: 'cc',
      config: {
        id: 'cc',
        models: models.map(({ id, tokens }) => ({
          id,
          name: id,
          runtime: { max_input_tokens: tokens, max_output_tokens: 128_000 }
        }))
      }
    }
  })
}

let home: string | null = null

afterEach(async () => {
  if (home) {
    await rm(home, { recursive: true, force: true })
    home = null
  }
})

async function accountHome(files: Record<string, string>): Promise<string> {
  home = await mkdtemp(join(tmpdir(), 'claude-home-'))
  const folder = join(home, 'cache', 'model-catalog')
  await mkdir(folder, { recursive: true })
  for (const [name, text] of Object.entries(files)) {
    await writeFile(join(folder, name), text)
  }
  return home
}

describe('readClaudeModelContextWindows', () => {
  it('finds the account home two folders above the projects folder', () => {
    expect(
      claudeConfigDirForTranscript('/u/profiles/a/home/projects/-Users-me-repo/session-1.jsonl')
    ).toBe('/u/profiles/a/home')
    expect(claudeConfigDirForTranscript('/u/elsewhere/repo/session-1.jsonl')).toBeNull()
  })

  it("reads each model's window from the catalog, the newest fetch winning", async () => {
    const dir = await accountHome({
      'old-cc.json': catalog(100, [
        { id: 'claude-opus-5-5', tokens: 200_000 },
        { id: 'claude-haiku-4-5-20251001', tokens: 200_000 }
      ]),
      'new-cc.json': catalog(200, [{ id: 'claude-opus-5-5', tokens: 1_000_000 }]),
      'published-floor.json': JSON.stringify({ floor: '2.1.0' }),
      'broken.json': '{'
    })
    await expect(
      readClaudeModelContextWindows(join(dir, 'projects', '-repo', 'session-1.jsonl'))
    ).resolves.toEqual({ 'claude-opus-5-5': 1_000_000, 'claude-haiku-4-5-20251001': 200_000 })
  })

  it('knows no window when the home has no catalog', async () => {
    await expect(
      readClaudeModelContextWindows('/no/such/home/projects/-repo/session-1.jsonl')
    ).resolves.toEqual({})
  })
})
