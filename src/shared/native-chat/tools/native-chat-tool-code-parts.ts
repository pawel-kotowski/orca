/** A run of source text and the grammar to color it with; null keeps it plain. */
export type NativeChatCodePart = { code: string; language: string | null }

/** One argument of a tool call: code gets its parts colored, anything else is shown as text. */
export type NativeChatToolArgument = {
  key: string
  /** Set for code-like values; plain values carry `text` instead. */
  parts: NativeChatCodePart[] | null
  text: string
}

const SHELL = 'shellscript'

// Programs whose stdin or script file a heredoc feeds, by the grammar of what they read.
const LANGUAGE_BY_PROGRAM: ReadonlyMap<string, string> = new Map([
  ['python', 'python'],
  ['python3', 'python'],
  ['ipython', 'python'],
  ['uv', 'python'],
  ['node', 'javascript'],
  ['bun', 'typescript'],
  ['deno', 'typescript'],
  ['tsx', 'typescript'],
  ['ruby', 'ruby'],
  ['perl', 'perl'],
  ['php', 'php'],
  ['bash', SHELL],
  ['sh', SHELL],
  ['zsh', SHELL],
  ['psql', 'sql'],
  ['sqlite3', 'sql'],
  ['mysql', 'sql'],
  ['duckdb', 'sql'],
  ['jq', 'jq'],
  ['osascript', 'applescript'],
  ['swift', 'swift'],
  ['kubectl', 'yaml']
])

// Programs that run the next word as the real program.
const PREFIX_PROGRAMS: ReadonlySet<string> = new Set([
  'sudo',
  'env',
  'exec',
  'time',
  'nice',
  'command'
])

// File types a `cat > file <<EOF` writes, by extension.
const LANGUAGE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ['py', 'python'],
  ['js', 'javascript'],
  ['mjs', 'javascript'],
  ['cjs', 'javascript'],
  ['jsx', 'jsx'],
  ['ts', 'typescript'],
  ['mts', 'typescript'],
  ['tsx', 'tsx'],
  ['json', 'json'],
  ['jsonl', 'json'],
  ['yaml', 'yaml'],
  ['yml', 'yaml'],
  ['toml', 'toml'],
  ['md', 'markdown'],
  ['html', 'html'],
  ['css', 'css'],
  ['sql', 'sql'],
  ['sh', SHELL],
  ['bash', SHELL],
  ['zsh', SHELL],
  ['rb', 'ruby'],
  ['go', 'go'],
  ['rs', 'rust'],
  ['swift', 'swift'],
  ['kt', 'kotlin'],
  ['java', 'java'],
  ['c', 'c'],
  ['h', 'c'],
  ['cpp', 'cpp'],
  ['xml', 'xml'],
  ['ini', 'ini'],
  ['env', 'dotenv'],
  ['dockerfile', 'docker']
])

// `<<EOF`, `<<-EOF`, `<<'EOF'`, `<< "EOF"`; never a `<<<` here-string.
const HEREDOC = /(?<!<)<<(-?)\s*(['"]?)([A-Za-z_][\w-]*)\2/

function lastCommandBefore(line: string, end: number): string {
  // The heredoc belongs to the simple command it is written in.
  const head = line.slice(0, end)
  const separators = [...head.matchAll(/\|\||&&|[|;(]/g)]
  const start =
    separators.length > 0 ? (separators.at(-1)!.index ?? 0) + separators.at(-1)![0].length : 0
  return head.slice(start).trim()
}

/** The grammar of a heredoc's body, from the command that reads it; null when unknown. */
export function nativeChatHeredocLanguage(command: string): string | null {
  const words = command.split(/\s+/).filter(Boolean)
  // `cat > notes.py`, `tee app.ts`: the written file's extension decides.
  const written = command.match(/(?:>>?|\btee\s+(?:-a\s+)?)\s*(['"]?)([^\s'"]+)\1/)
  if (written?.[2]) {
    const name = written[2].split('/').at(-1)?.toLowerCase() ?? ''
    const extension = name === 'dockerfile' ? name : name.split('.').at(-1)
    const byExtension = extension ? LANGUAGE_BY_EXTENSION.get(extension) : undefined
    if (byExtension) {
      return byExtension
    }
  }
  for (const word of words) {
    // `FOO=1 python3 -`: an environment assignment is not the program.
    if (word.includes('=')) {
      continue
    }
    const program = word.split('/').at(-1)?.toLowerCase() ?? ''
    const language =
      LANGUAGE_BY_PROGRAM.get(program) ?? LANGUAGE_BY_PROGRAM.get(program.replace(/[\d.]+$/, ''))
    if (language) {
      return language
    }
    if (!PREFIX_PROGRAMS.has(program)) {
      return null
    }
  }
  return null
}

/** Split a shell command into its shell text and the heredoc bodies it feeds, each in its own grammar. */
export function nativeChatShellCodeParts(command: string): NativeChatCodePart[] {
  const parts: NativeChatCodePart[] = []
  const lines = command.split('\n')
  let shell: string[] = []
  const flushShell = (): void => {
    if (shell.length > 0) {
      parts.push({ code: shell.join('\n'), language: SHELL })
      shell = []
    }
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const match = HEREDOC.exec(line)
    shell.push(line)
    if (!match) {
      continue
    }
    const [, dash, , terminator] = match
    const body: string[] = []
    let end = index + 1
    while (end < lines.length) {
      const candidate = dash ? lines[end].replace(/^\t+/, '') : lines[end]
      if (candidate === terminator) {
        break
      }
      body.push(lines[end])
      end++
    }
    if (end >= lines.length) {
      // An unterminated heredoc is still shell as far as anyone can tell.
      continue
    }
    flushShell()
    parts.push({
      code: body.join('\n'),
      language: nativeChatHeredocLanguage(lastCommandBefore(line, match.index))
    })
    shell.push(lines[end])
    index = end
  }
  flushShell()
  // Join each part to the next with the newline the split took out.
  return parts.map((part, index) =>
    index < parts.length - 1 ? { ...part, code: `${part.code}\n` } : part
  )
}

// Argument names that hold source text, and the grammar each one implies when it is not obvious.
const CODE_KEYS: ReadonlyMap<string, string | null> = new Map([
  ['code', null],
  ['source', null],
  ['script', null],
  ['program', null],
  ['snippet', null],
  ['python', 'python'],
  ['javascript', 'javascript'],
  ['js', 'javascript'],
  ['typescript', 'typescript'],
  ['sql', 'sql'],
  ['query', null],
  ['command', SHELL],
  ['cmd', SHELL],
  ['shell', SHELL],
  ['bash', SHELL],
  ['expression', null],
  ['function', 'javascript'],
  ['yaml', 'yaml'],
  ['json', 'json'],
  ['html', 'html'],
  ['css', 'css']
])

const TOOL_NAME_LANGUAGES: readonly [RegExp, string][] = [
  [/python|ipython|jupyter|notebook|pykeep/i, 'python'],
  [/\b(?:sql|postgres|psql|sqlite|mysql|duckdb|bigquery|snowflake)\b|_sql|sql_/i, 'sql'],
  [/javascript|\bnode\b|browser|evaluate|playwright|puppeteer|devtools/i, 'javascript'],
  [/typescript/i, 'typescript'],
  [/shell|bash|terminal|exec_command/i, SHELL]
]

function languageFromContent(code: string): string | null {
  if (
    /^#!.*\bpython/.test(code) ||
    /^\s*(?:from\s+\S+\s+import|import\s+\w+|def\s+\w+\(|class\s+\w+[:(]|print\()/m.test(code)
  ) {
    return 'python'
  }
  if (/^\s*(?:SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(code)) {
    return 'sql'
  }
  if (/^#!.*\b(?:ba|z)?sh\b/.test(code)) {
    return SHELL
  }
  if (/^\s*(?:const|let|var|function|async\s+function|await|export|import\s*\{)\b|=>/m.test(code)) {
    return 'javascript'
  }
  if (/^\s*[{[]/.test(code)) {
    try {
      JSON.parse(code)
      return 'json'
    } catch {
      return null
    }
  }
  return null
}

function stringifyArgument(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

/**
 * A tool call's arguments for its detail view: source text in a code argument (an MCP
 * `python_exec`'s `code`, a SQL tool's `query`) is split and colored by grammar; the rest stays text.
 */
export function nativeChatToolArguments(
  toolName: string,
  input: unknown
): NativeChatToolArgument[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return []
  }
  const record = input as Record<string, unknown>
  const declared =
    typeof record.language === 'string' ? record.language.trim().toLowerCase() || null : null
  const byToolName = TOOL_NAME_LANGUAGES.find(([pattern]) => pattern.test(toolName))?.[1] ?? null
  return Object.entries(record).flatMap(([key, value]): NativeChatToolArgument[] => {
    if (value === undefined || value === null || value === '') {
      return []
    }
    const text = stringifyArgument(value)
    const keyName = key.toLowerCase()
    const isCodeKey = CODE_KEYS.has(keyName)
    if (typeof value !== 'string' || (!isCodeKey && !text.includes('\n'))) {
      return [
        {
          key,
          parts: typeof value === 'object' ? [{ code: text, language: 'json' }] : null,
          text
        }
      ]
    }
    const language = CODE_KEYS.get(keyName) ?? declared ?? byToolName ?? languageFromContent(text)
    if (!isCodeKey && language === null) {
      return [{ key, parts: null, text }]
    }
    const parts = language === SHELL ? nativeChatShellCodeParts(text) : [{ code: text, language }]
    return [{ key, parts, text }]
  })
}
