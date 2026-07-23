/**
 * Dialog to move a note into a folder (or unfile it). Reads the owner's folders
 * live so a folder created moments ago is immediately selectable.
 */
import { FolderIcon, FolderX } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFolders } from '@/data/queries';
import { updateNote } from '@/data/notesRepo';
import { cn } from '@/lib/utils';

interface MoveToFolderDialogProps {
  ownerId: string;
  noteId: string | null;
  currentFolderId: string | null;
  onClose: () => void;
}

export function MoveToFolderDialog({ ownerId, noteId, currentFolderId, onClose }: MoveToFolderDialogProps) {
  const folders = useFolders(ownerId);

  const move = async (folderId: string | null) => {
    if (noteId) await updateNote(noteId, { folderId });
    onClose();
  };

  return (
    <Dialog open={noteId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Move to folder</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => move(null)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent',
              currentFolderId === null && 'bg-accent font-medium',
            )}
          >
            <FolderX className="size-4" /> Unfiled
          </button>
          {folders?.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => move(f.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent',
                currentFolderId === f.id && 'bg-accent font-medium',
              )}
            >
              <FolderIcon className="size-4" /> {f.name}
            </button>
          ))}
          {folders?.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No folders yet. Create one from the sidebar.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
