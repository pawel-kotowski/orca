/** One step of a tour file before its commands are checked: title, caption, and command words. */
export type TourFileStep = {
  title: string
  caption: string
  holdMs: number | null
  /** Each `orca-show` line split into words, without the `orca show` prefix. */
  commands: string[][]
  /** 1-based line of the step's heading, for error messages. */
  line: number
}

export type TourFile = { title: string; steps: TourFileStep[] }

const HOLD = /^<!--\s*hold:\s*(\d+(?:\.\d+)?)\s*s\s*-->$/
const FENCE = /^```+\s*orca-show\s*$/
const FENCE_END = /^```+\s*$/

/** Splits a command line into words the way a shell would for plain quotes and backslashes. */
export function splitShellWords(line: string): string[] {
  const words: string[] = []
  let word = ''
  let quote: '"' | "'" | null = null
  let started = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!
    if (quote) {
      if (char === quote) {
        quote = null
      } else if (char === '\\' && quote === '"' && index + 1 < line.length) {
        index += 1
        word += line[index]
      } else {
        word += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      started = true
    } else if (char === '\\' && index + 1 < line.length) {
      index += 1
      word += line[index]
      started = true
    } else if (/\s/.test(char)) {
      if (started) {
        words.push(word)
        word = ''
        started = false
      }
    } else {
      word += char
      started = true
    }
  }
  if (quote) {
    throw new Error(`unclosed ${quote} in: ${line}`)
  }
  if (started) {
    words.push(word)
  }
  return words
}

/**
 * Reads a tour: `# Title`, then one `## Step title` per step with 1–3 sentences and one
 * `orca-show` block of `orca show` subcommands (`code …`, `tree …`, `file …`, `ui …`).
 */
export function parseTourFile(text: string): TourFile {
  const lines = text.split(/\r?\n/)
  let title = ''
  const steps: (TourFileStep & { prose: string[] })[] = []
  let current: (TourFileStep & { prose: string[] }) | null = null
  let inBlock = false
  lines.forEach((raw, index) => {
    const line = raw.trimEnd()
    if (inBlock) {
      if (FENCE_END.test(line.trim())) {
        inBlock = false
      } else if (line.trim() && !line.trim().startsWith('#')) {
        const words = splitShellWords(line.trim())
        current!.commands.push(words[0] === 'orca' && words[1] === 'show' ? words.slice(2) : words)
      }
      return
    }
    if (line.startsWith('## ')) {
      current = {
        title: line.slice(3).trim(),
        caption: '',
        holdMs: null,
        commands: [],
        line: index + 1,
        prose: []
      }
      steps.push(current)
      return
    }
    if (line.startsWith('# ') && !title) {
      title = line.slice(2).trim()
      return
    }
    if (!current) {
      return
    }
    if (FENCE.test(line.trim())) {
      inBlock = true
      return
    }
    const hold = HOLD.exec(line.trim())
    if (hold) {
      current.holdMs = Math.round(Number(hold[1]) * 1000)
      return
    }
    current.prose.push(line)
  })
  if (inBlock) {
    throw new Error('an orca-show block is not closed')
  }
  return {
    title,
    steps: steps.map(({ prose, ...step }) => ({
      ...step,
      caption: prose
        .join('\n')
        .trim()
        .replace(/\n{2,}/g, '\n\n')
    }))
  }
}
