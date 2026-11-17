// A folder listing may leave out an entry it could not read
// (`skipped`, files openapi FileListing), and the top folder (GET /?json) drops such entries without a word. A name
// missing from such a listing is not proved absent: no verdict that rests on an absence, and nothing frees a hold on
// it. A listing proves absence only when it is whole (`skipped` present and empty, never the top folder's).
import { describe, expect, it } from 'vitest';
import { folderOf, nameIn, rootListingOf } from './logic';
import { copyJudge, copyProved, deleteProved, mkdirProved, moveProved, presentAt, renameProved } from './plan';
import { manifestOf } from './tree';

const C = 'c1';
type E = { name: string; dir?: boolean; size?: number | null; modified?: number | null };
const rows = (entries: E[]) => entries.map((e) => ({ name: e.name, dir: e.dir ?? false, size: e.size ?? null, modified: e.modified ?? null, lossy: false }));
/** A listing as the folder reads give it: whole, cut (an entry skipped), or with no word on it at all. */
const whole = (path: string, entries: E[]) => ({ computer: C, path, entries: rows(entries), hidden: 0, whole: true });
const cut = (path: string, entries: E[]) => ({ computer: C, path, entries: rows(entries), hidden: 1, whole: false });
const bare = (path: string, entries: E[]) => ({ computer: C, path, entries: rows(entries) });
const H1 = 'a'.repeat(64);
const hash = (path: string, h: string) => ({ computer: C, path, hash: h });

describe('folderOf: a folder listing and whether it is whole', () => {
  const entry = { name: 'a.txt', is_dir: false, size: 3, modified: 1, type: 'file', mode: '644' };
  it('skipped present and empty: whole, nothing hidden', () => {
    expect(folderOf({ path: '/tmp', count: 1, skipped: [], entries: [entry] })).toEqual({ entries: [expect.objectContaining({ name: 'a.txt' })], hidden: 0, whole: true });
  });
  it('entries it could not read: hidden counts them, never whole', () => {
    const f = folderOf({ path: '/tmp', count: 1, skipped: [{ name: 'b', reason: 'unreadable', error: 'EACCES' }, { name: 'c', reason: 'unresolvable' }], entries: [entry] });
    expect(f).toEqual({ entries: [expect.objectContaining({ name: 'a.txt' })], hidden: 2, whole: false });
  });
  it('a lossy skipped name counts too', () => {
    expect(folderOf({ path: '/tmp', count: 0, skipped: [{ name: 'x�', name_lossy: true, name_bytes: 'eP8', reason: 'unreadable' }], entries: [] })?.hidden).toBe(1);
  });
  it('no skipped list (an older files program) is not a listing (no legacy shape)', () => {
    expect(folderOf({ path: '/tmp', count: 1, entries: [entry] })).toBeNull();
  });
  it('a skipped that is not a list, or a row without a name or a reason, is not a listing', () => {
    expect(folderOf({ path: '/tmp', count: 1, skipped: 0, entries: [entry] })).toBeNull();
    expect(folderOf({ path: '/tmp', count: 1, skipped: {}, entries: [entry] })).toBeNull();
    expect(folderOf({ path: '/tmp', count: 1, skipped: ['b'], entries: [entry] })).toBeNull();
    expect(folderOf({ path: '/tmp', count: 1, skipped: [{ name: 'b' }], entries: [entry] })).toBeNull();
    expect(folderOf({ path: '/tmp', count: 1, skipped: [{ reason: 'unreadable' }], entries: [entry] })).toBeNull();
    expect(folderOf({ path: '/tmp', count: 1, skipped: [{ name: 7, reason: 'unreadable' }], entries: [entry] })).toBeNull();
  });
  it('entries it cannot read are still not a listing', () => {
    expect(folderOf({ path: '/tmp', count: 1, skipped: [], entries: [{ name: 'a/b', is_dir: false }] })).toBeNull();
    expect(folderOf({ path: '/tmp', count: 1, skipped: [] })).toBeNull();
  });
});

describe('nameIn: the entry a listing shows, absent (whole only), or unknown', () => {
  it('shown on any listing; missing is absent on a whole one, unknown on a cut one or one with no word on it', () => {
    expect(nameIn({ entries: rows([{ name: 'a' }]), whole: false }, 'a')).toEqual(expect.objectContaining({ name: 'a' }));
    expect(nameIn({ entries: rows([]), whole: true }, 'a')).toBe('absent');
    expect(nameIn({ entries: rows([]), whole: false }, 'a')).toBe('unknown');
    expect(nameIn({ entries: rows([]) }, 'a')).toBe('unknown');
  });
});

describe('the top folder (GET /?json) is never whole', () => {
  it('even with every entry read: it drops the ones it cannot read without a word', () => {
    expect(rootListingOf({ kind: 'Index', paths: [{ name: 'home', path_type: 'Dir', size: 0, mtime: 1 }] })).toEqual({ entries: [expect.objectContaining({ name: 'home' })], hidden: 0, whole: false });
  });
});

describe('tree reads: no older-program shape', () => {
  it('a listing without its skipped list, or an entry without its type, is not a listing', () => {
    expect(manifestOf({ path: '/x', entries: [{ name: 'a', is_dir: false, size: 1, type: 'file' }] })).toBeNull();
    expect(manifestOf({ path: '/x', entries: [{ name: 'a', is_dir: false, size: 1 }], skipped: [] })).toBeNull();
    expect(manifestOf({ path: '/x', entries: [] })).toBeNull();
  });
});

describe('an absence proved only on a whole listing', () => {
  it('delete: the name missing from a cut listing is no verdict; whole: applied', () => {
    const id = { computer: C, path: '/home/a', dir: false, size: 10, modified: 1000 };
    expect(deleteProved(id, [[cut('/home', [])]])).toBeUndefined();
    expect(deleteProved(id, [[bare('/home', [])]])).toBeUndefined();
    expect(deleteProved(id, [[whole('/home', [])]])).toBe('applied');
    // Still there (version proof) needs no absence: a cut listing that shows it answers as before.
    expect(deleteProved(id, [[cut('/home', [{ name: 'a', size: 10, modified: 1000 }])]])).toBe('not_applied');
  });
  it('mkdir: the name missing from a cut listing is no verdict; whole: not applied', () => {
    const id = { computer: C, path: '/home/new' };
    expect(mkdirProved(id, [[cut('/home', [])]])).toBeUndefined();
    expect(mkdirProved(id, [[bare('/home', [])]])).toBeUndefined();
    expect(mkdirProved(id, [[whole('/home', [])]])).toBe('not_applied');
    expect(mkdirProved(id, [[cut('/home', [{ name: 'new', dir: true }])]])).toBe('applied');
  });
  it('a file copy: the destination missing from a cut listing is no verdict; whole: not applied', () => {
    const id = { kind: 'copy', computer: C, path: '/home/ada/notes.txt', dest: '/tmp/notes.txt', dir: false, size: 10, modified: 1000 };
    expect(copyProved(id, [[cut('/tmp', [])]])).toBeUndefined();
    expect(copyProved(id, [[bare('/tmp', [])]])).toBeUndefined();
    expect(copyProved(id, [[whole('/tmp', [])]])).toBe('not_applied');
    expect(copyProved(id, [[cut('/tmp', [{ name: 'notes.txt', size: 10 }]), hash('/tmp/notes.txt', H1), hash('/home/ada/notes.txt', H1)]])).toBe('applied');
  });
  it('a folder copy: the destination missing from a cut listing is no verdict; whole: not applied', () => {
    const id = { kind: 'copy', computer: C, path: '/srv/app', dest: '/tmp/app', dir: true, size: null, modified: 1000 };
    expect(copyJudge(id, [[cut('/tmp', [])]])).toEqual({ verdict: undefined });
    expect(copyJudge(id, [[bare('/tmp', [])]])).toEqual({ verdict: undefined });
    expect(copyJudge(id, [[whole('/tmp', [])]])).toEqual({ verdict: 'not_applied' });
  });
  it('rename: the old name missing from a cut listing is no "done"; the new one missing is no "not done"', () => {
    const id = { computer: C, path: '/home/a', to: 'b', dir: false, size: 10, modified: 1000 };
    expect(renameProved(id, [[cut('/home', [{ name: 'b', size: 10, modified: 1000 }])]])).toBeUndefined();
    expect(renameProved(id, [[cut('/home', [{ name: 'a', size: 10, modified: 1000 }])]])).toBeUndefined();
    expect(renameProved(id, [[bare('/home', [{ name: 'b', size: 10, modified: 1000 }])]])).toBeUndefined();
    expect(renameProved(id, [[whole('/home', [{ name: 'b', size: 10, modified: 1000 }])]])).toBe('applied');
    expect(renameProved(id, [[whole('/home', [{ name: 'a', size: 10, modified: 1000 }])]])).toBe('not_applied');
  });
  it('move: each end proves its own absence (the source for done, the destination for not done)', () => {
    const id = { kind: 'move', computer: C, path: '/home/ada/notes.txt', dest: '/tmp/notes.txt', dir: false, size: 10, modified: 1000 };
    const there = [{ name: 'notes.txt', size: 10, modified: 1000 }];
    expect(moveProved(id, [[cut('/home/ada', []), whole('/tmp', there)]])).toBeUndefined();
    expect(moveProved(id, [[whole('/home/ada', []), cut('/tmp', there)]])).toBe('applied');
    expect(moveProved(id, [[whole('/home/ada', there), cut('/tmp', [])]])).toBeUndefined();
    expect(moveProved(id, [[cut('/home/ada', there), whole('/tmp', [])]])).toBe('not_applied');
    expect(moveProved(id, [[whole('/home/ada', []), whole('/tmp', there)]])).toBe('applied');
    expect(moveProved(id, [[whole('/home/ada', there), whole('/tmp', [])]])).toBe('not_applied');
  });
  it('presentAt: a name shown is true on any listing; a name missing is false only on a whole one', () => {
    const id = { kind: 'copy', computer: C, path: '/home/ada/notes.txt', dest: '/tmp/notes.txt' };
    expect(presentAt(id, '/tmp/notes.txt', [[cut('/tmp', [{ name: 'notes.txt' }])]])).toBe(true);
    expect(presentAt(id, '/tmp/notes.txt', [[cut('/tmp', [])]])).toBeUndefined();
    expect(presentAt(id, '/tmp/notes.txt', [[bare('/tmp', [])]])).toBeUndefined();
    expect(presentAt(id, '/tmp/notes.txt', [[whole('/tmp', [])]])).toBe(false);
  });
});

describe('a top-level item: its folder is the top folder, never whole', () => {
  const top = (entries: E[]) => ({ computer: C, path: '/', entries: rows(entries), hidden: 0, whole: false });
  it('no absence verdict for a delete, a mkdir, a copy or a move at /', () => {
    expect(deleteProved({ computer: C, path: '/a', dir: false, size: 1, modified: 1 }, [[top([])]])).toBeUndefined();
    expect(mkdirProved({ computer: C, path: '/new' }, [[top([])]])).toBeUndefined();
    expect(copyProved({ kind: 'copy', computer: C, path: '/srv/x', dest: '/x', dir: false }, [[top([])]])).toBeUndefined();
    expect(copyJudge({ kind: 'copy', computer: C, path: '/srv/app', dest: '/app', dir: true }, [[top([])]])).toEqual({ verdict: undefined });
    expect(moveProved({ kind: 'move', computer: C, path: '/x', dest: '/tmp/x', dir: false, size: 1, modified: 1 }, [[top([]), whole('/tmp', [{ name: 'x', size: 1, modified: 1 }])]])).toBeUndefined();
  });
  it('what it shows still proves presence', () => {
    expect(mkdirProved({ computer: C, path: '/new' }, [[top([{ name: 'new', dir: true }])]])).toBe('applied');
    expect(deleteProved({ computer: C, path: '/a', dir: false, size: 1, modified: 1 }, [[top([{ name: 'a', size: 1, modified: 1 }])]])).toBe('not_applied');
  });
});
