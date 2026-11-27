import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ChatLaunchProfiles,
  keepChatLaunchProfile,
  lineageProfile,
  undoProfileIfCreateThrows
} from './chat-launch-profiles'

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

  it('puts back what the id held when the create throws before the chat exists', async () => {
    const profiles = store()
    profiles.set('s3', { claudeConfigDir: '/l/other-chat' })
    const undo = keepChatLaunchProfile(profiles, 's3', { claudeConfigDir: '/l/mine' })
    const failing = () => Promise.reject(new Error('lost'))
    await expect(undoProfileIfCreateThrows(failing, undo, () => false)).rejects.toThrow('lost')
    expect(profiles.get('s3')).toEqual({ claudeConfigDir: '/l/other-chat' })
    const kept = keepChatLaunchProfile(profiles, 's4', { claudeConfigDir: '/l/mine' })
    await expect(undoProfileIfCreateThrows(failing, kept, () => true)).rejects.toThrow('lost')
    expect(profiles.get('s4')).toEqual({ claudeConfigDir: '/l/mine' })
  })
})
