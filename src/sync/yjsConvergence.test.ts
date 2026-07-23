/**
 * Tests that Yjs (our content-layer CRDT) converges losslessly when two
 * "devices" edit the same note offline and then exchange updates.
 *
 * This is the core guarantee of the sync design: concurrent offline edits to
 * note *content* never lose data and always converge to the same state on all
 * devices, regardless of the order updates are applied.
 *
 * We simulate devices with independent Y.Doc instances and exchange their
 * encoded updates (exactly what firestoreYProvider does over the wire).
 */
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

/** Sync two docs bidirectionally using state vectors (as a real provider would). */
function sync(a: Y.Doc, b: Y.Doc): void {
  const aToB = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
  const bToA = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
  Y.applyUpdate(b, aToB);
  Y.applyUpdate(a, bToA);
}

describe('Yjs content convergence (offline multi-device)', () => {
  it('merges concurrent edits to different parts of the text without loss', () => {
    const deviceA = new Y.Doc();
    const deviceB = new Y.Doc();

    // Both start from the same base state.
    deviceA.getText('content').insert(0, 'Hello world');
    sync(deviceA, deviceB);
    expect(deviceB.getText('content').toString()).toBe('Hello world');

    // Go offline. A edits the start, B edits the end — concurrently.
    deviceA.getText('content').insert(0, 'START: ');
    deviceB.getText('content').insert(deviceB.getText('content').length, ' END');

    // Come back online and exchange updates.
    sync(deviceA, deviceB);

    // Both converge to the SAME state, and BOTH edits survive.
    const finalA = deviceA.getText('content').toString();
    const finalB = deviceB.getText('content').toString();
    expect(finalA).toBe(finalB);
    expect(finalA).toContain('START:');
    expect(finalA).toContain('END');
    expect(finalA).toContain('Hello world');
  });

  it('converges regardless of update application order (commutative)', () => {
    const origin = new Y.Doc();
    origin.getText('content').insert(0, 'base');
    const seed = Y.encodeStateAsUpdate(origin);

    const a = new Y.Doc();
    const b = new Y.Doc();
    Y.applyUpdate(a, seed);
    Y.applyUpdate(b, seed);

    a.getText('content').insert(4, ' A-edit');
    b.getText('content').insert(0, 'B-edit ');

    const ua = Y.encodeStateAsUpdate(a);
    const ub = Y.encodeStateAsUpdate(b);

    // Apply in two different orders on two fresh docs.
    const order1 = new Y.Doc();
    Y.applyUpdate(order1, ua);
    Y.applyUpdate(order1, ub);

    const order2 = new Y.Doc();
    Y.applyUpdate(order2, ub);
    Y.applyUpdate(order2, ua);

    expect(order1.getText('content').toString()).toBe(order2.getText('content').toString());
  });

  it('applying the same update twice is idempotent (safe re-delivery)', () => {
    const doc = new Y.Doc();
    doc.getText('content').insert(0, 'idempotent');
    const update = Y.encodeStateAsUpdate(doc);

    const target = new Y.Doc();
    Y.applyUpdate(target, update);
    Y.applyUpdate(target, update); // duplicate delivery
    expect(target.getText('content').toString()).toBe('idempotent');
  });

  it('a snapshot + subsequent updates reconstruct the full state', () => {
    // Mirrors hydrateFromFirestore: apply latest snapshot then updates on top.
    const doc = new Y.Doc();
    doc.getText('content').insert(0, 'v1');
    const snapshot = Y.encodeStateAsUpdate(doc);

    doc.getText('content').insert(2, ' v2');
    const afterSnapshotUpdate = Y.encodeStateAsUpdate(doc, Y.encodeStateVector(new Y.Doc()));

    const rebuilt = new Y.Doc();
    Y.applyUpdate(rebuilt, snapshot);
    Y.applyUpdate(rebuilt, afterSnapshotUpdate);
    expect(rebuilt.getText('content').toString()).toBe('v1 v2');
  });
});
