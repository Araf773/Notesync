/**
 * Export all of a user's notes to a downloadable JSON file.
 *
 * Includes metadata plus the plain-text preview and the Yjs content (as base64
 * so it round-trips through JSON). This gives the user a portable backup that
 * isn't locked to the app, satisfying the "export" requirement.
 */
import { db } from '@/data/db';
import { peekDoc } from '@/data/yjsManager';
import * as Y from 'yjs';
import { acquireDoc, releaseDoc } from '@/data/yjsManager';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/** Read a note's full text by acquiring its doc (works even if not open). */
async function readNoteText(noteId: string): Promise<{ text: string; state: string }> {
  const open = peekDoc(noteId);
  const managed = open ? { doc: open, release: false } : { doc: acquireDoc(noteId).doc, release: true };
  try {
    if (managed.release) {
      // Give y-indexeddb a tick to hydrate from local persistence.
      await new Promise((r) => setTimeout(r, 50));
    }
    const text = managed.doc.getXmlFragment('prosemirror').toString();
    const state = toBase64(Y.encodeStateAsUpdate(managed.doc));
    return { text, state };
  } finally {
    if (managed.release) await releaseDoc(noteId);
  }
}

export async function exportNotesToJSON(ownerId: string): Promise<void> {
  const notes = await db.notes.where('ownerId').equals(ownerId).toArray();
  const folders = await db.folders.where('ownerId').equals(ownerId).toArray();

  const exported = [];
  for (const note of notes) {
    const { text, state } = await readNoteText(note.id);
    exported.push({
      id: note.id,
      title: note.title,
      folderId: note.folderId,
      tags: note.tags,
      pinned: note.pinned,
      deleted: note.deleted,
      createdAt: note.createdAt,
      lastModified: note.lastModified,
      contentText: text,
      contentPreview: note.contentPreview,
      yjsState: state,
    });
  }

  const payload = {
    app: 'NoteSync',
    version: 1,
    exportedAt: new Date().toISOString(),
    folders: folders.map((f) => ({ id: f.id, name: f.name })),
    notes: exported,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `notesync-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
