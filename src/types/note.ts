/**
 * Core domain types for NoteSync.
 *
 * A Note is split into two concerns that sync differently:
 *  - **Metadata** (this `NoteMeta`): title, folder, tags, flags, timestamps. Synced via
 *    Dexie + Firestore with a version-vector / last-writer-wins strategy (see SYNC_DESIGN.md).
 *  - **Content** (the rich-text document): a Yjs CRDT document, synced losslessly. The Yjs
 *    update blob is stored separately (IndexedDB via y-indexeddb locally, Firestore remotely).
 */

/** Stable identifier for a device/browser installation. Generated once, persisted locally. */
export type ClientId = string;

/**
 * The metadata fields tracked for field-level conflict resolution. Content is
 * NOT here — it lives in Yjs and merges losslessly on its own.
 */
export const MERGEABLE_FIELDS = [
  'title',
  'folderId',
  'tags',
  'pinned',
  'deleted',
  'deletedAt',
] as const;

export type MergeableField = (typeof MERGEABLE_FIELDS)[number];

/**
 * Per-field provenance stamp (a Lamport-style clock scoped to one field).
 *  - `v`  increments each time *this device* changes *this field*
 *  - `ts` wall-clock of that change (tie-breaker)
 *  - `clientId` which device made it (final deterministic tie-breaker)
 *
 * This is what lets the merge tell "only the title changed on device A" from
 * "both devices changed the title" without needing a stored common ancestor.
 */
export interface FieldStamp {
  v: number;
  ts: number;
  clientId: ClientId;
}

export type FieldStamps = Record<MergeableField, FieldStamp>;

export interface NoteMeta {
  /** Globally unique note id (uuid). Stable across devices. */
  id: string;
  /** Owning user's Firebase UID. */
  ownerId: string;
  title: string;
  /** Folder id, or null for "unfiled". */
  folderId: string | null;
  tags: string[];
  pinned: boolean;
  /**
   * Soft-delete marker. When set, the note is in Trash; `deletedAt` records when.
   * Permanent purge happens after the retention window (see TRASH_RETENTION_MS).
   */
  deleted: boolean;
  deletedAt: number | null;
  createdAt: number;
  /** Last modification wall-clock time (ms since epoch) on the editing device. */
  lastModified: number;
  /**
   * Monotonically increasing per-note version, bumped on every local metadata write.
   * Used together with `clientId` for conflict detection during metadata sync.
   */
  version: number;
  /** Device that produced the current `version`. */
  clientId: ClientId;
  /** Plain-text extract of the content, kept for full-text search without decoding Yjs. */
  contentPreview: string;
  /**
   * Per-field provenance for field-level merge (see SYNC_DESIGN.md §3). Optional
   * for backward-compat with records created before stamps existed; the merge
   * falls back to record-level version when a stamp is missing.
   */
  fieldStamps?: Partial<FieldStamps>;
}

/** Local-only sync bookkeeping, not part of the shared document model. */
export interface NoteSyncState {
  id: string;
  /** True when local changes have not yet been acknowledged by Firestore. */
  dirty: boolean;
  /** Firestore server version we last successfully pulled/pushed (for delta detection). */
  syncedVersion: number;
  /** True if a genuine conflict was detected and is awaiting user resolution. */
  hasConflict: boolean;
}

export interface Folder {
  id: string;
  ownerId: string;
  name: string;
  createdAt: number;
  lastModified: number;
  version: number;
  clientId: ClientId;
  deleted: boolean;
}

/** A point-in-time snapshot of a note's content, for the version-history / recovery feature. */
export interface NoteSnapshot {
  id: string;
  noteId: string;
  /** Yjs state as an update blob (Uint8Array serialized). */
  state: Uint8Array;
  createdAt: number;
  clientId: ClientId;
  /** Human label, e.g. "Autosnapshot" or "Before conflict merge". */
  label: string;
}

export type SyncStatus =
  | 'synced'
  | 'syncing'
  | 'offline'
  | 'conflict'
  | 'error'
  | 'signed-out';

export type ThemeMode = 'light' | 'dark' | 'system';

export type ViewMode = 'grid' | 'list';

export type SortKey = 'lastModified' | 'createdAt' | 'title';
