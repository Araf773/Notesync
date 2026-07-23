/**
 * Reactive Dexie queries (dexie-react-hooks).
 *
 * These hooks re-render components automatically when the underlying IndexedDB
 * data changes — including changes written by the sync engine merging in remote
 * updates. This is what makes the UI "live" across devices without manual refresh.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { useNotesStore, type NotesFilter } from '@/store/notesStore';
import type { NoteMeta, Folder, SortKey } from '@/types/note';

function sortNotes(notes: NoteMeta[], key: SortKey, dir: 'asc' | 'desc'): NoteMeta[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...notes].sort((a, b) => {
    // Pinned notes always float to the top (except in trash view).
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (key === 'title') return sign * a.title.localeCompare(b.title);
    return sign * (a[key] - b[key]);
  });
}

function matchesFilter(note: NoteMeta, filter: NotesFilter): boolean {
  switch (filter.kind) {
    case 'trash':
      return note.deleted;
    case 'all':
      return !note.deleted;
    case 'pinned':
      return !note.deleted && note.pinned;
    case 'folder':
      return !note.deleted && note.folderId === filter.folderId;
    case 'tag':
      return !note.deleted && note.tags.includes(filter.tag);
  }
}

function matchesSearch(note: NoteMeta, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    note.title.toLowerCase().includes(needle) ||
    note.contentPreview.toLowerCase().includes(needle) ||
    note.tags.some((t) => t.toLowerCase().includes(needle))
  );
}

/** Live list of notes for the current owner, filtered/sorted/searched per UI state. */
export function useNotes(ownerId: string | null): NoteMeta[] | undefined {
  const filter = useNotesStore((s) => s.filter);
  const search = useNotesStore((s) => s.search);
  const sortKey = useNotesStore((s) => s.sortKey);
  const sortDir = useNotesStore((s) => s.sortDir);

  return useLiveQuery(async () => {
    if (!ownerId) return [];
    const all = await db.notes.where('ownerId').equals(ownerId).toArray();
    const filtered = all.filter((n) => matchesFilter(n, filter) && matchesSearch(n, search));
    // In trash, don't pin-float; sort by deletion time desc for recency.
    if (filter.kind === 'trash') {
      return filtered.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
    }
    return sortNotes(filtered, sortKey, sortDir);
  }, [ownerId, filter, search, sortKey, sortDir]);
}

/** Live single note. */
export function useNote(id: string | null): NoteMeta | undefined {
  return useLiveQuery(async () => (id ? (await db.notes.get(id)) ?? null : null), [id]) ?? undefined;
}

/** Live folder list for the owner (excludes soft-deleted). */
export function useFolders(ownerId: string | null): Folder[] | undefined {
  return useLiveQuery(async () => {
    if (!ownerId) return [];
    const folders = await db.folders.where('ownerId').equals(ownerId).toArray();
    return folders.filter((f) => !f.deleted).sort((a, b) => a.name.localeCompare(b.name));
  }, [ownerId]);
}

/** Live, de-duplicated tag list across all of the owner's non-deleted notes. */
export function useTags(ownerId: string | null): string[] | undefined {
  return useLiveQuery(async () => {
    if (!ownerId) return [];
    const notes = await db.notes.where('ownerId').equals(ownerId).toArray();
    const set = new Set<string>();
    for (const n of notes) if (!n.deleted) n.tags.forEach((t) => set.add(t));
    return Array.from(set).sort();
  }, [ownerId]);
}

/** Live count of notes currently in Trash (for sidebar badge). */
export function useTrashCount(ownerId: string | null): number | undefined {
  return useLiveQuery(async () => {
    if (!ownerId) return 0;
    const notes = await db.notes.where('ownerId').equals(ownerId).toArray();
    return notes.filter((n) => n.deleted).length;
  }, [ownerId]);
}
