// Vitest: the folder copy's tree walk and tree compare (tree.ts), pure.
import { describe, expect, it } from 'vitest';
import { compareTrees, manifestOf, walkTree, WALK_MAX_ENTRIES, WALK_MAX_FOLDERS, type Manifest, type Walked } from './tree';

const f = (name: string, size: number, more: Record<string, unknown> = {}) => ({ name, is_dir: false, size, modified: 1, type: 'file', ...more });
const d = (name: string) => ({ name, is_dir: true, size: 0, modified: 1, type: 'dir' });
const raw = (entries: unknown[], skipped: unknown[] = []) => ({ path: '/x', entries, count: entries.length, skipped });
const man = (entries: unknown[], skipped: unknown[] = []): Manifest => {
  const m = manifestOf(raw(entries, skipped));
  if (!m) throw new Error('bad fixture');
  return m;
};

describe('manifestOf', () => {
  it('reads each entry\'s own type, size and lossy flag, and counts what the listing could not read', () => {
    const m = manifestOf(raw([f('a.txt', 3), d('sub'), { name: 'l', is_dir: false, size: 0, type: 'symlink', target: '/etc' }, { name: 'p', is_dir: false, size: 0, type: 'fifo' }, f('caf�', 1, { name_lossy: true })], [{ name: 'x', reason: 'unreadable' }]));
    expect(m).toEqual({
      entries: [
        { name: 'a.txt', type: 'file', size: 3, lossy: false },
        { name: 'sub', type: 'dir', size: 0, lossy: false },
        { name: 'l', type: 'symlink', size: 0, lossy: false, target: '/etc' },
        { name: 'p', type: 'fifo', size: 0, lossy: false },
        { name: 'caf�', type: 'file', size: 1, lossy: true },
      ],
      skipped: 1,
    });
  });
  it('an older files program (no type on an entry, or no skipped list) is not a listing: no legacy shape', () => {
    expect(manifestOf({ path: '/x', entries: [{ name: 'a', is_dir: false, size: 1 }], skipped: [] })).toBeNull();
    expect(manifestOf({ path: '/x', entries: [f('a', 1)] })).toBeNull();
    expect(manifestOf({ path: '/x', entries: [] })).toBeNull();
    expect(manifestOf({ path: '/x', entries: [], skipped: [{ name: 'x' }] })).toBeNull();
  });
  it('a type it does not know reads as one it will not copy (unknown), never as a file', () => {
    expect(manifestOf(raw([{ name: 'q', is_dir: false, size: 9, type: 'door' }]))).toEqual({ entries: [{ name: 'q', type: 'unknown', size: 9, lossy: false }], skipped: 0 });
  });
  it('anything that is not a listing, or an entry it cannot read, is null: never a shorter tree', () => {
    expect(manifestOf(null)).toBeNull();
    expect(manifestOf({ entries: 'x', skipped: [] })).toBeNull();
    expect(manifestOf(raw([{ name: '', is_dir: false, size: 1, type: 'file' }]))).toBeNull();
    expect(manifestOf(raw([{ name: 'a/b', is_dir: false, size: 1, type: 'file' }]))).toBeNull();
    expect(manifestOf(raw([{ name: 'a', is_dir: 'no', size: 1, type: 'file' }]))).toBeNull();
    expect(manifestOf(raw([{ name: 'a', is_dir: false, size: -1, type: 'file' }]))).toBeNull();
    expect(manifestOf(raw([{ name: 'a', is_dir: false, type: 'file' }]))).toBeNull();
    expect(manifestOf(raw([{ name: '__proto__', is_dir: false, size: 1, type: 'toString' }]))).toEqual({ entries: [{ name: '__proto__', type: 'unknown', size: 1, lossy: false }], skipped: 0 });
  });
});

// A source tree /s and where it goes, /t/s.
const SRC: Record<string, Manifest> = {
  '/s': man([f('a.txt', 3), d('sub'), { name: 'link', is_dir: false, size: 0, type: 'symlink', target: 'a.txt' }, { name: 'pipe', is_dir: false, size: 0, type: 'fifo' }]),
  '/s/sub': man([f('b.bin', 10), d('empty')]),
  '/s/sub/empty': man([]),
};
const at = (t: Record<string, Manifest | 'failed'>) => (p: string) => t[p];

describe('walkTree', () => {
  it('walks the whole tree: folders, files with sizes, links, and what is left out (pipes, sockets, devices)', () => {
    expect(walkTree('/s', '/t/s', at(SRC))).toEqual({
      state: 'done',
      dirs: ['', 'sub', 'sub/empty'],
      files: [{ rel: 'a.txt', size: 3 }, { rel: 'sub/b.bin', size: 10 }],
      links: [{ rel: 'link', target: 'a.txt' }],
      opaque: [],
      left: ['pipe'],
    });
  });
  it('a folder not read yet: reading, naming every folder still needed', () => {
    expect(walkTree('/s', '/t/s', at({ '/s': SRC['/s']! }))).toEqual({ state: 'reading', need: ['/s/sub'] });
    expect(walkTree('/s', '/t/s', at({}))).toEqual({ state: 'reading', need: ['/s'] });
  });
  it('a failed read fails the walk', () => {
    expect(walkTree('/s', '/t/s', at({ ...SRC, '/s/sub': 'failed' }))).toEqual({ state: 'failed' });
  });
  it('an entry the listing could not read refuses it: the copy would stop part way', () => {
    expect(walkTree('/s', '/t/s', at({ ...SRC, '/s/sub': man([f('b.bin', 10)], [{ name: 'x', reason: 'unreadable' }]) }))).toEqual({ state: 'refused', why: 'unreadable' });
  });
  it('names the Hub cannot read back (lossy, or one core cannot address) refuse it, at either end', () => {
    expect(walkTree('/s', '/t/s', at({ ...SRC, '/s/sub/empty': man([f('caf�', 1, { name_lossy: true })]) }))).toEqual({ state: 'refused', why: 'names' });
    // The program's own flag is enough, even when the name it shows reads as plain text.
    expect(walkTree('/s', '/t/s', at({ ...SRC, '/s/sub/empty': man([f('cafe', 1, { name_lossy: true })]) }))).toEqual({ state: 'refused', why: 'names' });
    expect(walkTree('/s', '/t/s', at({ ...SRC, '/s/sub/empty': man([f('50%', 1)]) }))).toEqual({ state: 'refused', why: 'names' });
    expect(walkTree('/s', '/t/s', at({ ...SRC, '/s/sub/empty': man([d('x'.repeat(257))]) }))).toEqual({ state: 'refused', why: 'names' });
  });
  it('a path past the deepest folder core can read, at the source or the destination, refuses it (deep)', () => {
    const deepSrc = { '/a/b/c/d/e/f/g/h': man([d('i')]) };
    expect(walkTree('/a/b/c/d/e/f/g/h', '/t/h', at(deepSrc))).toEqual({ state: 'refused', why: 'deep' });
    // The same tree copied higher up fits at the destination, but not at the source.
    expect(walkTree('/s', '/t/u/v/w/x/y/z/s', at(SRC))).toEqual({ state: 'refused', why: 'deep' });
  });
  it('a name the Hub cannot read back outranks depth, wherever it sits', () => {
    expect(walkTree('/a/b/c/d/e/f/g/h', '/t/h', at({ '/a/b/c/d/e/f/g/h': man([f('50%', 1)]) }))).toEqual({ state: 'refused', why: 'names' });
  });
  it('a type the Hub does not know is left out, like a pipe (the files program does not copy it)', () => {
    expect(walkTree('/s', '/t/s', at({ ...SRC, '/s/sub/empty': man([{ name: 'q', is_dir: false, size: 4, type: 'door' }]) }))).toMatchObject({ state: 'done', files: [{ rel: 'a.txt', size: 3 }, { rel: 'sub/b.bin', size: 10 }], left: ['pipe', 'sub/empty/q'] });
  });
  it('a special file needs no address (it is not copied); a file deeper than core reads does', () => {
    expect(walkTree('/s', '/t/s', at({ ...SRC, '/s/sub/empty': man([{ name: '50%', is_dir: false, size: 0, type: 'socket' }]) }))).toMatchObject({ state: 'done', left: ['pipe', 'sub/empty/50%'] });
  });
  it('over 2,000 entries or 200 folders is too big, said as soon as it is known', () => {
    const many = (n: number) => man(Array.from({ length: n }, (_, i) => f(`f${i}`, 1)));
    // The folder itself is one of the 2,000.
    expect(walkTree('/s', '/t/s', at({ '/s': many(WALK_MAX_ENTRIES - 1) }))).toMatchObject({ state: 'done' });
    expect(walkTree('/s', '/t/s', at({ '/s': many(WALK_MAX_ENTRIES) }))).toEqual({ state: 'refused', why: 'big' });
    // Folders: 200 is the bound, counting the folder itself; the 201st refuses it before it is read.
    const dirs = (n: number) => man(Array.from({ length: n }, (_, i) => d(`d${i}`)));
    const wide = (n: number) => ({ '/s': dirs(n), ...Object.fromEntries(Array.from({ length: n }, (_, i) => [`/s/d${i}`, man([])])) });
    expect(walkTree('/s', '/t/s', at(wide(WALK_MAX_FOLDERS - 1)))).toMatchObject({ state: 'done' });
    expect(walkTree('/s', '/t/s', at({ '/s': dirs(WALK_MAX_FOLDERS) }))).toEqual({ state: 'refused', why: 'big' });
  });
  it('big beats reading: what is known already refuses it', () => {
    const many = man([d('sub'), ...Array.from({ length: WALK_MAX_ENTRIES }, (_, i) => f(`f${i}`, 1))]);
    expect(walkTree('/s', '/t/s', at({ '/s': many }))).toEqual({ state: 'refused', why: 'big' });
  });
});

const W = walkTree('/s', '/t/s', at(SRC)) as Walked & { state: 'done' };
const DEST: Record<string, Manifest> = {
  '/t/s': man([f('a.txt', 3), d('sub'), { name: 'link', is_dir: false, size: 0, type: 'symlink', target: 'a.txt' }]),
  '/t/s/sub': man([f('b.bin', 10), d('empty')]),
  '/t/s/sub/empty': man([]),
};
const hashes = (over: Record<string, string> = {}) => (p: string) => ({ '/s/a.txt': 'h1', '/t/s/a.txt': 'h1', '/s/sub/b.bin': 'h2', '/t/s/sub/b.bin': 'h2', ...over } as Record<string, string>)[p];

describe('compareTrees', () => {
  it('every folder, file (size, then SHA-256) and link there: equal', () => {
    expect(compareTrees('/s', '/t/s', W, at(DEST), hashes())).toEqual({ state: 'equal' });
  });
  it('sizes first: equal sizes need both SHA-256 reads (reading names them); nothing missing yet', () => {
    expect(compareTrees('/s', '/t/s', W, at(DEST), () => undefined)).toEqual({ state: 'reading', folders: [], hashes: ['/s/a.txt', '/t/s/a.txt', '/s/sub/b.bin', '/t/s/sub/b.bin'] });
  });
  it('a destination folder not read yet: reading, before any SHA-256 is asked for', () => {
    expect(compareTrees('/s', '/t/s', W, at({ '/t/s': DEST['/t/s']! }), hashes())).toEqual({ state: 'reading', folders: ['/t/s/sub'], hashes: [] });
  });
  it('missing items count, a missing folder with everything under it (no read of what is not there)', () => {
    const cut = { '/t/s': man([f('a.txt', 3)]) };
    // sub, sub/b.bin, sub/empty and link are missing; the pipe was never copied.
    expect(compareTrees('/s', '/t/s', W, at(cut), hashes())).toEqual({ state: 'differs', count: 4, missing: ['sub', 'link'], different: [] });
  });
  it('a different size or type is different, without reading any SHA-256', () => {
    const odd = { ...DEST, '/t/s': man([f('a.txt', 2), d('sub'), f('link', 0)]) };
    expect(compareTrees('/s', '/t/s', W, at(odd), hashes())).toEqual({ state: 'differs', count: 2, missing: [], different: ['a.txt', 'link'] });
    const fileForFolder = { ...DEST, '/t/s': man([f('a.txt', 3), f('sub', 0), { name: 'link', is_dir: false, size: 0, type: 'symlink', target: 'a.txt' }]) };
    expect(compareTrees('/s', '/t/s', W, at(fileForFolder), hashes())).toEqual({ state: 'differs', count: 3, missing: [], different: ['sub'] });
    // Something else with the file's name and size is not the file.
    const linkForFile = { ...DEST, '/t/s': man([{ name: 'a.txt', is_dir: false, size: 3, type: 'symlink' }, d('sub'), { name: 'link', is_dir: false, size: 0, type: 'symlink', target: 'a.txt' }]) };
    expect(compareTrees('/s', '/t/s', W, at(linkForFile), hashes())).toEqual({ state: 'differs', count: 1, missing: [], different: ['a.txt'] });
  });
  it('a count is given only once every file there with the same size is hashed: missing and other bytes add up', () => {
    const cut = { ...DEST, '/t/s': man([d('sub'), { name: 'link', is_dir: false, size: 0, type: 'symlink', target: 'a.txt' }]) };
    expect(compareTrees('/s', '/t/s', W, at(cut), () => undefined)).toEqual({ state: 'reading', folders: [], hashes: ['/s/sub/b.bin', '/t/s/sub/b.bin'] });
    expect(compareTrees('/s', '/t/s', W, at(cut), hashes({ '/t/s/sub/b.bin': 'zz' }))).toEqual({ state: 'differs', count: 2, missing: ['a.txt'], different: ['sub/b.bin'] });
  });
  it('a link is there only with the same target text', () => {
    const other = { ...DEST, '/t/s': man([f('a.txt', 3), d('sub'), { name: 'link', is_dir: false, size: 0, type: 'symlink', target: 'sub/b.bin' }]) };
    expect(compareTrees('/s', '/t/s', W, at(other), hashes())).toEqual({ state: 'differs', count: 1, missing: [], different: ['link'] });
  });
  it('a link target the Hub cannot compare (redacted, lossy, not given) leaves the copy unchecked, never equal', () => {
    const dest = (more: Record<string, unknown>) => ({ ...DEST, '/t/s': man([f('a.txt', 3), d('sub'), { name: 'link', is_dir: false, size: 0, type: 'symlink', ...more }]) });
    // The program normalizes an absolute target from its serve root: /root/a/../b and /root/b both read /b.
    for (const more of [{ target: '[external]' }, { target: 'a\uFFFD.txt' }, {}, { target: '/b' }, { target: '' }]) {
      expect(compareTrees('/s', '/t/s', W, at(dest(more)), hashes())).toEqual({ state: 'unchecked' });
    }
    // At the source: listed before the press, and never checked.
    const out = { ...SRC, '/s': man([f('a.txt', 3), d('sub'), { name: 'link', is_dir: false, size: 0, type: 'symlink', target: '[external]' }]) };
    const w = walkTree('/s', '/t/s', at(out)) as Walked & { state: 'done' };
    expect(w).toMatchObject({ state: 'done', links: [], opaque: ['link'] });
    const abs = { ...SRC, '/s': man([f('a.txt', 3), d('sub'), { name: 'link', is_dir: false, size: 0, type: 'symlink', target: '/b' }]) };
    expect(walkTree('/s', '/t/s', at(abs))).toMatchObject({ state: 'done', links: [], opaque: ['link'] });
    // Both ends normalized the same is still no proof.
    const absDest = { ...DEST, '/t/s': man([f('a.txt', 3), d('sub'), { name: 'link', is_dir: false, size: 0, type: 'symlink', target: '/b' }]) };
    expect(compareTrees('/s', '/t/s', walkTree('/s', '/t/s', at(abs)) as Walked & { state: 'done' }, at(absDest), hashes())).toEqual({ state: 'unchecked' });
    expect(compareTrees('/s', '/t/s', w, at(DEST), hashes())).toEqual({ state: 'unchecked' });
  });
  it('a SHA-256 read that never answered (unknown) leaves the copy unchecked; a failed read still wins; the other side is still asked', () => {
    expect(compareTrees('/s', '/t/s', W, at(DEST), hashes({ '/s/a.txt': 'unknown' }))).toEqual({ state: 'unchecked' });
    expect(compareTrees('/s', '/t/s', W, at(DEST), hashes({ '/s/a.txt': 'unknown', '/t/s/sub/b.bin': 'failed' }))).toEqual({ state: 'failed' });
    const half = (p: string) => (p === '/s/a.txt' ? 'unknown' : undefined);
    expect(compareTrees('/s', '/t/s', W, at(DEST), half)).toEqual({ state: 'reading', folders: [], hashes: ['/s/a.txt', '/t/s/a.txt', '/s/sub/b.bin', '/t/s/sub/b.bin'] });
  });
  it('equal sizes with other bytes are different', () => {
    expect(compareTrees('/s', '/t/s', W, at(DEST), hashes({ '/t/s/sub/b.bin': 'zz' }))).toEqual({ state: 'differs', count: 1, missing: [], different: ['sub/b.bin'] });
  });
  it('a failed read or an unreadable entry at the destination fails the compare (no verdict)', () => {
    expect(compareTrees('/s', '/t/s', W, at({ ...DEST, '/t/s/sub': 'failed' }), hashes())).toEqual({ state: 'failed' });
    expect(compareTrees('/s', '/t/s', W, at({ ...DEST, '/t/s/sub': man([f('b.bin', 10), d('empty')], [{ name: 'x', reason: 'unreadable' }]) }), hashes())).toEqual({ state: 'failed' });
    expect(compareTrees('/s', '/t/s', W, at(DEST), (p) => (p === '/t/s/a.txt' ? 'failed' : hashes()(p)))).toEqual({ state: 'failed' });
  });
  it('Copy the rest, listed: missing items (a missing folder once, never what is under it) and different ones', () => {
    // sub is there but empty is not, and b.bin is missing; the link is missing at the top.
    const part = { '/t/s': man([f('a.txt', 3), d('sub')]), '/t/s/sub': man([]) };
    expect(compareTrees('/s', '/t/s', W, at(part), hashes())).toEqual({ state: 'differs', count: 3, missing: ['sub/empty', 'sub/b.bin', 'link'], different: [] });
    // A folder whose name a file took is different (create-only cannot go there); nothing under it is listed.
    const taken = { '/t/s': man([f('a.txt', 3), f('sub', 0)]) };
    expect(compareTrees('/s', '/t/s', W, at(taken), hashes())).toEqual({ state: 'differs', count: 4, missing: ['link'], different: ['sub'] });
    // A deeper missing folder under a missing one is not listed again.
    const deep = walkTree('/s', '/t/s', at({ ...SRC, '/s/sub/empty': man([d('in')]), '/s/sub/empty/in': man([]) })) as Walked & { state: 'done' };
    expect(compareTrees('/s', '/t/s', deep, at({ '/t/s': man([f('a.txt', 3), { name: 'link', is_dir: false, size: 0, type: 'symlink', target: 'a.txt' }]) }), hashes())).toEqual({ state: 'differs', count: 4, missing: ['sub'], different: [] });
  });
  it('extra items at the destination are not this copy\'s and change nothing', () => {
    const extra = { ...DEST, '/t/s': man([...DEST['/t/s']!.entries.map((e) => ({ ...e, is_dir: e.type === 'dir', modified: 1 })), f('more', 1)]) };
    expect(compareTrees('/s', '/t/s', W, at(extra), hashes())).toEqual({ state: 'equal' });
  });
});
