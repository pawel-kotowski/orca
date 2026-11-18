import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AgentWorkingSpinner } from './agent/status/AgentWorkingSpinner'

describe('AgentWorkingSpinner (local build)', () => {
  it('keeps the ring turning under reduced motion, drawn by its class alone', () => {
    const markup = renderToStaticMarkup(React.createElement(AgentWorkingSpinner))

    expect(markup).toContain('agent-working-spinner')
    // Why: the comet ring is drawn in main.css; a border arc would show under it.
    expect(markup).not.toContain('border-2')
    // Why not: the ring keeps turning under reduced motion in this build (main.css).
    expect(markup).not.toContain('motion-reduce:border-t-agent-working')
  })
})
