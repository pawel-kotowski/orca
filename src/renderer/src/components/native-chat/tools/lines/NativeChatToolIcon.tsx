import {
  Bot,
  Brain,
  Eye,
  Folder,
  Globe,
  ListChecks,
  MessageSquareMore,
  Pencil,
  Plug,
  Search,
  SquareTerminal,
  Wrench
} from 'lucide-react'
import type { NativeChatMcpIdentity } from '../../../../../../shared/native-chat/tools/native-chat-tool-identity'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/class-names'
import {
  nativeChatToolIconName,
  type NativeChatToolIconName
} from '../../../../../../shared/native-chat/tools/native-chat-tool-icon'

const NATIVE_CHAT_TOOL_GLYPHS: Record<NativeChatToolIconName, LucideIcon> = {
  eye: Eye,
  search: Search,
  folder: Folder,
  'square-terminal': SquareTerminal,
  pencil: Pencil,
  globe: Globe,
  plug: Plug,
  bot: Bot,
  'list-checks': ListChecks,
  wrench: Wrench,
  'message-square-more': MessageSquareMore,
  brain: Brain
}

/** Use the same fixed glyph slot for known and unknown categories to align rows. */
function NativeChatGlyphSlot({
  glyph: Glyph,
  name,
  className
}: {
  glyph: LucideIcon
  /** The glyph's name, which colours it by kind (native-chat-colors.css). */
  name: NativeChatToolIconName
  className?: string
}): React.JSX.Element {
  return (
    <span
      data-native-chat-glyph={name}
      className={cn('flex size-4 shrink-0 items-center justify-center', className)}
    >
      <Glyph aria-hidden className="size-3.5" />
    </span>
  )
}

/** Resolve row and live-header categories together; decorative glyphs require adjacent accessible text. */
export function NativeChatToolIcon({
  rowWord,
  mcpIdentity,
  input,
  className
}: {
  /** The word the row renders, which is the row's whole identity. */
  rowWord: string
  mcpIdentity?: NativeChatMcpIdentity
  /** A command tool's input, which can narrow its glyph to the browser's. */
  input?: unknown
  className?: string
}): React.JSX.Element {
  const name = nativeChatToolIconName(rowWord, mcpIdentity, input)
  return (
    <NativeChatGlyphSlot glyph={NATIVE_CHAT_TOOL_GLYPHS[name]} name={name} className={className} />
  )
}

/** Use the row glyph table and slot for a caller-resolved settled-run category. */
export function NativeChatToolRunIcon({
  iconName,
  className
}: {
  iconName: NativeChatToolIconName
  className?: string
}): React.JSX.Element {
  return (
    <NativeChatGlyphSlot
      glyph={NATIVE_CHAT_TOOL_GLYPHS[iconName]}
      name={iconName}
      className={className}
    />
  )
}
