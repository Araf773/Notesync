/**
 * Sync session lifecycle.
 *
 * A single place that owns "who is signed in and what sync machinery is running".
 * When a user signs in we spin up a SyncEngine (metadata) and, per open note, a
 * Firestore Yjs provider (content). On sign-out or unconfigured cloud, everything
 * tears down and the app runs purely local.
 *
 * The UI never talks to SyncEngine/providers directly — it goes through here so
 * lifecycle is centralized and can't leak listeners.
 */
import type * as Y from 'yjs';
import { SyncEngine } from './syncEngine';
import { bindFirestoreProvider, hydrateFromFirestore, type YProviderHandle } from './firestoreYProvider';
import { maybeDb } from '@/lib/firebase';
import type { SyncStatus } from '@/types/note';

type StatusListener = (status: SyncStatus) => void;

class SyncSession {
  private engine: SyncEngine | null = null;
  private uid: string | null = null;
  private contentProviders = new Map<string, YProviderHandle>();
  private statusListeners = new Set<StatusListener>();
  private lastStatus: SyncStatus = 'signed-out';
  private engineUnsub: (() => void) | null = null;

  get currentUid(): string | null {
    return this.uid;
  }

  get isActive(): boolean {
    return this.engine !== null;
  }

  onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    fn(this.lastStatus);
    return () => this.statusListeners.delete(fn);
  }

  private emit(s: SyncStatus): void {
    this.lastStatus = s;
    this.statusListeners.forEach((fn) => fn(s));
  }

  /** Begin cloud sync for a signed-in user. Idempotent per uid. */
  start(uid: string): void {
    if (this.uid === uid && this.engine) return;
    this.stop();

    const db = maybeDb();
    if (!db) {
      // Cloud not configured — stay local, report signed-out sync state.
      this.uid = uid;
      this.emit('signed-out');
      return;
    }

    this.uid = uid;
    this.engine = new SyncEngine(db, uid);
    this.engineUnsub = this.engine.onStatus((s) => this.emit(s));
    this.engine.start();
  }

  /** Stop all sync activity (sign-out or cloud unconfigured). */
  stop(): void {
    for (const handle of this.contentProviders.values()) handle.destroy();
    this.contentProviders.clear();
    this.engineUnsub?.();
    this.engineUnsub = null;
    this.engine?.dispose();
    this.engine = null;
    this.uid = null;
    this.emit('signed-out');
  }

  /** Force an immediate push of the outbox (Settings → "Sync now"). */
  async forceSync(): Promise<void> {
    await this.engine?.drainQueue();
  }

  /**
   * Attach cloud content sync to an open note's Y.Doc. Hydrates any remote-only
   * history first, then binds the live append-only provider. Returns a detach fn.
   * No-op (returns a noop detach) when cloud is inactive.
   */
  async bindNoteContent(noteId: string, ydoc: Y.Doc): Promise<() => void> {
    const db = maybeDb();
    if (!db || !this.uid || !this.engine) return () => {};

    // Pull remote history once so a note created on another device shows up.
    try {
      await hydrateFromFirestore(db, this.uid, noteId, ydoc);
    } catch (err) {
      console.warn('[session] hydrate failed (continuing with local state):', err);
    }

    const handle = bindFirestoreProvider(db, this.uid, noteId, ydoc);
    this.contentProviders.set(noteId, handle);
    return () => {
      handle.destroy();
      this.contentProviders.delete(noteId);
    };
  }
}

/** App-wide singleton. */
export const syncSession = new SyncSession();
