import { Copy, ExternalLink } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { LocalOnlyMenuHint } from '@/components/local-only-menu-hint'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { isRevealOrEditorOpenBlocked } from '@/lib/files/os-open/local-path-open-guard'
import {
  getRevealInFileManagerLabel,
  getOpenFileRevealOwner,
  revealInFileManager
} from '@/lib/files/os-open/reveal-in-file-manager'
import { useTranslate } from '@/i18n/use-translate'
import { tourSnapshotRepoPathsOf } from '@/agent-show/tour/tour-snapshot-tab'

export function EditorFileLocationMenuItems({
  file,
  onCopyPath
}: {
  file: OpenFile
  onCopyPath: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const revealOwner = useAppStore((state) => getOpenFileRevealOwner(state, file))
  const revealBlocked = isRevealOrEditorOpenBlocked(revealOwner)
  // Why: an "as it was" tab is a temp copy; its paths name the repo file and Reveal is left out.
  const snapshot = tourSnapshotRepoPathsOf(file)

  return (
    <>
      {snapshot ? null : (
        <DropdownMenuItem
          disabled={revealBlocked}
          onSelect={() => void revealInFileManager(file.filePath, revealOwner)}
        >
          <ExternalLink />
          {getRevealInFileManagerLabel(t)}
          {revealBlocked ? <LocalOnlyMenuHint /> : null}
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={onCopyPath}>
        <Copy />
        {t('auto.components.editor.EditorPanelHeader.7c08a1f990', 'Copy Path')}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() =>
          void window.api.ui.writeClipboardText(snapshot?.relative ?? file.relativePath)
        }
      >
        <Copy />
        {t('auto.components.editor.EditorPanelHeader.269ce4842b', 'Copy Relative Path')}
      </DropdownMenuItem>
    </>
  )
}
