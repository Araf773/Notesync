/**
 * Tests for metadata conflict resolution — the highest-risk part of the app.
 *
 * These verify the field-level merge rules in mergeMetadata():
 *  - non-conflicting field edits merge cleanly
 *  - concurrent edits to the same field are detected as conflicts (never
 *    silently discarded)
 *  - deletions and un-deletions resolve deterministically
 *  - the merge is commutative (order of local/remote does not change outcome
 *    for the surviving values) — a key property for multi-device convergence
 */
import { describe, it, expect } from 'vitest';
import { mergeMetadata } from './mergeMetadata';
import { MERGEABLE_FIELDS, type NoteMeta, type FieldStamps } from '@/types/note';

function base(overrides: Partial<NoteMeta> = {}): NoteMeta {
  return {
    id: 'note-1',
    ownerId: 'user-1',
    title: 'Original',
    folderId: null,
    tags: [],
    pinned: false,
    deleted: false,
    deletedAt: null,
    createdAt: 1000,
    lastModified: 1000,
    version: 1,
    clientId: 'device-A',
    contentPreview: '',
    ...overrides,
  };
}

/**
 * Build a note as `clientId` would have it after editing a specific set of
 * fields `edits` times each, at wall-clock `ts`. Unedited fields sit at the
 * shared baseline (v:0), which is what lets the merge tell a one-sided edit from
 * a genuine concurrent conflict. This mirrors how notesRepo stamps fields.
 */
function edited(
  overrides: Partial<NoteMeta>,
  editedFields: Partial<Record<keyof FieldStamps, number>>,
  clientId: string,
  ts: number,
): NoteMeta {
  const stamps = {} as FieldStamps;
  for (const f of MERGEABLE_FIELDS) {
    const v = editedFields[f];
    stamps[f] = v
      ? { v, ts, clientId }
      : { v: 0, ts: 1000, clientId: 'genesis' };
  }
  return base({ ...overrides, clientId, lastModified: ts, fieldStamps: stamps });
}

describe('mergeMetadata', () => {
  it('takes remote when local is strictly older and untouched', () => {
    const local = base({ version: 1, lastModified: 1000 });
    const remote = base({ title: 'Remote edit', version: 2, lastModified: 2000, clientId: 'device-B' });
    const { merged, hadConflict } = mergeMetadata(local, remote);
    expect(hadConflict).toBe(false);
    expect(merged.title).toBe('Remote edit');
    expect(merged.version).toBeGreaterThanOrEqual(2);
  });

  it('keeps local when remote is older', () => {
    const local = base({ title: 'Newer local', version: 5, lastModified: 5000, clientId: 'device-A' });
    const remote = base({ title: 'Stale', version: 2, lastModified: 2000, clientId: 'device-B' });
    const { merged } = mergeMetadata(local, remote);
    expect(merged.title).toBe('Newer local');
  });

  it('merges edits on different fields without conflict', () => {
    // Local changed title; remote changed pinned — different fields, both survive.
    const local = edited({ title: 'Local title', version: 2 }, { title: 1 }, 'device-A', 3000);
    const remote = edited({ pinned: true, version: 2 }, { pinned: 1 }, 'device-B', 2500);
    const { merged, hadConflict } = mergeMetadata(local, remote);
    expect(hadConflict).toBe(false);
    expect(merged.title).toBe('Local title');
    expect(merged.pinned).toBe(true);
  });

  it('detects a true conflict when both edited the SAME field concurrently', () => {
    // Both bumped title once from the shared base → concurrent (v equal), conflict.
    const local = edited({ title: 'Local title', version: 2 }, { title: 1 }, 'device-A', 3000);
    const remote = edited({ title: 'Remote title', version: 2 }, { title: 1 }, 'device-B', 3000);
    const { hadConflict } = mergeMetadata(local, remote);
    expect(hadConflict).toBe(true);
  });

  it('a causally-later edit cleanly overwrites without a conflict', () => {
    // device-B saw A's title (v1) then edited again (v2) → supersedes, no conflict.
    const local = edited({ title: 'Local title', version: 2 }, { title: 1 }, 'device-A', 3000);
    const remote = edited({ title: 'Remote title', version: 3 }, { title: 2 }, 'device-B', 4000);
    const { merged, hadConflict } = mergeMetadata(local, remote);
    expect(hadConflict).toBe(false);
    expect(merged.title).toBe('Remote title');
  });

  it('never loses data on conflict: losing value is retained in conflict record', () => {
    const local = edited({ title: 'Local title', version: 2 }, { title: 1 }, 'device-A', 3000);
    const remote = edited({ title: 'Remote title', version: 2 }, { title: 1 }, 'device-B', 3001);
    const { merged, conflicts } = mergeMetadata(local, remote);
    const survivor = merged.title;
    const other = survivor === 'Local title' ? 'Remote title' : 'Local title';
    expect(conflicts.some((c) => c.field === 'title' && (c.localValue === other || c.remoteValue === other))).toBe(true);
  });

  it('union-merges tags (set semantics, additive from both sides)', () => {
    const local = edited({ tags: ['work', 'urgent'], version: 2 }, { tags: 1 }, 'device-A', 3000);
    const remote = edited({ tags: ['work', 'personal'], version: 2 }, { tags: 1 }, 'device-B', 2000);
    const { merged } = mergeMetadata(local, remote);
    expect(new Set(merged.tags)).toEqual(new Set(['work', 'urgent', 'personal']));
  });

  it('delete wins over concurrent edit but is recoverable (soft-delete)', () => {
    const local = edited(
      { deleted: true, deletedAt: 3000, version: 2 },
      { deleted: 1, deletedAt: 1 },
      'device-A',
      3000,
    );
    const remote = edited({ title: 'Edited', version: 2 }, { title: 1 }, 'device-B', 2900);
    const { merged } = mergeMetadata(local, remote);
    expect(merged.deleted).toBe(true);
    expect(merged.deletedAt).not.toBeNull();
    // The concurrent title edit is on a different field, so it survives too.
    expect(merged.title).toBe('Edited');
  });

  it('is commutative for surviving values (device order independent)', () => {
    const a = edited({ title: 'A', pinned: true, version: 2 }, { title: 1, pinned: 1 }, 'device-A', 3000);
    const b = edited({ tags: ['x'], version: 2 }, { tags: 1 }, 'device-B', 2000);
    const ab = mergeMetadata(a, b).merged;
    const ba = mergeMetadata(b, a).merged;
    expect(ab.pinned).toBe(ba.pinned);
    expect(new Set(ab.tags)).toEqual(new Set(ba.tags));
    expect(ab.title).toBe(ba.title);
  });

  it('resulting version is monotonic (>= both inputs)', () => {
    const local = base({ version: 4 });
    const remote = base({ version: 7, clientId: 'device-B' });
    const { merged } = mergeMetadata(local, remote);
    expect(merged.version).toBeGreaterThanOrEqual(7);
  });
});
