/**
 * Manage the Yjs document lifecycle for an open note.
 *
 * Acquires the note's Y.Doc (persisted locally via y-indexeddb), waits for its
 * local state to load, binds cloud content sync if a session is active, and
 * releases everything on unmount. Returns the doc once it's ready to bind to the
 * editor — rendering the editor before local state has loaded would briefly show
 * an empty document, so we gate on `ready`.
 */
import { useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { acquireDoc, releaseDoc } from '@/data/yjsManager';
import { syncSession } from '@/sync/session';

export function useNoteDoc(noteId: string | null): { doc: Y.Doc | null; ready: boolean } {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [ready, setReady] = useState(false);
  const detachRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!noteId) {
      setDoc(null);
      setReady(false);
      return;
    }

    let cancelled = false;
    setReady(false);

    const managed = acquireDoc(noteId);
    setDoc(managed.doc);

    void managed.whenSynced.then(async () => {
      if (cancelled) return;
      // Bind cloud sync (no-op when offline/unconfigured). Do this after local
      // load so we merge remote onto a populated doc.
      detachRef.current = await syncSession.bindNoteContent(noteId, managed.doc);
      if (cancelled) {
        detachRef.current?.();
        detachRef.current = null;
        return;
      }
      setReady(true);
    });

    return () => {
      cancelled = true;
      detachRef.current?.();
      detachRef.current = null;
      void releaseDoc(noteId);
    };
  }, [noteId]);

  return { doc, ready };
}
