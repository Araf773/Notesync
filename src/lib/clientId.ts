/**
 * Per-device client identifier.
 *
 * Each installation/browser-profile gets a stable, random clientId persisted in
 * localStorage. This is the `clientId` referenced throughout SYNC_DESIGN.md:
 *  - it tags every metadata write so we can tell "this device" from "another device"
 *  - it is used as the Yjs `origin` and awareness identity
 *  - it lets last-writer-wins tie-breaks be deterministic (compare clientId strings)
 *
 * It is intentionally NOT the Firebase UID: one user can be signed in on several
 * devices, and we must distinguish those devices for conflict detection.
 */

const STORAGE_KEY = 'notesync.clientId';

function generateId(): string {
  // crypto.randomUUID is available in all modern browsers and the Capacitor WebView.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older runtimes / test environments.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cached: string | null = null;

export function getClientId(): string {
  if (cached) return cached;

  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
    const fresh = generateId();
    localStorage.setItem(STORAGE_KEY, fresh);
    cached = fresh;
    return fresh;
  } catch {
    // localStorage unavailable (e.g. SSR/tests) — fall back to an in-memory id.
    if (!cached) cached = generateId();
    return cached;
  }
}

/** Test-only: reset the in-memory cache so a fresh id is read from storage. */
export function __resetClientIdCache(): void {
  cached = null;
}
