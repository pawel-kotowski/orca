/** One conversation Claude Code can resume, as its /resume list shows it. */
export type ClaudeProjectSession = {
  sessionId: string
  /** Its name: renamed by the person, else Claude's own title, else its summary. */
  title: string | null
  firstPrompt: string | null
  updatedAt: number
}
