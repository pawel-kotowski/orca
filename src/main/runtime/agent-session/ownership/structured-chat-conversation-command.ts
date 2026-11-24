const FLAGS = new Set(['--resume', '-r', '--session-id', '--session', '-s', '--conversation'])
const VERBS = new Set(['resume', 'fork'])

/** The first command's words, quotes off; a `ps` line and a shell line read alike. */
function commandWords(command: string): string[] {
  const words: string[] = []
  for (const [word] of command.matchAll(/(?:"(?:[^"\\]|\\.)*"|'[^']*'|[^\s'"]|['"])+/g)) {
    if (/^(?:;|&&?|\|\|?|\))$/.test(word)) {
      break
    }
    words.push(word.replace(/[;)&]+$/, '').replace(/['"]/g, ''))
    if (/[;&]$/.test(word)) {
      break
    }
  }
  return words
}

/** An id, or the transcript file it names. */
function namesId(word: string | undefined, id: string): boolean {
  const file = word?.split(/[\\/]/).at(-1)
  return word === id || file === `${id}.jsonl` || file?.endsWith(`_${id}.jsonl`) === true
}

/** Codex's verb and what follows it: the first one before any words of a prompt. */
function codexVerb(words: readonly string[]): { verb: string; rest: readonly string[] } | null {
  const start = words.findIndex((word) => /(?:^|[\\/])codex(?:\.\w+)?$/.test(word))
  if (start === -1) {
    return null
  }
  let value = false
  for (let at = start + 1; at < words.length; at++) {
    const word = words[at]
    if (VERBS.has(word)) {
      return { verb: word, rest: words.slice(at + 1) }
    }
    // A word that is neither an option, its value, nor `exec` starts a prompt.
    if (!word.startsWith('-') && !value && word !== 'exec') {
      return null
    }
    value = word.startsWith('-')
  }
  return null
}

/** Whether a command line resumes the conversation, as its writer: the id is the resume's own
 *  argument, not words of a prompt or a path (Claude keeps its scratch files under the conversation's
 *  id), and no copy is made, which has a conversation of its own. */
export function commandResumesConversation(command: string, conversationId: string): boolean {
  const words = commandWords(command)
  const codex = codexVerb(words)
  if (codex) {
    return codex.verb === 'resume' && codex.rest.some((word) => namesId(word, conversationId))
  }
  return (
    !words.includes('--fork-session') &&
    words.some((word, at) => {
      const equals = word.indexOf('=')
      return (
        (FLAGS.has(word) && namesId(words[at + 1], conversationId)) ||
        (equals !== -1 &&
          FLAGS.has(word.slice(0, equals)) &&
          namesId(word.slice(equals + 1), conversationId)) ||
        word === `-r${conversationId}`
      )
    })
  )
}
