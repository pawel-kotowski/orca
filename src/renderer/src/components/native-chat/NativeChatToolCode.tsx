import { Fragment } from 'react'
import type {
  NativeChatCodePart,
  NativeChatToolArgument
} from '../../../../shared/native-chat/tools/native-chat-tool-code-parts'
import { nativeChatShellCodeParts } from '../../../../shared/native-chat/tools/native-chat-tool-code-parts'
import { NativeChatHighlightedCode } from './NativeChatHighlightedCode'

const CODE_BLOCK_CLASS =
  'max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-chat-code-border bg-chat-code-surface p-2 font-mono text-chat-code text-chat-foreground scrollbar-sleek'

function CodeParts({ parts }: { parts: readonly NativeChatCodePart[] }): React.JSX.Element {
  return (
    <pre data-native-chat-code-content className={CODE_BLOCK_CLASS}>
      {parts.map((part, index) =>
        part.language ? (
          <NativeChatHighlightedCode key={index} code={part.code} language={part.language} />
        ) : (
          <Fragment key={index}>{part.code}</Fragment>
        )
      )}
    </pre>
  )
}

/** A command in its grammar; a shell command's heredoc bodies (Python, SQL, a written file) in theirs. */
export function NativeChatToolCommandCode({
  command,
  language
}: {
  command: string
  language: string | null
}): React.JSX.Element {
  const parts =
    language === 'shellscript' ? nativeChatShellCodeParts(command) : [{ code: command, language }]
  return <CodeParts parts={parts} />
}

/** A tool's arguments: code ones colored by grammar, the rest as plain name and value. */
export function NativeChatToolArguments({
  toolArguments
}: {
  toolArguments: readonly NativeChatToolArgument[]
}): React.JSX.Element {
  const plain = toolArguments.filter((argument) => argument.parts === null)
  const code = toolArguments.filter((argument) => argument.parts !== null)
  return (
    <div className="space-y-1.5">
      {plain.length > 0 ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 font-mono text-chat-code">
          {plain.map((argument) => (
            <div key={argument.key} className="contents">
              <dt className="text-chat-foreground-faint">{argument.key}</dt>
              <dd className="min-w-0 truncate text-chat-foreground" title={argument.text}>
                {argument.text}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {code.map((argument) => (
        <div key={argument.key} className="space-y-0.5">
          <div className="font-mono text-chat-code text-chat-foreground-faint">{argument.key}</div>
          <CodeParts parts={argument.parts ?? []} />
        </div>
      ))}
    </div>
  )
}
