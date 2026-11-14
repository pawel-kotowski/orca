import { describe, expect, it } from 'vitest'
import { pickShowPath } from './show-path'

describe('pickShowPath', () => {
  it('takes a relative path from the shell folder when the file is there', () => {
    const exists = (path: string): boolean => path === '/repo/app/demo/render.js'
    expect(pickShowPath('render.js', '/repo/app/demo', exists)).toBe('/repo/app/demo/render.js')
  })

  it('keeps it worktree-relative when the shell folder has no such file', () => {
    expect(pickShowPath('src/main.ts', '/repo/app', () => false)).toBe('src/main.ts')
  })

  it('leaves absolute paths alone', () => {
    expect(pickShowPath('/repo/x.ts', '/elsewhere', () => true)).toBe('/repo/x.ts')
  })
})
