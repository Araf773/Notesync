/**
 * Metadata conflict resolution (see SYNC_DESIGN.md §3).
 *
 * Content is merged losslessly by Yjs. Metadata (title, folder, tags, flags,
 * deletion) uses **per-field provenance stamps** + last-writer-wins with explicit
 * conflict escalation — never a silent whole-record overwrite.
 *
 * Each field carries a {v, ts, clientId} stamp. Comparing stamps tells us, for
 * every field independently:
 *   - who has the newer value (→ that value wins)
 *   - whether BOTH sides advanced the field since divergence (→ true conflict)
 *
 * `tags` is special-cased as an additive set (union) so tagging on two devices
 * never drops a tag.
 *
 * This module is pure (no I/O) so it can be unit-tested exhaustively; the sync
 * engine's highest-risk logic lives here.
 */
import {
  MERGEABLE_FIELDS,
  type NoteMeta,
  type MergeableField,
  type FieldStamp,
} from '@/types/note';

export type { MergeableField } from '@/types/note';
export { MERGEABLE_FIELDS } from '@/types/note';

/** A record of a per-field conflict that the user may want to review. */
export interface FieldConflict {
  field: MergeableField;
  localValue: unknown;
  remoteValue: unknown;
  chosen: 'local' | 'remote';
}

export interface MergeResult {
  merged: NoteMeta;
  /** True if the same field diverged on both sides (user-visible conflict). */
  hadConflict: boolean;
  conflicts: FieldConflict[];
}

/**
 * Compare two field stamps. Returns:
 *   > 0 if `a` is the winner, < 0 if `b` is the winner, 0 if identical.
 * Ordering: higher `v`, then higher `ts`, then lexicographically-greater clientId.
 */
export function compareStamps(a: FieldStamp, b: FieldStamp): number {
  if (a.v !== b.v) return a.v - b.v;
  if (a.ts !== b.ts) return a.ts - b.ts;
  if (a.clientId === b.clientId) return 0;
  return a.clientId > b.clientId ? 1 : -1;
}

/** Derive a field stamp, falling back to the record-level version if absent. */
function stampFor(note: NoteMeta, field: MergeableField): FieldStamp {
  return (
    note.fieldStamps?.[field] ?? {
      v: note.version,
      ts: note.lastModified,
      clientId: note.clientId,
    }
  );
}

/**
 * Decide a winner between two whole records (used for non-field decisions like
 * which record's identity/timestamps to seed the merge from).
 */
export function pickWinner(
  local: Pick<NoteMeta, 'version' | 'lastModified' | 'clientId'>,
  remote: Pick<NoteMeta, 'version' | 'lastModified' | 'clientId'>,
): 'local' | 'remote' {
  if (local.version !== remote.version) return local.version > remote.version ? 'local' : 'remote';
  if (local.lastModified !== remote.lastModified)
    return local.lastModified > remote.lastModified ? 'local' : 'remote';
  if (local.clientId === remote.clientId) return 'local';
  return local.clientId > remote.clientId ? 'local' : 'remote';
}

function fieldsEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    return sa.every((v, i) => v === sb[i]);
  }
  return a === b;
}

/**
 * Two field stamps are *concurrent* (a genuine conflict) when their edit counts
 * are equal but they carry different values — i.e. two devices each advanced the
 * field the same number of times from a shared base, independently. When one
 * stamp's `v` is strictly higher, that device causally supersedes the other
 * (it edited after seeing the older value), so it's a clean overwrite, not a
 * conflict. This is the standard scalar-clock concurrency test for per-field LWW.
 */
function isConcurrent(a: FieldStamp, b: FieldStamp): boolean {
  return a.v === b.v;
}

/**
 * Merge a local and remote metadata record for the same note.
 *
 * For each field we compare the two sides' stamps:
 *  - equal values → nothing to do
 *  - different values, one side clearly newer (higher stamp) AND the other side's
 *    stamp is at its baseline (they never re-edited) → take the newer, no conflict
 *  - different values AND both sides independently advanced the field → true
 *    conflict: keep the stamp-winner's value but record the loser (nothing lost)
 *
 * `tags` merges as a union regardless, since adding tags is inherently additive.
 */
export function mergeMetadata(local: NoteMeta, remote: NoteMeta): MergeResult {
  // Fast path: identical logical write.
  if (local.version === remote.version && local.clientId === remote.clientId) {
    return { merged: { ...local }, hadConflict: false, conflicts: [] };
  }

  const seed = pickWinner(local, remote) === 'local' ? local : remote;
  const merged: NoteMeta = { ...seed, fieldStamps: { ...seed.fieldStamps } };
  const conflicts: FieldConflict[] = [];
  const mergedStamps: Partial<Record<MergeableField, FieldStamp>> = {
    ...merged.fieldStamps,
  };

  for (const field of MERGEABLE_FIELDS) {
    const lv = local[field];
    const rv = remote[field];
    const ls = stampFor(local, field);
    const rs = stampFor(remote, field);

    // tags: additive union — never drop a tag added on either device.
    if (field === 'tags') {
      const union = Array.from(new Set([...(lv as string[]), ...(rv as string[])]));
      merged.tags = union;
      mergedStamps.tags = compareStamps(ls, rs) >= 0 ? ls : rs;
      continue;
    }

    if (fieldsEqual(lv, rv)) {
      // Same value; keep the higher stamp so future merges stay accurate.
      mergedStamps[field] = compareStamps(ls, rs) >= 0 ? ls : rs;
      continue;
    }

    const cmp = compareStamps(ls, rs);
    const winner = cmp >= 0 ? 'local' : 'remote';

    assignField(merged, field, winner === 'local' ? lv : rv);
    // The surviving stamp must advance past both so it wins future merges.
    mergedStamps[field] = {
      v: Math.max(ls.v, rs.v),
      ts: Math.max(ls.ts, rs.ts),
      clientId: (winner === 'local' ? ls : rs).clientId,
    };

    // A true conflict is a *concurrent* divergence: both sides at the same edit
    // count but with different values. A strictly-higher stamp is a clean, causal
    // overwrite (that device edited after seeing the other's value).
    if (isConcurrent(ls, rs)) {
      conflicts.push({ field, localValue: lv, remoteValue: rv, chosen: winner });
    }
  }

  merged.fieldStamps = mergedStamps;
  merged.version = Math.max(local.version, remote.version) + 1;
  merged.lastModified = Math.max(local.lastModified, remote.lastModified);

  return { merged, hadConflict: conflicts.length > 0, conflicts };
}

/** Type-safe field assignment (each field has a different value type). */
function assignField(target: NoteMeta, field: MergeableField, value: unknown): void {
  switch (field) {
    case 'title':
      target.title = value as string;
      break;
    case 'folderId':
      target.folderId = value as string | null;
      break;
    case 'tags':
      target.tags = value as string[];
      break;
    case 'pinned':
      target.pinned = value as boolean;
      break;
    case 'deleted':
      target.deleted = value as boolean;
      break;
    case 'deletedAt':
      target.deletedAt = value as number | null;
      break;
  }
}
