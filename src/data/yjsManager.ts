/**
 * Yjs document manager.
 *
 * Owns the lifecycle of one `Y.Doc` per note. Each doc is:
 *  - bound to Tiptap via y-prosemirror (the editor reads/writes the `default`
 *    XmlFragment named 'prosemirror' — the name Tiptap's Collaboration ext uses)
 *  - persisted locally with y-indexeddb (instant, offline-durable)
 *  - observed so we can (a) extract a plain-text preview for search, (b) mark the
 *    note dirty for the sync outbox, and (c) mirror the merged state into Dexie.
 *
 * See SYNC_DESIGN.md §2 for why the update-log / CRDT approach is lossless.
 */
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { getClientId } from '@/lib/clientId';

/** The XmlFragment field name that Tiptap's Collaboration extension binds to. */
export const YJS_FRAGMENT = 'prosemirror';

interface ManagedDoc {
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
  /** Resolves once the local IndexedDB state has loaded into the doc. */
  whenSynced: Promise<void>;
  refCount: number;
}

const managed = new Map<string, ManagedDoc>();

/** Deterministic origin tag so we can ignore our own updates when needed. */
export const LOCAL_ORIGIN = `local:${getClientId()}`;

function idbKey(noteId: string): string {
  return `notesync-note-${noteId}`;
}

/**
 * Acquire (or create) the managed Y.Doc for a note. Callers MUST call
 * `releaseDoc(noteId)` when done so persistence can be torn down.
 */
export function acquireDoc(noteId: string): ManagedDoc {
  const existing = managed.get(noteId);
  if (existing) {
    existing.refCount += 1;
    return existing;
  }

  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(idbKey(noteId), doc);
  const whenSynced = new Promise<void>((resolve) => {
    persistence.once('synced', () => resolve());
  });

  const entry: ManagedDoc = { doc, persistence, whenSynced, refCount: 1 };
  managed.set(noteId, entry);
  return entry;
}

/** Release a previously-acquired doc; destroys resources when refCount hits 0. */
export async function releaseDoc(noteId: string): Promise<void> {
  const entry = managed.get(noteId);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    // Remove from the registry synchronously BEFORE the async teardown. Under
    // React StrictMode the effect mounts twice (mount→unmount→mount); if we
    // awaited destroy() while still registered, the re-mount's acquireDoc would
    // reuse this entry and then have its doc destroyed out from under it, so its
    // persistence 'synced' event never fires and the editor spins forever.
    managed.delete(noteId);
    await entry.persistence.destroy();
    entry.doc.destroy();
  }
}

/** Get the live doc without changing refcount (returns undefined if not loaded). */
export function peekDoc(noteId: string): Y.Doc | undefined {
  return managed.get(noteId)?.doc;
}

/**
 * Extract a plain-text preview from a Yjs prosemirror fragment. Walks the XML
 * tree collecting text nodes. Used for search indexing + card previews without
 * needing to boot a full ProseMirror instance.
 */
export function extractPreview(doc: Y.Doc, maxLen = 300): string {
  const fragment = doc.getXmlFragment(YJS_FRAGMENT);
  const parts: string[] = [];

  const walk = (node: Y.XmlElement | Y.XmlText | Y.XmlFragment | Y.XmlHook): void => {
    if (parts.join(' ').length >= maxLen) return;
    if (node instanceof Y.XmlText) {
      parts.push(node.toString());
      return;
    }
    if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
      node.forEach((child) => walk(child as Y.XmlElement | Y.XmlText));
    }
  };

  fragment.forEach((child) => walk(child as Y.XmlElement | Y.XmlText));
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

/**
 * Apply a remote update to a note's doc. Creates the managed doc transiently if
 * the note isn't currently open, so background sync can merge without the editor.
 * The update is applied with a `remote` origin so editor bindings can distinguish
 * local typing from incoming sync (used to avoid feedback loops).
 */
export async function applyRemoteUpdate(noteId: string, update: Uint8Array): Promise<void> {
  const wasOpen = managed.has(noteId);
  const entry = acquireDoc(noteId);
  try {
    await entry.whenSynced;
    Y.applyUpdate(entry.doc, update, 'remote');
  } finally {
    if (!wasOpen) await releaseDoc(noteId);
  }
}

/** Encode the full state of a note's doc as a single update blob (for snapshots/push). */
export async function encodeState(noteId: string): Promise<Uint8Array> {
  const wasOpen = managed.has(noteId);
  const entry = acquireDoc(noteId);
  try {
    await entry.whenSynced;
    return Y.encodeStateAsUpdate(entry.doc);
  } finally {
    if (!wasOpen) await releaseDoc(noteId);
  }
}

/** Compute the delta update needed to bring a remote state vector up to local. */
export async function encodeDelta(noteId: string, remoteStateVector: Uint8Array): Promise<Uint8Array> {
  const wasOpen = managed.has(noteId);
  const entry = acquireDoc(noteId);
  try {
    await entry.whenSynced;
    return Y.encodeStateAsUpdate(entry.doc, remoteStateVector);
  } finally {
    if (!wasOpen) await releaseDoc(noteId);
  }
}
