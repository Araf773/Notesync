/**
 * The main notes dashboard: toolbar (search, sort, view toggle, new note) plus a
 * responsive grid/list of note cards, with loading and empty states.
 *
 * Note *data* is read live from Dexie via useNotes, so remote sync updates and
 * local edits both reflect here without manual refresh.
 */
import { useState } from 'react';
import {
  Search,
  Plus,
  LayoutGrid,
  List as ListIcon,
  ArrowUpDown,
  Menu,
  Loader2,
  Inbox,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { SyncStatusIndicator } from '@/components/SyncStatusIndicator';
import { NoteCard } from './NoteCard';
import { MoveToFolderDialog } from './MoveToFolderDialog';
import { useNotes } from '@/data/queries';
import { useNotesStore } from '@/store/notesStore';
import { useSettingsStore } from '@/store/settingsStore';
import { createNote, trashNote, restoreNote, purgeNote, updateNote } from '@/data/notesRepo';
import type { NoteMeta, SortKey } from '@/types/note';

const SORT_LABELS: Record<SortKey, string> = {
  lastModified: 'Last modified',
  createdAt: 'Date created',
  title: 'Title',
};

const FILTER_TITLES: Record<string, string> = {
  all: 'All notes',
  pinned: 'Pinned',
  trash: 'Trash',
};

export function Dashboard({ ownerId, onOpenSidebar }: { ownerId: string; onOpenSidebar: () => void }) {
  const notes = useNotes(ownerId);
  const filter = useNotesStore((s) => s.filter);
  const search = useNotesStore((s) => s.search);
  const setSearch = useNotesStore((s) => s.setSearch);
  const sortKey = useNotesStore((s) => s.sortKey);
  const sortDir = useNotesStore((s) => s.sortDir);
  const setSort = useNotesStore((s) => s.setSort);
  const openNote = useNotesStore((s) => s.openNote);

  const viewMode = useSettingsStore((s) => s.viewMode);
  const setViewMode = useSettingsStore((s) => s.setViewMode);
  const persistSort = useSettingsStore((s) => s.setSort);

  const [moveTarget, setMoveTarget] = useState<NoteMeta | null>(null);

  const inTrash = filter.kind === 'trash';
  const heading =
    filter.kind === 'folder' ? 'Folder' : filter.kind === 'tag' ? `#${filter.tag}` : FILTER_TITLES[filter.kind];

  const handleNew = async () => {
    const folderId = filter.kind === 'folder' ? filter.folderId : null;
    const tags = filter.kind === 'tag' ? [filter.tag] : [];
    const note = await createNote(ownerId, { folderId, tags });
    openNote(note.id);
  };

  const changeSort = (key: SortKey) => {
    // Toggle direction if re-selecting the same key, else default to desc (asc for title).
    const dir = key === sortKey ? (sortDir === 'asc' ? 'desc' : 'asc') : key === 'title' ? 'asc' : 'desc';
    setSort(key, dir);
    persistSort(key, dir);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={onOpenSidebar}>
          <Menu />
        </Button>
        <h1 className="hidden text-lg font-semibold sm:block">{heading}</h1>

        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes…"
            className="pl-8"
            aria-label="Search notes"
          />
        </div>

        <SyncStatusIndicator />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Sort options">
              <ArrowUpDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <DropdownMenuCheckboxItem key={key} checked={sortKey === key} onSelect={(e) => { e.preventDefault(); changeSort(key); }}>
                {SORT_LABELS[key]} {sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          aria-label={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
          onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
        >
          {viewMode === 'grid' ? <ListIcon /> : <LayoutGrid />}
        </Button>

        {!inTrash && (
          <Button onClick={handleNew} className="gap-1.5">
            <Plus /> <span className="hidden sm:inline">New</span>
          </Button>
        )}
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {notes === undefined ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : notes.length === 0 ? (
          <EmptyState inTrash={inTrash} searching={search.length > 0} onNew={handleNew} />
        ) : (
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                : 'mx-auto flex max-w-3xl flex-col gap-2'
            }
          >
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                view={viewMode}
                inTrash={inTrash}
                onOpen={() => openNote(note.id)}
                onTogglePin={() => void updateNote(note.id, { pinned: !note.pinned })}
                onTrash={() => void trashNote(note.id)}
                onRestore={() => void restoreNote(note.id)}
                onPurge={() => {
                  if (window.confirm('Permanently delete this note? This cannot be undone.')) void purgeNote(note.id);
                }}
                onMove={() => setMoveTarget(note)}
              />
            ))}
          </div>
        )}
      </div>

      <MoveToFolderDialog
        ownerId={ownerId}
        noteId={moveTarget?.id ?? null}
        currentFolderId={moveTarget?.folderId ?? null}
        onClose={() => setMoveTarget(null)}
      />
    </div>
  );
}

function EmptyState({ inTrash, searching, onNew }: { inTrash: boolean; searching: boolean; onNew: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
      <Inbox className="size-12 opacity-40" />
      {searching ? (
        <p>No notes match your search.</p>
      ) : inTrash ? (
        <p>Trash is empty. Deleted notes appear here for 30 days.</p>
      ) : (
        <>
          <p>No notes yet. Create your first one.</p>
          <Button onClick={onNew} className="gap-1.5">
            <Plus /> New note
          </Button>
        </>
      )}
    </div>
  );
}
