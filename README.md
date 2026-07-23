# NoteSync

An offline-first, multi-device note-taking app. Write in a rich-text editor,
organize with folders and tags, and have everything sync across devices when
you're online — while staying fully usable when you're not.

Web (PWA) + Android (Capacitor) from a single React + TypeScript codebase.

## Highlights

- **Local-first.** Every edit is written to IndexedDB (via Dexie) first, instantly.
  The network is a sync target, never a dependency. Close the tab, pull the plug,
  fly on a plane — the app keeps working.
- **Conflict-free sync.** Note bodies are [Yjs](https://yjs.dev) CRDT documents,
  so concurrent edits on multiple devices merge automatically without clobbering.
  Metadata (title, tags, folder, pin) uses last-writer-wins with version vectors.
  See [SYNC_DESIGN.md](SYNC_DESIGN.md) for the full model.
- **Rich text.** Tiptap/ProseMirror editor: headings, lists, checkboxes, tables,
  links, images, highlight, code blocks.
- **Organization.** Folders, tags, pinning, full-text search, grid/list views,
  and a 30-day Trash.
- **Installable.** PWA with a service worker for offline loads; native Android
  build via Capacitor with hardware-back, keyboard, and safe-area handling.
- **Works without a backend.** If no Firebase project is configured, the app runs
  in local-only mode. Cloud sync activates automatically once configured.

## Tech stack

| Concern            | Choice                                    |
| ------------------ | ----------------------------------------- |
| UI                 | React 18, TypeScript, Vite, Tailwind CSS  |
| Editor             | Tiptap (ProseMirror)                      |
| Local persistence  | Dexie (IndexedDB) + y-indexeddb           |
| CRDT               | Yjs                                       |
| Auth + cloud       | Firebase Auth + Firestore + Storage       |
| State              | Zustand                                   |
| Mobile             | Capacitor (Android)                       |
| Tests              | Vitest                                    |

## Getting started

```bash
npm install
npm run dev
```

The app runs at the URL Vite prints (default http://localhost:5173). With no
Firebase config it starts in **local-only mode** — click "Continue offline" and
start taking notes. Everything persists on the device.

### Enabling cloud sync (optional)

1. Create a Firebase project and enable **Authentication** (Google + Email/Password),
   **Cloud Firestore**, and **Storage**.
2. Copy `.env.example` to `.env` and fill in the `VITE_FIREBASE_*` values from
   your project's web app config.
3. Deploy the security rules (they scope every document to its owner):

   ```bash
   firebase deploy --only firestore:rules,storage:rules
   ```

4. Restart `npm run dev`. The sign-in screen now offers Google and email/password,
   and notes sync across every device signed into the same account.

> The `VITE_FIREBASE_*` values are embedded in the client bundle — that's expected.
> The Firebase web API key is a project identifier, not a secret. Access control is
> enforced by the Firestore/Storage security rules, not by hiding config.

## How sync works (short version)

1. An edit updates the local Yjs doc → persisted to IndexedDB immediately, and the
   note is added to a local outbox (`syncQueue`).
2. When online and signed in, the sync engine pushes queued Yjs updates to Firestore
   and subscribes to remote changes.
3. Incoming remote updates are merged into the local Yjs doc — CRDT semantics
   guarantee all devices converge to the same state regardless of edit order.
4. Metadata is reconciled with version vectors + last-writer-wins.

The status pill in the toolbar shows live state (synced / syncing / offline /
conflict / local-only) and doubles as a manual "sync now" button.

Full design, including the Firestore document layout, tombstones, and version
history: [SYNC_DESIGN.md](SYNC_DESIGN.md).

## Android build

Requires **JDK 17** and the **Android SDK** (Android Studio is the easiest way to
get both). Capacitor 6 will not build under JDK 8/11.

```bash
# One-time: the android/ project is already generated (npm run android:add regenerates it).
npm run android:build        # builds web, syncs, then assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Or open the project in Android Studio to run on an emulator/device:

```bash
npm run cap:android
```

After any web change, re-sync the native project:

```bash
npm run cap:sync
```

Native concerns (status-bar theming, hardware back button, keyboard resize,
safe-area insets) are handled in [src/lib/native.ts](src/lib/native.ts) and
[capacitor.config.ts](capacitor.config.ts); they're no-ops on the web build.

## Scripts

| Script                  | What it does                                        |
| ----------------------- | --------------------------------------------------- |
| `npm run dev`           | Start the Vite dev server                           |
| `npm run build`         | Type-check and build the production web bundle      |
| `npm run preview`       | Preview the production build locally                |
| `npm test`              | Run the Vitest suite once                           |
| `npm run test:watch`    | Run tests in watch mode                             |
| `npm run lint`          | ESLint                                              |
| `npm run cap:sync`      | Copy web build into the native project              |
| `npm run cap:android`   | Open the Android project in Android Studio          |
| `npm run android:build` | Build web + sync + assemble a debug APK             |

## Tests

```bash
npm test
```

The suite focuses on the parts most likely to break silently:

- **`src/sync/yjsConvergence.test.ts`** — two independent Yjs docs making concurrent
  edits converge to identical state after exchanging updates (the core CRDT guarantee).
- **`src/sync/mergeMetadata.test.ts`** — last-writer-wins metadata reconciliation,
  including version-vector tie-breaks and tombstone handling.

## Project structure

```
src/
  components/      UI: auth, dashboard, editor, sidebar, settings, ui primitives
  data/            Dexie schema, notes repository, live queries, Yjs doc manager
  sync/            Firestore <-> Yjs provider, sync engine/session, merge logic
  store/           Zustand stores (auth, settings, notes UI state)
  hooks/           useNoteDoc, useSyncStatus, ...
  lib/             firebase init, native (Capacitor), export, utils
  types/           shared types
SYNC_DESIGN.md     the offline-first + conflict-resolution design doc
firestore.rules    owner-scoped Firestore security rules
storage.rules      owner-scoped Storage security rules
```

## License

MIT
