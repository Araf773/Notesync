/**
 * Note repository — all reads/writes of note & folder *metadata* go through here.
 *
 * Responsibilities:
 *  - maintain versioning invariants (bump `version`, stamp `clientId`/`lastModified`)
 *  - enqueue changed notes into the sync outbox
 *  - never hard-delete on the user's behalf (soft-delete → Trash → retention purge)
 *
 * Content (rich text) is NOT handled here — that's Yjs (see yjsManager.ts).
 */
import { db, TRASH_RETENTION_MS, type SyncQueueEntry } from './db';
import { getClientId } from '@/lib/clientId';
import {
  MERGEABLE_FIELDS,
  type NoteMeta,
  type Folder,
  type FieldStamps,
} from '@/types/note';

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Fresh field stamps for a brand-new note: every field at the creator's v:1. */
function initialStamps(clientId: string, ts: number): FieldStamps {
  const stamps = {} as FieldStamps;
  for (const f of MERGEABLE_FIELDS) stamps[f] = { v: 1, ts, clientId };
  return stamps;
}

/**
 * Bump the stamps for exactly the fields present in `patch`. Each edited field's
 * `v` increments (per-device edit count for that field), which is what lets the
 * merge distinguish a causal overwrite from a concurrent conflict.
 */
function bumpStamps(
  current: Partial<FieldStamps> | undefined,
  patch: object,
  clientId: string,
  ts: number,
): Partial<FieldStamps> {
  const next: Partial<FieldStamps> = { ...current };
  for (const f of MERGEABLE_FIELDS) {
    if (f in patch) {
      const prev = current?.[f]?.v ?? 0;
      next[f] = { v: prev + 1, ts, clientId };
    }
  }
  return next;
}

async function enqueue(noteId: string, kind: SyncQueueEntry['kind']): Promise<void> {
  const existing = await db.syncQueue.get(noteId);
  const mergedKind: SyncQueueEntry['kind'] =
    existing && existing.kind !== kind ? 'both' : kind;
  await db.syncQueue.put({
    noteId,
    kind: mergedKind,
    enqueuedAt: Date.now(),
    attempts: existing?.attempts ?? 0,
  });
}

export async function createNote(ownerId: string, init?: Partial<NoteMeta>): Promise<NoteMeta> {
  const now = Date.now();
  const note: NoteMeta = {
    id: init?.id ?? uuid(),
    ownerId,
    title: init?.title ?? '',
    folderId: init?.folderId ?? null,
    tags: init?.tags ?? [],
    pinned: init?.pinned ?? false,
    deleted: false,
    deletedAt: null,
    createdAt: now,
    lastModified: now,
    version: 1,
    clientId: getClientId(),
    contentPreview: init?.contentPreview ?? '',
    fieldStamps: initialStamps(getClientId(), now),
  };
  await db.notes.put(note);
  await enqueue(note.id, 'both');
  return note;
}

/**
 * Patch note metadata. Automatically bumps version and re-stamps provenance so
 * conflict resolution downstream has correct inputs. Returns the updated note.
 */
export async function updateNote(
  id: string,
  patch: Partial<Omit<NoteMeta, 'id' | 'ownerId' | 'createdAt' | 'version' | 'clientId'>>,
): Promise<NoteMeta | undefined> {
  return db.transaction('rw', db.notes, db.syncQueue, async () => {
    const current = await db.notes.get(id);
    if (!current) return undefined;
    const now = Date.now();
    const cid = getClientId();
    const updated: NoteMeta = {
      ...current,
      ...patch,
      version: current.version + 1,
      clientId: cid,
      lastModified: now,
      fieldStamps: bumpStamps(current.fieldStamps, patch, cid, now),
    };
    await db.notes.put(updated);
    await enqueue(id, 'meta');
    return updated;
  });
}

/** Persist a content preview extracted from Yjs, and mark content dirty. */
export async function updateContentPreview(id: string, preview: string): Promise<void> {
  await db.transaction('rw', db.notes, db.syncQueue, async () => {
    const current = await db.notes.get(id);
    if (!current) return;
    // Preview changes bump lastModified but NOT version — version tracks metadata
    // edits for conflict detection; content dirtiness is tracked via the queue.
    await db.notes.put({ ...current, contentPreview: preview, lastModified: Date.now() });
    await enqueue(id, 'content');
  });
}

/** Soft-delete: move to Trash. Recoverable until retention purge. */
export async function trashNote(id: string): Promise<void> {
  await updateNote(id, { deleted: true, deletedAt: Date.now() });
}

/** Restore a note from Trash. */
export async function restoreNote(id: string): Promise<void> {
  await updateNote(id, { deleted: false, deletedAt: null });
}

/**
 * Permanently delete a note and all its local artifacts. This is irreversible;
 * callers (UI) must confirm with the user first.
 */
export async function purgeNote(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.notes, db.content, db.snapshots, db.syncQueue],
    async () => {
      await db.notes.delete(id);
      await db.content.delete(id);
      await db.snapshots.where('noteId').equals(id).delete();
      // Signal remote deletion via the queue with a tombstone kind handled by the engine.
      await db.syncQueue.put({
        noteId: id,
        kind: 'both',
        enqueuedAt: Date.now(),
        attempts: 0,
      });
    },
  );
}

/** Purge notes whose retention window has elapsed. Returns count purged. */
export async function purgeExpiredTrash(ownerId: string): Promise<number> {
  const cutoff = Date.now() - TRASH_RETENTION_MS;
  const expired = await db.notes
    .where('[ownerId+deleted]')
    .equals([ownerId, 1 as unknown as number])
    .filter((n) => n.deleted && n.deletedAt !== null && n.deletedAt < cutoff)
    .toArray();
  for (const n of expired) await purgeNote(n.id);
  return expired.length;
}

// ── Folders ───────────────────────────────────────────────────────────────

export async function createFolder(ownerId: string, name: string): Promise<Folder> {
  const now = Date.now();
  const folder: Folder = {
    id: uuid(),
    ownerId,
    name,
    createdAt: now,
    lastModified: now,
    version: 1,
    clientId: getClientId(),
    deleted: false,
  };
  await db.folders.put(folder);
  return folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const current = await db.folders.get(id);
  if (!current) return;
  await db.folders.put({
    ...current,
    name,
    version: current.version + 1,
    clientId: getClientId(),
    lastModified: Date.now(),
  });
}

export async function deleteFolder(id: string): Promise<void> {
  await db.transaction('rw', db.folders, db.notes, db.syncQueue, async () => {
    const current = await db.folders.get(id);
    if (!current) return;
    await db.folders.put({
      ...current,
      deleted: true,
      version: current.version + 1,
      clientId: getClientId(),
      lastModified: Date.now(),
    });
    // Un-file notes that were in this folder (don't delete them).
    const affected = await db.notes.where('folderId').equals(id).toArray();
    for (const n of affected) {
      await db.notes.put({
        ...n,
        folderId: null,
        version: n.version + 1,
        clientId: getClientId(),
        lastModified: Date.now(),
      });
      await enqueue(n.id, 'meta');
    }
  });
}
