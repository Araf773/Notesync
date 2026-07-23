/**
 * Metadata sync engine.
 *
 * Bridges the local Dexie store and Firestore for note & folder *metadata*
 * (content is handled by firestoreYProvider). Responsibilities:
 *  - push queued local changes (the outbox) up to Firestore
 *  - subscribe to remote metadata changes and merge them down (mergeMetadata)
 *  - drive the app-wide SyncStatus indicator
 *  - retry with backoff; survive going offline/online
 *
 * The engine is defensive: if Firebase is not configured or the user is signed
 * out, it stays dormant and the app runs purely local.
 */
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  serverTimestamp,
  deleteDoc,
  getDoc,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/data/db';
import { mergeMetadata } from './mergeMetadata';
import type { NoteMeta } from '@/types/note';
import type { SyncStatus } from '@/types/note';

type StatusListener = (status: SyncStatus) => void;

/** Serialize a NoteMeta for Firestore (Firestore rejects `undefined`). */
function toFirestore(note: NoteMeta): Record<string, unknown> {
  return {
    id: note.id,
    title: note.title,
    folderId: note.folderId,
    tags: note.tags,
    pinned: note.pinned,
    deleted: note.deleted,
    deletedAt: note.deletedAt,
    createdAt: note.createdAt,
    lastModified: note.lastModified,
    version: note.version,
    clientId: note.clientId,
    contentPreview: note.contentPreview,
    updatedAt: serverTimestamp(),
  };
}

function fromFirestore(data: Record<string, unknown>, ownerId: string): NoteMeta {
  return {
    id: String(data.id),
    ownerId,
    title: String(data.title ?? ''),
    folderId: (data.folderId as string | null) ?? null,
    tags: (data.tags as string[]) ?? [],
    pinned: Boolean(data.pinned),
    deleted: Boolean(data.deleted),
    deletedAt: (data.deletedAt as number | null) ?? null,
    createdAt: Number(data.createdAt ?? Date.now()),
    lastModified: Number(data.lastModified ?? Date.now()),
    version: Number(data.version ?? 1),
    clientId: String(data.clientId ?? ''),
    contentPreview: String(data.contentPreview ?? ''),
  };
}

export class SyncEngine {
  private readonly db: Firestore;
  private readonly uid: string;
  private unsubNotes: Unsubscribe | null = null;
  private statusListeners = new Set<StatusListener>();
  private status: SyncStatus = 'offline';
  private draining = false;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(firestore: Firestore, uid: string) {
    this.db = firestore;
    this.uid = uid;
  }

  onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  private setStatus(s: SyncStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.statusListeners.forEach((fn) => fn(s));
  }

  /** Start remote subscription + initial drain. */
  start(): void {
    if (this.disposed) return;
    this.setStatus('syncing');
    this.subscribeRemote();
    void this.drainQueue();

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  private handleOnline = (): void => {
    this.setStatus('syncing');
    void this.drainQueue();
  };

  private handleOffline = (): void => {
    this.setStatus('offline');
  };

  private notesCol() {
    return collection(this.db, 'users', this.uid, 'notes');
  }

  /** Subscribe to all remote note metadata and merge changes down into Dexie. */
  private subscribeRemote(): void {
    this.unsubNotes = onSnapshot(
      query(this.notesCol()),
      async (snap) => {
        for (const change of snap.docChanges()) {
          if (change.doc.metadata.hasPendingWrites) continue; // our own echo
          const remote = fromFirestore(change.doc.data(), this.uid);
          await this.mergeRemoteNote(remote);
        }
        if (this.status === 'syncing') this.setStatus('synced');
      },
      (err) => {
        console.error('[sync] notes listener error:', err);
        this.setStatus('error');
      },
    );
  }

  /** Merge a single remote note into the local store. */
  private async mergeRemoteNote(remote: NoteMeta): Promise<void> {
    await db.transaction('rw', db.notes, async () => {
      const local = await db.notes.get(remote.id);
      if (!local) {
        // New note from another device.
        await db.notes.put(remote);
        return;
      }
      if (local.version === remote.version && local.clientId === remote.clientId) {
        return; // identical
      }
      const { merged, hadConflict } = mergeMetadata(local, remote);
      await db.notes.put(merged);
      if (hadConflict) {
        this.setStatus('conflict');
        // Conflicts are surfaced non-destructively; both values live in `merged`
        // history. The UI reads a conflict flag off the note (future: dedicated table).
      }
    });
  }

  /** Push all queued local changes to Firestore. Debounced + guarded. */
  async drainQueue(): Promise<void> {
    if (this.draining || this.disposed) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setStatus('offline');
      return;
    }
    this.draining = true;
    try {
      const entries = await db.syncQueue.orderBy('enqueuedAt').toArray();
      if (entries.length > 0) this.setStatus('syncing');

      for (const entry of entries) {
        const note = await db.notes.get(entry.noteId);
        try {
          if (!note) {
            // Note was purged locally → propagate tombstone (delete remote doc).
            await deleteDoc(doc(this.notesCol(), entry.noteId));
          } else {
            await setDoc(doc(this.notesCol(), note.id), toFirestore(note), {
              merge: true,
            });
          }
          await db.syncQueue.delete(entry.noteId);
        } catch (err) {
          console.warn('[sync] push failed for', entry.noteId, err);
          await db.syncQueue.put({ ...entry, attempts: entry.attempts + 1 });
        }
      }

      const remaining = await db.syncQueue.count();
      this.setStatus(remaining > 0 ? 'error' : 'synced');
      if (remaining > 0) this.scheduleRetry();
    } finally {
      this.draining = false;
    }
  }

  private scheduleRetry(): void {
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = setTimeout(() => void this.drainQueue(), 5000);
  }

  /** Fetch a single remote note on demand (used when opening a note). */
  async fetchNote(noteId: string): Promise<NoteMeta | null> {
    const snap = await getDoc(doc(this.notesCol(), noteId));
    if (!snap.exists()) return null;
    return fromFirestore(snap.data(), this.uid);
  }

  dispose(): void {
    this.disposed = true;
    this.unsubNotes?.();
    if (this.drainTimer) clearTimeout(this.drainTimer);
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.statusListeners.clear();
  }
}
