import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ChatLaunchProfiles, keepChatLaunchProfile, lineageProfile } from './chat-launch-profiles'

const store = () => new ChatLaunchProfiles(join(mkdtempSync(join(tmpdir(), 'profiles-')), 'p.json'))

describe('chat launch profiles', () => {
  it('keeps the readable entries when one is broken', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'profiles-')), 'p.json')
    writeFileSync(
      file,
      JSON.stringify({
        sessions: { good: { claudeConfigDir: '/l/a' }, bad: { claudeConfigDir: 'relative' } }
      })
    )
    expect(new ChatLaunchProfiles(file).all()).toEqual({ good: { claudeConfigDir: '/l/a' } })
  })

  it('puts back what a refused create overwrote', () => {
    const profiles = store()
    profiles.set('s1', { claudeConfigDir: '/l/other-chat' })
    const undo = keepChatLaunchProfile(profiles, 's1', { claudeConfigDir: '/l/mine' })
    expect(profiles.get('s1')).toEqual({ claudeConfigDir: '/l/mine' })
    undo()
    expect(profiles.get('s1')).toEqual({ claudeConfigDir: '/l/other-chat' })
    const fresh = keepChatLaunchProfile(profiles, 's2', { claudeConfigDir: '/l/mine' })
    fresh()
    expect(profiles.get('s2')).toBeNull()
    expect(JSON.parse(readFileSync(profiles['filePath'], 'utf8')).sessions.s2).toBeUndefined()
  })

  it('a chat continued by /clear or forked keeps its lineage profile', () => {
    const profiles: Record<string, { claudeConfigDir: string }> = {
      root: { claudeConfigDir: '/l/a' }
    }
    const lineage = {
      clearedFrom: (id: string) => (id === 'after-clear' ? ['root'] : []),
      forkedFrom: (id: string) => (id === 'fork' ? 'after-clear' : null)
    }
    const get = (id: string) => profiles[id] ?? null
    expect(lineageProfile('after-clear', get, lineage)).toEqual({ claudeConfigDir: '/l/a' })
    expect(lineageProfile('fork', get, lineage)).toEqual({ claudeConfigDir: '/l/a' })
    expect(lineageProfile('unrelated', get, lineage)).toBeNull()
    profiles['fork'] = { claudeConfigDir: '/l/b' }
    expect(lineageProfile('fork', get, lineage)).toEqual({ claudeConfigDir: '/l/b' })
  })
})
