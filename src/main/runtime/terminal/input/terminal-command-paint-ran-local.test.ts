import { expect, it } from 'vitest'
import { TerminalCommandPaint } from './terminal-command-paint'

const D = '\x1b]133;D;0\x07'
const C = '\x1b]133;C\x07'

it('says a command ran only after its own start and finish', () => {
  const paint = new TerminalCommandPaint()
  const see = (data: string) => paint.observe(data, data, 1, {})
  see(`${D}prompt $ `)
  expect(paint.ranCommand).toBe(false)
  see(`${C}command not found: claude\r\n`)
  expect(paint.ranCommand).toBe(false)
  see(`${D}prompt $ `)
  expect(paint.ranCommand).toBe(true)
})

it('counts a command whose start and finish arrive together', () => {
  const paint = new TerminalCommandPaint()
  const data = `${C}command not found${D}`
  paint.observe(data, data, 1, {})
  expect(paint.ranCommand).toBe(true)
})
