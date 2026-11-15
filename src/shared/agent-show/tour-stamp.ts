/** `<!-- tour-commit: 8c209314c9… -->` under the title: the commit a tour's line numbers belong to. */
const STAMP = /^<!--\s*tour-commit:\s*([0-9a-f]{7,64})\s*-->$/i
const COMMIT = /^[0-9a-f]{7,64}$/i

/** The commit a tour was stamped at, or null when it has none. */
export function readTourStamp(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const match = STAMP.exec(line.trim())
    if (match) {
      return match[1]!.toLowerCase()
    }
  }
  return null
}

export function isTourStampLine(line: string): boolean {
  return STAMP.test(line.trim())
}

/** The tour with its stamp set to `commit`: replaced in place, else put right under the `# Title`. */
export function writeTourStamp(text: string, commit: string): string {
  if (!COMMIT.test(commit)) {
    throw new Error(`not a commit id: ${commit}`)
  }
  const stamp = `<!-- tour-commit: ${commit.toLowerCase()} -->`
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const existing = lines.findIndex(isTourStampLine)
  if (existing !== -1) {
    lines[existing] = stamp
    return lines.join(newline)
  }
  const title = lines.findIndex((line) => line.startsWith('# '))
  lines.splice(title + 1, 0, ...(title === -1 ? [stamp, ''] : [stamp]))
  return lines.join(newline)
}
