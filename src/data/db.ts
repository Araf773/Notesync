/**
 * Local-first database (IndexedDB via Dexie).
 *
 * This is the **source of truth for the active session** (per the brief). Every
 * write lands here first, synchronously and instantly, before any network call.
 * Firestore is a sync target, not the primary store.
 *
 * Tables:
 *  - `notes`     : note metadata (NoteMeta). Content lives in Yjs, not here.
 *  - `content`   : the persisted Yjs update blob per note (managed by y-indexeddb
 *                  separately, but we also keep a merged snapshot here for fast
 *                  boot + preview extraction).
 *  - `folders`   : folder definitions.
 *  - `snapshots` : version-history snapshots (see SYNC_DESIGN.md §4).
 *  - `syncQueue` : outbox of notes with unpushed local changes.
 *  - `settings`  : single-row app settings (theme, default font, etc.).
 */
import Dexie, { type EntityTable } from 'dexie';
import type {
  NoteMeta,
  Folder,
  NoteSnapshot,
  ThemeMode,
  ViewMode,
  SortKey,
} from '@/types/note';

/** Outbox entry: a note that has local changes not yet confirmed by Firestore. */
export interface SyncQueueEntry {
  noteId: string;
  /** What kind of change is pending. */
  kind: 'meta' | 'content' | 'both';
  enqueuedAt: number;
  /** Number of failed push attempts, for backoff. */
  attempts: number;
}

/** Persisted Yjs state for a note (merged update blob). */
export interface ContentRecord {
  noteId: string;
  /** Full Yjs document state as an update (Y.encodeStateAsUpdate). */
  update: Uint8Array;
  /** State vector for delta computation against remote. */
  stateVector: Uint8Array;
  updatedAt: number;
}

export interface AppSettings {
  id: 'app';
  theme: ThemeMode;
  viewMode: ViewMode;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  defaultFontFamily: string;
  defaultFontSize: string;
  /** Whether the last-used account should auto-open its notes. */
  lastUid: string | null;
}

export class NoteSyncDB extends Dexie {
  notes!: EntityTable<NoteMeta, 'id'>;
  content!: EntityTable<ContentRecord, 'noteId'>;
  folders!: EntityTable<Folder, 'id'>;
  snapshots!: EntityTable<NoteSnapshot, 'id'>;
  syncQueue!: EntityTable<SyncQueueEntry, 'noteId'>;
  settings!: EntityTable<AppSettings, 'id'>;

  constructor() {
    super('notesync');
    this.version(1).stores({
      // Indexes chosen for the dashboard queries: by owner, and common sorts/filters.
      notes: 'id, ownerId, folderId, lastModified, createdAt, pinned, deleted, [ownerId+deleted]',
      content: 'noteId, updatedAt',
      folders: 'id, ownerId, name, deleted, [ownerId+deleted]',
      snapshots: 'id, noteId, createdAt, [noteId+createdAt]',
      syncQueue: 'noteId, kind, enqueuedAt',
      settings: 'id',
    });
  }
}

export const db = new NoteSyncDB();

/** Default settings applied on first run. */
export const DEFAULT_SETTINGS: AppSettings = {
  id: 'app',
  theme: 'system',
  viewMode: 'grid',
  sortKey: 'lastModified',
  sortDir: 'desc',
  defaultFontFamily: 'Inter',
  defaultFontSize: '16px',
  lastUid: null,
};

/** How long a soft-deleted note stays in Trash before permanent purge (30 days). */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function getSettings(): Promise<AppSettings> {
  const existing = await db.settings.get('app');
  if (existing) return existing;
  await db.settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Omit<AppSettings, 'id'>>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, id: 'app' });
}
