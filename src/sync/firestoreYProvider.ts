/**
 * Firestore provider for Yjs content (see SYNC_DESIGN.md §2).
 *
 * Since Yjs has no official Firestore provider, this implements one on the
 * append-only update-log model:
 *
 *   users/{uid}/notes/{noteId}/updates/{autoId}  -> { u: base64(update), c: clientId, t: serverTs }
 *   users/{uid}/notes/{noteId}/versions/{autoId} -> periodic snapshots (compaction)
 *
 * Push: append local updates (never overwrite). Pull: onSnapshot streams remote
 * updates and applies them. CRDT merges are commutative + idempotent, so
 * duplicate/out-of-order delivery is harmless.
 */
import * as Y from 'yjs';
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  getDocs,
  doc,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { getClientId } from '@/lib/clientId';

/** Threshold at which we compact the update log into a snapshot. */
const COMPACTION_THRESHOLD = 200;

function b64encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function b64decode(s: string): Uint8Array {
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface YProviderHandle {
  /** Stop listening and flush pending state. */
  destroy: () => void;
}

/**
 * Bind a Y.Doc to Firestore for a given note. Returns a handle to tear down.
 *
 * @param db      Firestore instance
 * @param uid     current user's UID (namespace)
 * @param noteId  note id
 * @param ydoc    the live Y.Doc to sync
 * @param onRemote optional callback fired after a remote update is applied
 */
export function bindFirestoreProvider(
  db: Firestore,
  uid: string,
  noteId: string,
  ydoc: Y.Doc,
  onRemote?: () => void,
): YProviderHandle {
  const clientId = getClientId();
  const updatesRef = collection(db, 'users', uid, 'notes', noteId, 'updates');
  const versionsRef = collection(db, 'users', uid, 'notes', noteId, 'versions');

  // Track ids we've already applied to avoid reprocessing our own writes.
  const appliedDocIds = new Set<string>();
  let updateCount = 0;
  let destroyed = false;

  // ── Push: append every local update to the log ──────────────────────────
  const onLocalUpdate = (update: Uint8Array, origin: unknown) => {
    if (destroyed) return;
    // Ignore updates that originated from applying remote data (avoid echo).
    if (origin === 'remote') return;
    void addDoc(updatesRef, {
      u: b64encode(update),
      c: clientId,
      t: serverTimestamp(),
    }).catch((err) => {
      // Offline or transient: the outbox/queue layer will retry via full-state push.
      console.warn('[yprovider] push failed (will retry via queue):', err);
    });
  };
  ydoc.on('update', onLocalUpdate);

  // ── Pull: stream remote updates ─────────────────────────────────────────
  const unsub: Unsubscribe = onSnapshot(
    query(updatesRef, orderBy('t', 'asc')),
    (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const id = change.doc.id;
        if (appliedDocIds.has(id)) return;
        appliedDocIds.add(id);
        updateCount += 1;

        const data = change.doc.data();
        // Skip our own just-written updates (already in local doc).
        if (data.c === clientId && change.doc.metadata.hasPendingWrites) return;

        try {
          Y.applyUpdate(ydoc, b64decode(data.u as string), 'remote');
          onRemote?.();
        } catch (err) {
          console.error('[yprovider] failed to apply remote update:', err);
        }
      });

      // Opportunistic compaction when the log grows large.
      if (updateCount > COMPACTION_THRESHOLD) {
        void compact(db, uid, noteId, ydoc, updatesRef, versionsRef).then((did) => {
          if (did) updateCount = 0;
        });
      }
    },
    (err) => console.error('[yprovider] snapshot listener error:', err),
  );

  return {
    destroy: () => {
      destroyed = true;
      ydoc.off('update', onLocalUpdate);
      unsub();
    },
  };
}

/**
 * Compaction: write a full-state snapshot, then delete superseded update docs.
 * Safe because the snapshot captures the merged effect of all deleted updates.
 * Returns true if compaction ran.
 */
async function compact(
  db: Firestore,
  uid: string,
  noteId: string,
  ydoc: Y.Doc,
  updatesRef: ReturnType<typeof collection>,
  versionsRef: ReturnType<typeof collection>,
): Promise<boolean> {
  try {
    const fullState = Y.encodeStateAsUpdate(ydoc);
    // 1. Persist snapshot first (so we never delete updates without a backup).
    await addDoc(versionsRef, {
      u: b64encode(fullState),
      c: getClientId(),
      t: serverTimestamp(),
      kind: 'compaction',
    });

    // 2. Delete update docs that predate this snapshot, in batches of 400.
    const existing = await getDocs(query(updatesRef, orderBy('t', 'asc')));
    const ids = existing.docs.map((d) => d.id);
    for (let i = 0; i < ids.length; i += 400) {
      const batch = writeBatch(db);
      for (const id of ids.slice(i, i + 400)) {
        batch.delete(doc(db, 'users', uid, 'notes', noteId, 'updates', id));
      }
      await batch.commit();
    }
    return true;
  } catch (err) {
    console.warn('[yprovider] compaction skipped:', err);
    return false;
  }
}

/**
 * One-shot pull of all content for a note (updates + latest snapshot) into a doc.
 * Used on first load of a note that exists remotely but not locally.
 */
export async function hydrateFromFirestore(
  db: Firestore,
  uid: string,
  noteId: string,
  ydoc: Y.Doc,
): Promise<void> {
  const versionsRef = collection(db, 'users', uid, 'notes', noteId, 'versions');
  const updatesRef = collection(db, 'users', uid, 'notes', noteId, 'updates');

  // Apply the most recent snapshot (if any) then all updates on top.
  const versions = await getDocs(query(versionsRef, orderBy('t', 'desc')));
  const latest = versions.docs[0];
  if (latest) {
    Y.applyUpdate(ydoc, b64decode(latest.data().u as string), 'remote');
  }
  const updates = await getDocs(query(updatesRef, orderBy('t', 'asc')));
  updates.forEach((d) => {
    Y.applyUpdate(ydoc, b64decode(d.data().u as string), 'remote');
  });
}
