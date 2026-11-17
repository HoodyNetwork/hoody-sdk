// The snapshots feature's pure rules: names the API keeps whole, the list answer, and the proofs.
import { describe, expect, it } from 'vitest';
import { snapshotsTable } from './data';
import { copyNameFrom, countOf, defaultSnapName, freeName, snapshotGoneProved, snapshotProved, snapshotsOf, validSnapName } from './logic';

const X = 'x'.repeat(24);
const P = 'p'.repeat(24);

describe('snapshot names', () => {
  it('accepts only names the API keeps as sent (2..64, no edge - or _)', () => {
    expect(validSnapName('ab')).toBe(true);
    expect(validSnapName('pre-deploy_2')).toBe(true);
    expect(validSnapName('a')).toBe(false);
    expect(validSnapName('-lead')).toBe(false);
    expect(validSnapName('trail_')).toBe(false);
    expect(validSnapName('has space')).toBe(false);
    expect(validSnapName('a'.repeat(64))).toBe(true);
    expect(validSnapName('a'.repeat(65))).toBe(false);
  });
  it('suggests snap-YYYYMMDD-HHMM in UTC, with a suffix when taken', () => {
    const n = defaultSnapName(new Date(Date.UTC(2026, 9, 4, 7, 5)));
    expect(n).toBe('snap-20261004-0705');
    expect(validSnapName(n)).toBe(true);
    const taken = [{ name: n, alias: null, createdAt: '', lastUsedAt: null, expiresAt: null, stateful: false, size: null }, { name: 'x', alias: `${n}-2`, createdAt: '', lastUsedAt: null, expiresAt: null, stateful: false, size: null }];
    expect(freeName(n, taken)).toBe(`${n}-3`);
    expect(freeName('free', taken)).toBe('free');
  });
  it('a computer name from a snapshot stays within 100 characters and never ends in - or _', () => {
    expect(copyNameFrom('atlas', 'before')).toBe('atlas-before');
    const long = copyNameFrom('a'.repeat(98), 'snap');
    expect(long.length).toBeLessThanOrEqual(100);
    expect(long.endsWith('-')).toBe(false);
  });
});

describe('the list answer', () => {
  it('reads count, cap and rows newest first, leaving out rows without a name', () => {
    const l = snapshotsOf({ data: { snapshot_count: 3, max_snapshots: 10, snapshots: [
      { name: 'old', created_at: '2026-01-01T00:00:00Z', size: 5 },
      { name: 'new', alias: 'New one', created_at: '2026-02-01T00:00:00Z', expires_at: '2026-03-01T00:00:00Z' },
      { alias: 'nameless' },
    ] } }, X);
    expect(l).toMatchObject({ id: X, count: 3, max: 10 });
    expect(l.items.map((s) => s.name)).toEqual(['new', 'old']);
    expect(l.items[0]).toMatchObject({ alias: 'New one', expiresAt: '2026-03-01T00:00:00Z', size: null });
    expect(snapshotsOf({ data: { snapshots: [] , max_snapshots: null } }, X)).toMatchObject({ count: 0, max: null });
    expect(snapshotsOf(null, X).items).toEqual([]);
  });
  it('the row count comes from snapshot_count only', () => {
    expect(countOf({ snapshot_count: 4 })).toBe(4);
    expect(countOf({ snapshot_count: '4' })).toBeNull();
    expect(countOf({})).toBeNull();
  });
});

describe('proofs', () => {
  const list = (id: string, ...names: string[]) => ({ id, count: names.length, max: 10, listed: true, complete: true, items: names.map((name) => ({ name, alias: null, createdAt: '', lastUsedAt: null, expiresAt: null, stateful: false, size: null })) });
  it('a take is proved only by that computer\'s list showing the sent name', () => {
    const id = { computer: X, name: 'lost', fresh: true };
    expect(snapshotProved(id, [[list(X, 'other')]])).toBeUndefined();
    expect(snapshotProved(id, [[list('y'.repeat(24), 'lost')]])).toBeUndefined();
    expect(snapshotProved(id, [])).toBeUndefined();
    expect(snapshotProved({ computer: X }, [[list(X, 'lost')]])).toBeUndefined();
    expect(snapshotProved(id, [[list(X, 'other', 'lost')]])).toBe('applied');
  });
  it('a take sent without a fresh read lacking its name is never proved by the name (it may be an older snapshot)', () => {
    expect(snapshotProved({ computer: X, name: 'lost' }, [[list(X, 'lost')]])).toBeUndefined();
    expect(snapshotProved({ computer: X, name: 'lost', fresh: false }, [[list(X, 'lost')]])).toBeUndefined();
  });
  it('a delete is proved only by that computer\'s list without the sent name', () => {
    const id = { computer: X, name: 'old' };
    expect(snapshotGoneProved(id, [[list(X, 'old', 'other')]])).toBeUndefined();
    expect(snapshotGoneProved(id, [[list('y'.repeat(24))]])).toBeUndefined();
    expect(snapshotGoneProved(id, [])).toBeUndefined();
    expect(snapshotGoneProved({ computer: X }, [[list(X)]])).toBeUndefined();
    expect(snapshotGoneProved(id, [[list(X, 'other')]])).toBe('applied');
    // A malformed or partly unreadable answer proves nothing.
    for (const raw of [{ data: {} }, { data: { snapshots: null } }, { data: { snapshots: [{ alias: 'old' }] } }, { data: { computer_id: 'y'.repeat(24), snapshots: [] } }, null]) {
      expect(snapshotGoneProved(id, [[snapshotsOf(raw, X)]])).toBeUndefined();
    }
    expect(snapshotGoneProved(id, [[snapshotsOf({ data: { computer_id: X, snapshots: [{ name: 'other' }] } }, X)]])).toBe('applied');
  });
  it('a computer from a snapshot is proved only by a new computer of its name in the sent project, on the sent server', () => {
    const ch = snapshotsTable.changes!.copyFrom!;
    const proves = (identity: unknown, rows: Array<Record<string, unknown>>) => ch.proves!(identity, [[rows]] as never);
    const Y = 'y'.repeat(24);
    const Z = 'z'.repeat(24);
    const id = ch.identity!({ id: X, snapshot: 's', name: 'atlas-s', project: P, server: 'v1', before: [], realm: 'all' } as never);
    expect(id).toEqual({ computer: X, snapshot: 's', name: 'atlas-s', project: P, before: [], realm: 'all', server: 'v1' });
    expect(proves(id, [{ id: Y, name: 'atlas-s', project_id: 'q'.repeat(24), server_id: 'v1' }])).toBeUndefined();
    expect(proves(id, [{ id: Y, name: 'atlas', project_id: P, server_id: 'v1' }])).toBeUndefined();
    expect(proves({ name: 'atlas-s' }, [{ id: Y, name: 'atlas-s', project_id: P, server_id: 'v1' }])).toBeUndefined();
    expect(proves(id, [{ id: Y, name: 'atlas-s', project_id: P, server_id: 'v1' }])).toBe('applied');
    // The same row on another server proves nothing (the API puts the copy on the server sent).
    expect(proves(id, [{ id: Y, name: 'atlas-s', project_id: P, server_id: 'v2' }])).toBeUndefined();
    // A copy to a name its project already held (Y, in the list at the press): the API answers 409, and the read-back
    // that shows Y again proves nothing; a new row does.
    const taken = ch.identity!({ id: X, snapshot: 's', name: 'atlas-s', project: P, server: 'v1', before: [Y], realm: 'all' } as never);
    expect(proves(taken, [{ id: Y, name: 'atlas-s', project_id: P, server_id: 'v1' }])).toBeUndefined();
    expect(proves(taken, [{ id: Y, name: 'atlas-s', project_id: P, server_id: 'v1' }, { id: Z, name: 'atlas-s', project_id: P, server_id: 'v1' }])).toBe('applied');
    // Sent in realm R: another realm's same-name row (an All-realms read) proves nothing; the new one is put in R.
    const R = 'a'.repeat(24);
    const inR = ch.identity!({ id: X, snapshot: 's', name: 'atlas-s', project: P, server: 'v1', before: [], realm: R } as never);
    expect(proves(inR, [{ id: Y, name: 'atlas-s', project_id: P, server_id: 'v1', realm_ids: ['b'.repeat(24)] }])).toBeUndefined();
    expect(proves(inR, [{ id: Y, name: 'atlas-s', project_id: P, server_id: 'v1' }])).toBeUndefined();
    expect(proves(inR, [{ id: Y, name: 'atlas-s', project_id: P, server_id: 'v1', realm_ids: [R] }])).toBe('applied');
    // No `before` (no list at the press), no realm, no server, or an identity an earlier build kept: nothing proves it.
    expect(proves(ch.identity!({ id: X, snapshot: 's', name: 'atlas-s', project: P, server: 'v1', realm: 'all' } as never), [{ id: Y, name: 'atlas-s', project_id: P, server_id: 'v1' }])).toBeUndefined();
    expect(proves({ computer: X, snapshot: 's', name: 'atlas-s', project: P, before: [] }, [{ id: Y, name: 'atlas-s', project_id: P, server_id: 'v1' }])).toBeUndefined();
    expect(proves({ computer: X, snapshot: 's', name: 'atlas-s', project: P, before: [], realm: 'all' }, [{ id: Y, name: 'atlas-s', project_id: P, server_id: 'v1' }])).toBeUndefined();
    expect(proves({ computer: X, snapshot: 's', name: 'atlas-s', project: P }, [{ id: Y, name: 'atlas-s', project_id: P, server_id: 'v1' }])).toBeUndefined();
    // A row with no id proves nothing.
    expect(proves(id, [{ name: 'atlas-s', project_id: P, server_id: 'v1' }])).toBeUndefined();
  });
  it('both changes are locked per computer and read back, never resent', () => {
    const ch = snapshotsTable.changes!;
    expect(ch.take!.lock).toBe('computer.snapshot');
    expect(ch.take!.reads).toEqual(['snapshots']);
    expect(ch.copyFrom!.lock).toBe('computer.copy_snapshot');
    expect(ch.copyFrom!.reads).toEqual(['snapRows']);
    expect(ch.take!.lockKey!({ id: X, name: 'n' } as never)).toEqual({ computer: X, name: 'n' });
  });
});
