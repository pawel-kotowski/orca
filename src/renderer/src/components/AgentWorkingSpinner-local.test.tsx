import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AgentWorkingSpinner } from './AgentWorkingSpinner'

describe('AgentWorkingSpinner (local build)', () => {
  it('keeps the ring turning under reduced motion, with no filled top', () => {
    const markup = renderToStaticMarkup(React.createElement(AgentWorkingSpinner))

    expect(markup).toContain('agent-working-spinner')
    expect(markup).toContain('border-t-transparent')
    // Why not: the ring keeps turning under reduced motion in this build (main.css).
    expect(markup).not.toContain('motion-reduce:border-t-agent-working')
  })
})
