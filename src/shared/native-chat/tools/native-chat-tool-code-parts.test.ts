import { describe, expect, it } from 'vitest'
import {
  nativeChatHeredocLanguage,
  nativeChatShellCodeParts,
  nativeChatToolArguments
} from './native-chat-tool-code-parts'

describe('nativeChatShellCodeParts', () => {
  it('keeps a plain command as one shell part', () => {
    expect(nativeChatShellCodeParts('git status && ls')).toEqual([
      { code: 'git status && ls', language: 'shellscript' }
    ])
  })

  it('colors a heredoc body by the program that reads it', () => {
    const command = "cd repo && python3 - <<'EOF'\nimport json\nprint(1)\nEOF\necho done"
    const parts = nativeChatShellCodeParts(command)
    expect(parts).toEqual([
      { code: "cd repo && python3 - <<'EOF'\n", language: 'shellscript' },
      { code: 'import json\nprint(1)\n', language: 'python' },
      { code: 'EOF\necho done', language: 'shellscript' }
    ])
    expect(parts.map((part) => part.code).join('')).toBe(command)
  })

  it('colors a written file by its extension', () => {
    const parts = nativeChatShellCodeParts('cat > src/app.ts <<EOF\nconst a = 1\nEOF')
    expect(parts[1]).toEqual({ code: 'const a = 1\n', language: 'typescript' })
  })

  it('leaves an unterminated heredoc as shell', () => {
    expect(nativeChatShellCodeParts("python3 <<'EOF'\nprint(1)")).toEqual([
      { code: "python3 <<'EOF'\nprint(1)", language: 'shellscript' }
    ])
  })
})

describe('nativeChatHeredocLanguage', () => {
  it('skips environment assignments and prefixes', () => {
    expect(nativeChatHeredocLanguage('FOO=1 sudo psql -d app')).toBe('sql')
    expect(nativeChatHeredocLanguage('FOO=1 env node')).toBe('javascript')
    expect(nativeChatHeredocLanguage('python3.12 -')).toBe('python')
    expect(nativeChatHeredocLanguage('cat')).toBeNull()
  })
})

describe('nativeChatToolArguments', () => {
  it('colors a pykeep python_exec code argument as Python', () => {
    const args = nativeChatToolArguments('mcp__pykeep__python_exec', {
      code: 'df = load()\ndf.head()',
      agent: 'rhythm'
    })
    expect(args).toEqual([
      {
        key: 'code',
        parts: [{ code: 'df = load()\ndf.head()', language: 'python' }],
        text: 'df = load()\ndf.head()'
      },
      { key: 'agent', parts: null, text: 'rhythm' }
    ])
  })

  it('reads SQL and declared languages, and shows objects as JSON', () => {
    expect(nativeChatToolArguments('run_query', { query: 'SELECT 1' })[0]?.parts).toEqual([
      { code: 'SELECT 1', language: 'sql' }
    ])
    expect(nativeChatToolArguments('run', { code: 'puts 1', language: 'Ruby' })[0]?.parts).toEqual([
      { code: 'puts 1', language: 'ruby' }
    ])
    expect(nativeChatToolArguments('x', { options: { a: 1 } })[0]?.parts?.[0]?.language).toBe(
      'json'
    )
  })
})
