const FLAGS = new Set(['--resume', '-r', '--session-id', '--session', '-s', '--conversation'])

/** The words of each command in a line, quotes off. A `ps` line has none, so it is read plainly too. */
function commandsOf(line: string): string[][] {
  const quoted = [...line.matchAll(/(?:"(?:[^"\\]|\\.)*"|'[^']*'|[^\s'"]|['"])+/g)].map(
    ([word]) => word
  )
  return [quoted, line.split(/\s+/)].flatMap((words) => {
    const commands: string[][] = [[]]
    for (const word of words) {
      if (!/^(?:;|&&?|\|\|?|\))$/.test(word)) {
        commands.at(-1)!.push(word.replace(/[;)&]+$/, '').replace(/['"]/g, ''))
      }
      if (/(?:^(?:&&?|\|\|?|\))|[;&])$/.test(word)) {
        commands.push([])
      }
    }
    return commands
  })
}

/** An id, or the transcript file it names. */
function namesId(word: string | undefined, id: string): boolean {
  const file = word?.split(/[\\/]/).at(-1)
  return word === id || file === `${id}.jsonl` || file?.endsWith(`_${id}.jsonl`) === true
}

/** Codex's verb: the first one before any words of a prompt, else one right before the id (an option's
 *  value with a space in it looks like a prompt in `ps`). */
function codexResumes(words: readonly string[], id: string): boolean {
  let value = false
  for (let at = 0; at < words.length; at++) {
    const word = words[at]
    if (word === 'resume' || word === 'fork') {
      return word === 'resume' && words.slice(at + 1).some((later) => namesId(later, id))
    }
    if (!word.startsWith('-') && !value && word !== 'exec' && word !== 'e') {
      break
    }
    value = word.startsWith('-')
  }
  return words.some((word, at) => word === 'resume' && namesId(words[at + 1], id))
}

function resumes(words: readonly string[], id: string): boolean {
  const codex = words.findIndex((word) => /(?:^|[\\/])codex(?:[-.][\w.-]+)?$/.test(word))
  if (codex !== -1 && !words.slice(0, codex).some((word) => /(?:^|[\\/])claude$/.test(word))) {
    return codexResumes(words.slice(codex + 1), id)
  }
  return (
    !words.includes('--fork-session') &&
    words.some((word, at) => {
      const equals = word.indexOf('=')
      return (
        (FLAGS.has(word) && namesId(words[at + 1], id)) ||
        (equals !== -1 &&
          FLAGS.has(word.slice(0, equals)) &&
          namesId(word.slice(equals + 1), id)) ||
        word === `-r${id}`
      )
    })
  )
}

/** Whether a command line resumes the conversation, as its writer: the id is the resume's own
 *  argument, not words of a prompt or a path (Claude keeps its scratch files under the conversation's
 *  id), and no copy is made, which has a conversation of its own. */
export function commandResumesConversation(command: string, conversationId: string): boolean {
  return commandsOf(command).some((words) => resumes(words, conversationId))
}
