/**
 * Notes UI store (Zustand).
 *
 * Holds *view state* — the current filter, sort, search query, view mode, and
 * which note is open. The actual note data is read reactively from Dexie via
 * dexie-react-hooks (useLiveQuery) in the components, so this store stays small
 * and never duplicates the source of truth.
 */
import { create } from 'zustand';
import type { SortKey, ViewMode } from '@/types/note';

/** Which slice of notes the dashboard is showing. */
export type NotesFilter =
  | { kind: 'all' }
  | { kind: 'pinned' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'tag'; tag: string }
  | { kind: 'trash' };

interface NotesUIState {
  filter: NotesFilter;
  search: string;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  viewMode: ViewMode;
  /** Currently-open note id, or null for the dashboard. */
  openNoteId: string | null;

  setFilter: (filter: NotesFilter) => void;
  setSearch: (search: string) => void;
  setSort: (key: SortKey, dir?: 'asc' | 'desc') => void;
  toggleSortDir: () => void;
  setViewMode: (mode: ViewMode) => void;
  openNote: (id: string | null) => void;
}

export const useNotesStore = create<NotesUIState>((set, get) => ({
  filter: { kind: 'all' },
  search: '',
  sortKey: 'lastModified',
  sortDir: 'desc',
  viewMode: 'grid',
  openNoteId: null,

  setFilter: (filter) => set({ filter, search: '' }),
  setSearch: (search) => set({ search }),
  setSort: (sortKey, sortDir) => set({ sortKey, sortDir: sortDir ?? get().sortDir }),
  toggleSortDir: () => set({ sortDir: get().sortDir === 'asc' ? 'desc' : 'asc' }),
  setViewMode: (viewMode) => set({ viewMode }),
  openNote: (openNoteId) => set({ openNoteId }),
}));
