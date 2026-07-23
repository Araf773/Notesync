/**
 * A single note in the dashboard, rendered as a card (grid) or a row (list).
 * Shows title, preview, tags, timestamp, and quick actions (pin, menu).
 */
import { Pin, MoreVertical, Trash2, FolderInput, RotateCcw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { NoteMeta } from '@/types/note';

interface NoteCardProps {
  note: NoteMeta;
  view: 'grid' | 'list';
  inTrash: boolean;
  onOpen: () => void;
  onTogglePin: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onPurge: () => void;
  onMove: () => void;
}

export function NoteCard({
  note,
  view,
  inTrash,
  onOpen,
  onTogglePin,
  onTrash,
  onRestore,
  onPurge,
  onMove,
}: NoteCardProps) {
  const title = note.title.trim() || 'Untitled';

  return (
    <div
      className={cn(
        'group relative cursor-pointer rounded-lg border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:shadow',
        view === 'list' && 'flex items-start gap-4',
      )}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-medium leading-tight">{title}</h3>
          {note.pinned && !inTrash && <Pin className="size-3.5 shrink-0 fill-current text-primary" aria-label="Pinned" />}
        </div>
        <p className={cn('mt-1 text-sm text-muted-foreground', view === 'grid' ? 'line-clamp-3' : 'line-clamp-1')}>
          {note.contentPreview || 'No additional text'}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {note.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
              #{tag}
            </span>
          ))}
          {note.tags.length > 3 && <span className="text-xs text-muted-foreground">+{note.tags.length - 3}</span>}
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {inTrash && note.deletedAt
            ? `Deleted ${formatRelativeTime(note.deletedAt)}`
            : `Edited ${formatRelativeTime(note.lastModified)}`}
        </p>
      </div>

      {/* Quick actions — appear on hover/focus; always available via the menu. */}
      <div
        className={cn(
          'flex shrink-0 items-center gap-0.5',
          view === 'grid' && 'absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {!inTrash && (
          <Button variant="ghost" size="icon-sm" aria-label={note.pinned ? 'Unpin' : 'Pin'} onClick={onTogglePin}>
            <Pin className={cn('size-4', note.pinned && 'fill-current text-primary')} />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Note actions">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {inTrash ? (
              <>
                <DropdownMenuItem onClick={onRestore}>
                  <RotateCcw /> Restore
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onClick={onPurge}>
                  <XCircle /> Delete permanently
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onClick={onTogglePin}>
                  <Pin /> {note.pinned ? 'Unpin' : 'Pin'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onMove}>
                  <FolderInput /> Move to folder
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onClick={onTrash}>
                  <Trash2 /> Move to Trash
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
