import { describe, expect, it } from 'vitest'
import { withoutRejectedClaudeApiKey } from './claude-rejected-api-key'

const key = 'sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaKEYTAIL1234567890ABCD'
const config =
  (rejected: string[], approved: string[] = []) =>
  () =>
    JSON.stringify({ customApiKeyResponses: { rejected, approved } })

describe('a generation honours the API key answer the person gave Claude', () => {
  it('leaves out a key Claude was told to reject', () => {
    const env = withoutRejectedClaudeApiKey(
      { ANTHROPIC_API_KEY: key, HOME: '/home/x', PATH: '/bin' },
      config([key.slice(-20)])
    )
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.PATH).toBe('/bin')
  })

  it('keeps an approved or unanswered key', () => {
    expect(
      withoutRejectedClaudeApiKey({ ANTHROPIC_API_KEY: key }, config([], [key.slice(-20)]))
        .ANTHROPIC_API_KEY
    ).toBe(key)
    expect(
      withoutRejectedClaudeApiKey({ ANTHROPIC_API_KEY: key }, config([])).ANTHROPIC_API_KEY
    ).toBe(key)
  })

  it('reads the account home Orca chose', () => {
    let read = ''
    withoutRejectedClaudeApiKey({ ANTHROPIC_API_KEY: key, CLAUDE_CONFIG_DIR: '/acct' }, (path) => {
      read = path
      return '{}'
    })
    expect(read).toBe('/acct/.claude.json')
  })

  it('keeps the key when the config cannot be read', () => {
    const env = withoutRejectedClaudeApiKey({ ANTHROPIC_API_KEY: key }, () => {
      throw new Error('missing')
    })
    expect(env.ANTHROPIC_API_KEY).toBe(key)
  })
})
