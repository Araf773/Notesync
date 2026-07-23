/**
 * Full-screen note editor view: header (back, title, tags, actions) above the
 * rich-text editor. The title and tags are metadata (Dexie); the body is Yjs.
 *
 * Loading is gated on the Y.Doc being ready so we never flash an empty editor
 * over a note that actually has synced content.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Pin, MoreVertical, Trash2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { SyncStatusIndicator } from '@/components/SyncStatusIndicator';
import { NoteEditor } from './NoteEditor';
import { useNoteDoc } from '@/hooks/useNoteDoc';
import { useNote } from '@/data/queries';
import { useSettingsStore } from '@/store/settingsStore';
import { updateNote, trashNote, purgeNote } from '@/data/notesRepo';
import { extractPreview } from '@/data/yjsManager';
import { debounce } from '@/lib/utils';
import { cn } from '@/lib/utils';

export function EditorScreen({ noteId, onBack }: { noteId: string; onBack: () => void }) {
  const note = useNote(noteId);
  const { doc, ready } = useNoteDoc(noteId);
  const fontFamily = useSettingsStore((s) => s.defaultFontFamily);
  const fontSize = useSettingsStore((s) => s.defaultFontSize);

  const [title, setTitle] = useState('');
  const [tagInput, setTagInput] = useState('');
  const titleInit = useRef(false);

  // Seed the local title field once when the note loads (avoid clobbering typing).
  useEffect(() => {
    if (note && !titleInit.current) {
      setTitle(note.title);
      titleInit.current = true;
    }
  }, [note]);

  // Debounced title persistence.
  const persistTitle = useRef(debounce((t: string) => void updateNote(noteId, { title: t }), 400));
  useEffect(() => {
    const d = persistTitle.current;
    return () => d.flush();
  }, [noteId]);

  const onTitleChange = (value: string) => {
    setTitle(value);
    persistTitle.current(value);
  };

  const addTag = async () => {
    const tag = tagInput.trim().replace(/^#/, '').toLowerCase();
    if (!tag || !note) return;
    if (!note.tags.includes(tag)) await updateNote(noteId, { tags: [...note.tags, tag] });
    setTagInput('');
  };

  const removeTag = async (tag: string) => {
    if (!note) return;
    await updateNote(noteId, { tags: note.tags.filter((t) => t !== tag) });
  };

  const handleTrash = async () => {
    await trashNote(noteId);
    onBack();
  };

  // Leaving the editor: if the note has no title, no tags, and no body text, it
  // was never really written to — purge it outright instead of leaving an empty
  // "Untitled" note cluttering the list.
  const handleBack = async () => {
    persistTitle.current.flush();
    const hasTitle = title.trim().length > 0;
    const hasTags = !!note && note.tags.length > 0;
    const hasBody = !!doc && extractPreview(doc).trim().length > 0;
    if (!hasTitle && !hasTags && !hasBody) {
      await purgeNote(noteId);
    }
    onBack();
  };

  if (note === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (note === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>This note could not be found.</p>
        <Button variant="outline" onClick={onBack}>
          Back to notes
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b px-2 py-1.5">
        <Button variant="ghost" size="icon" aria-label="Back to notes" onClick={() => void handleBack()}>
          <ArrowLeft />
        </Button>
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled"
          aria-label="Note title"
          className="h-auto min-w-0 flex-1 border-0 px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
        />
        <SyncStatusIndicator />
        <Button
          variant="ghost"
          size="icon"
          aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
          onClick={() => void updateNote(noteId, { pinned: !note.pinned })}
        >
          <Pin className={cn('size-5', note.pinned && 'fill-current text-primary')} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Note actions">
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem destructive onClick={handleTrash}>
              <Trash2 /> Move to Trash
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Tags row — full width, scrolls with the header (not sticky). */}
      <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5">
        {note.tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
            #{tag}
            <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => void removeTag(tag)} className="hover:text-destructive">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              void addTag();
            }
          }}
          onBlur={() => void addTag()}
          placeholder="Add tag…"
          aria-label="Add tag"
          className="min-w-[6rem] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex-1 overflow-hidden">
        {ready && doc ? (
          <NoteEditor noteId={noteId} doc={doc} fontFamily={fontFamily} fontSize={fontSize} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
