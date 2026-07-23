# NoteSync — Offline-First Sync, Versioning & Conflict Resolution Design

This document explains **exactly** how NoteSync keeps data safe across multiple
devices that edit the same notes offline. Read this before touching the code in
`src/data/` or `src/sync/`.

The guiding rule: **never lose a keystroke.** Every design decision below is
subordinate to that.

---

## 1. The two kinds of data, and why they sync differently

A note is split into two independently-synced parts:

| Part | Contents | Storage | Conflict strategy |
|------|----------|---------|-------------------|
| **Content** | The rich-text document body | Yjs CRDT document | CRDT auto-merge (lossless by construction) |
| **Metadata** | title, folder, tags, pinned, sortKey, `deletedAt`, timestamps | Dexie row + Firestore doc | Version-vector + field-level last-writer-wins, with conflict escalation |

**Why the split?** Content is where real, character-level concurrent editing
happens — that is precisely the problem CRDTs solve, and Yjs pairs natively with
Tiptap/ProseMirror. Metadata is a handful of scalar fields where a true
"two devices set different titles offline" conflict is rare and low-stakes; a
version-vector with field-level merge is simpler, cheaper to store, and easy to
reason about. Using a CRDT for a boolean `pinned` flag would be overkill.

---

## 2. Content sync: Yjs CRDT

### Local persistence
Each note owns one `Y.Doc`. The document's ProseMirror state lives in a
`Y.XmlFragment` bound to the Tiptap editor via `y-prosemirror`. Locally the doc
is persisted with **`y-indexeddb`**, which writes every update synchronously to
IndexedDB *before* anything touches the network. This is what makes offline edits
instant and durable — closing the tab mid-sentence loses nothing.

### Why CRDTs cannot lose data on merge
A Yjs document is a set of immutable operations, each tagged with a unique
`(clientID, clock)` identifier. Merging two documents is a **union** of their
operation sets. Concurrent insertions at the "same" position are both kept and
deterministically ordered by `clientID`; a deletion only tombstones the specific
characters it targeted. There is no "last writer wins" step that throws work
away — if device A typed "cat" and device B typed "dog" in the same paragraph
offline, after sync **both** words are present. This is the core reason the brief
recommends Yjs, and why we follow that recommendation.

### The Firestore content provider (`src/sync/firestoreYProvider.ts`)
Yjs has no official Firestore provider, so we implement one. It works on the
**update-log** model, which is append-only and merge-safe:

```
notes/{uid}/{noteId}                         <- metadata doc (section 3)
notes/{uid}/{noteId}/updates/{autoId}        <- Yjs binary updates (append-only)
notes/{uid}/{noteId}/snapshots/{version}     <- periodic full snapshots (section 4)
```

- **Push:** on every local Yjs update (debounced ~800ms to batch keystrokes), we
  append the merged update as a `Uint8Array` (base64 in Firestore) to the
  `updates` subcollection. Appending never overwrites, so two devices pushing
  concurrently simply create two documents — no lost write.
- **Pull:** a Firestore `onSnapshot` listener on `updates` streams remote updates.
  Each is `Y.applyUpdate`-ed into the local doc. Because CRDT merges are
  commutative and idempotent, order of arrival and duplicate delivery are both
  harmless.
- **Compaction:** when the `updates` log grows past a threshold (default 200
  docs), a snapshot is written (section 4) and older update docs are deleted in a
  batch. Deleting compacted updates is safe because their effect is fully captured
  by the snapshot's state vector.

### Offline queue
While offline, `y-indexeddb` holds everything. A lightweight outbox in Dexie
(`syncQueue`) records "note X has unpushed updates". On reconnect the sync engine
drains the queue: it reads the local doc's state, diffs against the last-pushed
state vector, and appends only the missing updates.

---

## 3. Metadata sync: version vector + field-level LWW

Each metadata record carries:

```ts
{
  id: string,
  version: number,        // monotonic, incremented on every local metadata write
  clientId: string,       // the device that made this version
  lastModified: number,   // epoch ms, from the writing device
  updatedFields: {        // per-field version stamp for field-level merge
    title:   { v: number, clientId: string, ts: number },
    folder:  { v: number, clientId: string, ts: number },
    ...
  }
}
```

`clientId` is a UUID generated once per install and stored in localStorage
(`src/lib/clientId.ts`).

### Merge algorithm (`src/sync/mergeMetadata.ts`)
When local and remote metadata for the same note both changed since last sync:

1. **Field-by-field.** For each field, compare its `{v, clientId, ts}` stamp.
   - Higher `v` wins.
   - Tie on `v` → higher `ts` wins.
   - Tie on `ts` → higher `clientId` wins (deterministic, arbitrary but stable).
2. Because we merge per-field, "device A renamed the note" and "device B moved it
   to a folder" both survive — they touched different fields.
3. **True conflict detection.** If the *same field* was changed on both devices
   since the last common version (both stamps advanced independently), we do not
   silently discard the loser. We keep the winner as the live value **and** record
   the loser in the note's `conflicts` array with both values + timestamps. The UI
   surfaces "Sync conflict — tap to resolve" and shows a compare view. For content,
   the CRDT already merged both, so metadata conflicts are the only ones a user is
   ever asked about.

`deletedAt` is treated as a normal field, so a soft-delete on one device and an
edit on another merge predictably (see section 5).

---

## 4. Version history (recover from a bad merge)

Two independent history mechanisms:

1. **Content snapshots.** Every N updates (compaction) or every ~5 min of active
   editing, we call `Y.encodeStateAsUpdate(doc)` and store it under
   `snapshots/{version}` with a timestamp and the editing `clientId`. These are
   full, restorable document states. The Settings → History view lists them and
   lets the user preview and restore any snapshot (restore = apply that snapshot's
   state into a fresh branch, never a hard delete of current state).
2. **Metadata versions.** Each metadata write appends the prior state to a bounded
   local ring buffer (`noteMetaHistory`, last 50 versions) so title/organization
   changes are also recoverable.

Snapshots are what make "if a bad merge happens, the user can recover a previous
version" a guarantee rather than a hope.

---

## 5. Deletion: soft-delete with retention

- Delete sets `deletedAt = now` (a metadata field — syncs like any other).
- Trash view shows all notes with `deletedAt != null`.
- **Retention:** a note stays in trash for **30 days** (configurable), then a
  cleanup pass permanently removes it (local row + Firestore doc + subcollections).
- **Why soft-delete is mandatory for offline:** if device A deletes a note offline
  while device B edits it offline, a hard delete on sync would destroy B's work.
  With soft-delete, the delete and the edit both sync as field changes; the note
  reappears in trash with its edits intact, and the user decides. No irreversible
  loss.
- Permanent delete from trash is the only destructive path and always requires an
  explicit user confirmation.

---

## 6. Sync status state machine (surfaced in the UI)

```
        ┌─────────┐  go offline   ┌──────────────────────────────┐
        │ SYNCED  │ ────────────► │ OFFLINE (changes saved local) │
        └────┬────┘               └───────────────┬──────────────┘
             │ local edit                          │ reconnect
             ▼                                      ▼
        ┌─────────┐  push+pull ok   ┌───────────┐
        │ SYNCING │ ◄────────────── │ (draining │
        └────┬────┘                 │  queue)   │
             │ conflict detected    └───────────┘
             ▼
        ┌──────────────────┐
        │ CONFLICT (resolve)│  ── user resolves ──►  SYNCED
        └──────────────────┘
```

The Zustand `syncStore` holds the current status and per-note conflict flags; the
header badge and each note card reflect it.

---

## 7. What we test (`src/sync/__tests__/`)

The sync/versioning logic is the highest-risk part of the app, so it gets the most
coverage:

- **Yjs merge is lossless:** two docs edited concurrently offline, merged, assert
  both edits present.
- **Metadata field-level merge:** different fields on two devices both survive.
- **True metadata conflict:** same field on two devices → winner is deterministic
  AND loser is recorded in `conflicts`, never dropped.
- **Soft-delete vs edit:** delete on A + edit on B → note in trash with edits.
- **Offline queue drain:** queued updates all apply after reconnect; idempotent on
  duplicate delivery.
- **Snapshot restore:** restoring an old snapshot reproduces that exact state.

These run under Vitest with `fake-indexeddb`, so they exercise the real Dexie/Yjs
code paths without a browser or network.

---

## 8. Summary of guarantees

1. Every edit is durable locally before any network call.
2. Concurrent content edits merge without loss (CRDT union).
3. Concurrent metadata edits merge per-field; genuine conflicts are escalated to
   the user with both values preserved, never silently resolved.
4. Deletes are reversible for 30 days.
5. Any prior document state is recoverable from snapshots.
