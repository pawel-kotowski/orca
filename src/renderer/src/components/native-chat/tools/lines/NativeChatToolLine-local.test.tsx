// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeChatToolLine } from './NativeChatToolLine'

vi.mock('@/lib/syntax-highlighting/oniguruma', async () => ({
  loadOniguruma: (await import('@/lib/syntax-highlighting/oniguruma-test-harness'))
    .loadNodeOniguruma
}))

afterEach(cleanup)

describe('tool sentence rows (local)', () => {
  it.each([
    ['Read', { file_path: '/repo/src/main.ts' }, 'main.ts'],
    ['Grep', { pattern: 'TODO', path: '/repo' }, 'TODO'],
    ['Bash', { command: 'pnpm test' }, 'pnpm test']
  ])('draws a %s step quieter than the agent’s own words', (name, input, target) => {
    render(<NativeChatToolLine block={{ type: 'tool-call', name, input, state: 'completed' }} />)
    expect(screen.getByText(target, { selector: 'span:not(.sr-only)' })).toHaveClass(
      'text-chat-foreground-faint'
    )
  })

  it('heads a described command with its description and opens to the command and output', () => {
    const { container } = render(
      <NativeChatToolLine
        block={{
          type: 'tool-call',
          name: 'Bash',
          input: { command: 'pnpm test', description: 'Run the suite' },
          state: 'completed'
        }}
        result={{ type: 'tool-result', output: 'all passed' }}
      />
    )
    expect(screen.getByRole('button')).toHaveTextContent('Run the suite')
    fireEvent.click(screen.getByRole('button'))
    expect([...container.querySelectorAll('pre')].map((pre) => pre.textContent)).toEqual([
      'pnpm test',
      'all passed'
    ])
  })

  it('opens a python_exec call to its code, colored as Python', async () => {
    const { container } = render(
      <NativeChatToolLine
        block={{
          type: 'tool-call',
          name: 'mcp__pykeep__python_exec',
          input: { code: 'import json\nprint(json.dumps({}))', agent: 'rhythm' },
          state: 'completed'
        }}
        result={{ type: 'tool-result', output: '{}' }}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    const code = container.querySelector('pre')
    expect(code?.textContent).toBe('import json\nprint(json.dumps({}))')
    await waitFor(
      () => expect(code?.querySelector('span[style*="--syntax-dark"]')).not.toBeNull(),
      { timeout: 10_000 }
    )
  })
})
