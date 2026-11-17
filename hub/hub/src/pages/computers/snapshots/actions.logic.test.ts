// The pure rules behind restore, rename and keep-for: what a label and a number of days may be, what proves
// a restore or a rename after a lost answer, and what the list read keeps of a snapshot.
import { describe, expect, it } from 'vitest';
import { snapshotsTable } from './data';
import { cleanExpiry, cleanLabel, snapshotRenamedProved, snapshotRestoredProved, snapshotsOf, type SnapshotList } from './logic';
import { snapshotRoutes } from './routes';

const X = 'x'.repeat(24);
const list = (items: Array<{ name: string; alias?: string | null; lastUsedAt?: string | null }>, o: Partial<SnapshotList> = {}): SnapshotList => ({
  id: X, count: items.length, max: 10, listed: true, complete: true,
  items: items.map((i) => ({ name: i.name, alias: i.alias ?? null, createdAt: '', lastUsedAt: i.lastUsedAt ?? null, expiresAt: null, stateful: false, size: null })),
  ...o,
});

describe('a label (the API alias)', () => {
  it('empty removes it; otherwise it is trimmed, at most 100 long, with nothing hidden', () => {
    expect(cleanLabel('')).toBeNull();
    expect(cleanLabel('   ')).toBeNull();
    expect(cleanLabel('  pre deploy ')).toBe('pre deploy');
    expect(cleanLabel('a'.repeat(100))).toBe('a'.repeat(100));
    // characters, not UTF-16 units: 100 emoji are 100 characters (the API counts code points), 101 are too many
    expect(cleanLabel('\u{1F680}'.repeat(100))).toBe('\u{1F680}'.repeat(100));
    expect(cleanLabel('\u{1F680}'.repeat(101))).toBeUndefined();
    expect(cleanLabel('a'.repeat(101))).toBeUndefined();
    // The API's own policy: a soft hyphen is refused; ZWNJ (Persian), a variation selector and an emoji flag are not.
    expect(cleanLabel('pre\u00addeploy')).toBeUndefined();
    expect(cleanLabel('می\u200cخواهم')).toBe('می\u200cخواهم');
    expect(cleanLabel('ok \u2764\ufe0f')).toBe('ok \u2764\ufe0f');
    expect(cleanLabel('\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F} flag')).toBeTruthy();
    for (const bad of ['\u{E0067}x', 'a\u2060b', 'a\u3164b', 'a\ue000b', 'a​b', 'a\tb', 'a\nb', 'a b', 'a‮b', 'a\u0000b', 'a　b']) expect(cleanLabel(bad)).toBeUndefined();
  });
});

describe('days to keep a snapshot', () => {
  it('empty sends none; otherwise a whole number from 1 to 3650', () => {
    expect(cleanExpiry('')).toBeNull();
    expect(cleanExpiry(' 30 ')).toBe(30);
    expect(cleanExpiry('1')).toBe(1);
    expect(cleanExpiry('3650')).toBe(3650);
    for (const bad of ['0', '3651', '-1', '1.5', 'x', '1e3', '12345', '+5']) expect(cleanExpiry(bad)).toBeUndefined();
  });
});

describe('the list read keeps what a snapshot row shows', () => {
  it('reads last_used_at and stateful, with none and false when the API gives none', () => {
    const l = snapshotsOf({ data: { snapshots: [{ name: 'a', created_at: '2026-01-01T00:00:00Z', last_used_at: '2026-02-01T00:00:00Z', stateful: true }, { name: 'b', created_at: '2026-01-02T00:00:00Z', last_used_at: null }] } }, X);
    expect(l.items.find((i) => i.name === 'a')).toMatchObject({ lastUsedAt: '2026-02-01T00:00:00Z', stateful: true });
    expect(l.items.find((i) => i.name === 'b')).toMatchObject({ lastUsedAt: null, stateful: false });
  });
});

describe('what proves a restore', () => {
  const id = { computer: X, name: 'a', before: null as string | null };
  it('a last_used_at that is set and different from the one sent against', () => {
    expect(snapshotRestoredProved(id, [[list([{ name: 'a', lastUsedAt: '2026-10-25T08:00:00Z' }])]])).toBe('applied');
    expect(snapshotRestoredProved({ ...id, before: '2026-10-21T10:00:00Z' }, [[list([{ name: 'a', lastUsedAt: '2026-10-25T08:00:00Z' }])]])).toBe('applied');
  });
  it('an unmoved or missing last_used_at, another snapshot, another computer or a missing identity prove nothing', () => {
    expect(snapshotRestoredProved(id, [[list([{ name: 'a' }])]])).toBeUndefined();
    expect(snapshotRestoredProved({ ...id, before: '2026-10-21T10:00:00Z' }, [[list([{ name: 'a', lastUsedAt: '2026-10-21T10:00:00Z' }])]])).toBeUndefined();
    expect(snapshotRestoredProved(id, [[list([{ name: 'b', lastUsedAt: '2026-10-25T08:00:00Z' }])]])).toBeUndefined();
    expect(snapshotRestoredProved(id, [[list([{ name: 'a', lastUsedAt: '2026-10-25T08:00:00Z' }], { id: 'y'.repeat(24) })]])).toBeUndefined();
    expect(snapshotRestoredProved(id, [[]])).toBeUndefined();
    expect(snapshotRestoredProved({ computer: X }, [[list([{ name: 'a', lastUsedAt: '2026-10-25T08:00:00Z' }])]])).toBeUndefined();
    expect(snapshotRestoredProved(undefined, [[list([])]])).toBeUndefined();
  });
});

describe('what proves a rename', () => {
  const id = { computer: X, name: 'a', alias: 'new' as string | null };
  it('the snapshot carries exactly the sent label, or none when it was removed', () => {
    expect(snapshotRenamedProved(id, [[list([{ name: 'a', alias: 'new' }])]])).toBe('applied');
    expect(snapshotRenamedProved({ ...id, alias: null }, [[list([{ name: 'a', alias: null }])]])).toBe('applied');
  });
  it('the old label, another snapshot, an incomplete list or a missing identity prove nothing', () => {
    expect(snapshotRenamedProved(id, [[list([{ name: 'a', alias: 'old' }])]])).toBeUndefined();
    expect(snapshotRenamedProved(id, [[list([{ name: 'b', alias: 'new' }])]])).toBeUndefined();
    expect(snapshotRenamedProved(id, [[list([{ name: 'a', alias: 'new' }], { complete: false })]])).toBeUndefined();
    expect(snapshotRenamedProved({ computer: X, name: 'a' }, [[list([{ name: 'a', alias: null }])]])).toBeUndefined();
    expect(snapshotRenamedProved({ ...id, alias: null }, [[list([{ name: 'a', alias: 'old' }])]])).toBeUndefined();
  });
});

describe('what each change sends', () => {
  const c = snapshotsTable.changes!;
  const body = (k: string, v: unknown) => (c[k]!.input as (v: unknown) => { body?: unknown; params?: unknown })(v);
  it('restore is one bodyless-object PATCH of the named snapshot; rename sends the alias; take adds expiry only when given', () => {
    expect(c.restore!.route).toBe(snapshotRoutes.restore);
    expect(body('restore', { id: X, name: 'a', before: null })).toEqual({ params: { id: X, name: 'a' }, body: {} });
    expect(c.rename!.route).toBe(snapshotRoutes.rename);
    expect(body('rename', { id: X, name: 'a', alias: null })).toEqual({ params: { id: X, name: 'a' }, body: { alias: null } });
    expect(body('take', { id: X, name: 'n' })).toStrictEqual({ params: { id: X }, body: { alias: 'n' } });
    expect(body('take', { id: X, name: 'n', expiry: 7 })).toEqual({ params: { id: X }, body: { alias: 'n', expiry: 7 } });
  });
  it('a restore is held under its own lock with the last_used_at it was sent against', () => {
    expect(c.restore!.lock).toBe('computer.snapshot_restore');
    expect((c.restore!.identity as (v: unknown) => unknown)({ id: X, name: 'a', before: 'T' })).toEqual({ computer: X, name: 'a', before: 'T' });
    expect(c.rename!.lock).toBe('computer.snapshot_rename');
  });
});

describe('a restore is proved only by a complete list of that computer', () => {
  const id = { computer: X, name: 'a', before: null as string | null };
  const moved = [{ name: 'a', lastUsedAt: '2026-10-25T08:00:00.000Z' }];
  it('a moved timestamp in a complete list proves it', () => {
    expect(snapshotRestoredProved(id, [[list(moved)]])).toBe('applied');
  });
  it('an incomplete list (an unreadable row), another computer\'s list, or an unmoved timestamp proves nothing', () => {
    expect(snapshotRestoredProved(id, [[list(moved, { complete: false })]])).toBeUndefined();
    expect(snapshotRestoredProved(id, [[list(moved, { id: 'y'.repeat(24) })]])).toBeUndefined();
    expect(snapshotRestoredProved({ ...id, before: '2026-10-25T08:00:00.000Z' }, [[list(moved)]])).toBeUndefined();
    expect(snapshotRestoredProved(id, [[list([{ name: 'a' }])]])).toBeUndefined();
  });
});

describe('the locks that keep a change from being sent twice', () => {
  const t = snapshotsTable.changes!;
  it('one restore per computer: another snapshot or another baseline is the same lock, and the identity keeps the proof data', () => {
    const a = t.restore!;
    expect(a.lockKey!({ id: X, name: 'a', before: null })).toEqual(a.lockKey!({ id: X, name: 'b', before: '2026-10-25T08:00:00.000Z' }));
    expect(a.lockKey!({ id: X, name: 'a', before: null })).not.toEqual(a.lockKey!({ id: 'y'.repeat(24), name: 'a', before: null }));
    expect(a.identity!({ id: X, name: 'a', before: 'T' })).toEqual({ computer: X, name: 'a', before: 'T' });
  });
  it('one rename per snapshot, whatever label each tab typed', () => {
    const a = t.rename!;
    expect(a.lockKey!({ id: X, name: 'a', alias: 'one' })).toEqual(a.lockKey!({ id: X, name: 'a', alias: 'two' }));
    expect(a.lockKey!({ id: X, name: 'a', alias: 'one' })).not.toEqual(a.lockKey!({ id: X, name: 'b', alias: 'one' }));
    expect(a.identity!({ id: X, name: 'a', alias: 'one' })).toEqual({ computer: X, name: 'a', alias: 'one' });
  });
});
