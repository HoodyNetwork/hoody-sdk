// Vitest: the pure change rules: new names, protected subtrees, the one delete planner, and what a read-back proves.
import { describe, expect, it } from 'vitest';
import { COPY_SKIPPED_MAX, copyDoneOf, deleteProved, mkdirProved, nameProblem, planDelete, protectedPath, renameProved, renameTyped, foreignDisk, type DeleteItem } from './plan';

const mount = (path: string, label = 'Photos') => ({ path, label });
const item = (path: string, dir = false, size: number | null = 10, modified: number | null = 1000): DeleteItem => ({ path, name: path.split('/').pop()!, dir, size, modified });

describe('nameProblem', () => {
  it('takes a plain name and refuses what the files program refuses or trims', () => {
    expect(nameProblem('notes.txt', '/home')).toBeNull();
    expect(nameProblem('', '/home')).toBe('empty');
    expect(nameProblem('   ', '/home')).toBe('empty');
    expect(nameProblem(' a', '/home')).toBe('spaces');
    expect(nameProblem('a ', '/home')).toBe('spaces');
    expect(nameProblem('a/b', '/home')).toBe('chars');
    expect(nameProblem('a\\b', '/home')).toBe('chars');
    expect(nameProblem('a\u0007', '/home')).toBe('chars');
    // U+0085 is trimmed by the files program (Rust trim) and is a C1 control: refused anywhere, so the sent name is the shown one.
    expect(nameProblem('a\u0085', '/home')).toBe('chars');
    expect(nameProblem('\u0085a', '/home')).toBe('chars');
    expect(nameProblem('a\u009fb', '/home')).toBe('chars');
    expect(nameProblem('.', '/home')).toBe('dots');
    expect(nameProblem('..', '/home')).toBe('dots');
    expect(nameProblem('x'.repeat(256), '/home')).toBeNull();
    expect(nameProblem('x'.repeat(257), '/home')).toBe('long');
  });

  it('refuses what core cannot address yet: % in a part, an alias name at the top, the depth bound', () => {
    expect(nameProblem('50%', '/home')).toBe('chars');
    expect(nameProblem('copy', '/')).toBe('alias');
    expect(nameProblem('copy', '/home')).toBeNull();
    expect(nameProblem('h', '/a/b/c/d/e/f/g/h')).toBe('deep');
  });

  it('refuses the name already taken in the folder', () => {
    expect(nameProblem('notes.txt', '/home', ['notes.txt'])).toBe('taken');
    expect(nameProblem('Notes.txt', '/home', ['notes.txt'])).toBeNull();
  });
});

describe('protected subtrees and other disks', () => {
  it('judges the resolved path against the protected list', () => {
    for (const p of ['/etc/hosts', '/usr/bin/x', '/lib64/a', '/lib/a', '/var/log', '/hoody/x', '/proc/1', '/etc']) expect(protectedPath(p)).toBe(true);
    for (const p of ['/home/ada/etc', '/srv/usr', '/library', '/etcetera', '/tmp/x', '/']) expect(protectedPath(p)).toBe(false);
  });

  it('exempts mount contents from protection, and calls them another disk', () => {
    expect(protectedPath('/run/hoody-files/vfs/abc/photo.jpg')).toBe(false);
    expect(protectedPath('/hoody/mounts/permanent/pc/a.txt')).toBe(false);
    expect(foreignDisk('/run/hoody-files/vfs/abc/photo.jpg', [])).toBe(true);
    expect(foreignDisk('/hoody/mounts/permanent/pc/a.txt', [])).toBe(true);
    expect(foreignDisk('/mnt/photos/a.jpg', [mount('/mnt/photos')])).toBe(true);
    expect(foreignDisk('/home/ada/a.txt', [mount('/mnt/photos')])).toBe(false);
  });

  it('asks a typed name to rename a protected path, never a mount content', () => {
    expect(renameTyped('/etc/hosts')).toBe(true);
    expect(renameTyped('/home/ada/a')).toBe(false);
    expect(renameTyped('/run/hoody-files/vfs/x/a')).toBe(false);
  });
});

describe('planDelete: the one delete planner', () => {
  const real = (m: Record<string, string>) => (p: string) => m[p] ?? p;

  it('a plain file in a home folder: no typing', () => {
    const p = planDelete([item('/home/ada/notes.txt')], real({}), { complete: true, items: [] });
    expect(p).toMatchObject({ refused: null, typed: null });
  });

  it('a folder counts as unknown without an item count, so it is typed', () => {
    const p = planDelete([item('/home/ada/projects', true)], real({}), { complete: true, items: [] });
    expect(p).toMatchObject({ refused: null, typed: 'projects', unknownCount: true });
  });

  it('a protected path, judged after realpath, is typed', () => {
    const p = planDelete([item('/home/ada/link')], real({ '/home/ada/link': '/etc/passwd' }), { complete: true, items: [] });
    expect(p).toMatchObject({ refused: null, typed: 'link', protected: true });
  });

  it('a file in a storage is typed and names the storage', () => {
    const p = planDelete([item('/mnt/photos/a.jpg')], real({}), { complete: true, items: [mount('/mnt/photos', 'Photos')] });
    expect(p).toMatchObject({ refused: null, typed: 'a.jpg', foreign: 'Photos' });
  });

  it('several items are always typed, and the words are the count', () => {
    const p = planDelete([item('/home/ada/a'), item('/home/ada/b', true)], real({}), { complete: true, items: [] });
    expect(p).toMatchObject({ refused: null, typed: '2 items' });
    expect(planDelete([item('/home/ada/a'), item('/home/ada/b')], real({}), { complete: true, items: [] })).toMatchObject({ refused: null, typed: '2 items' });
    const many = Array.from({ length: 100 }, (_, i) => item(`/home/ada/f${i}`));
    expect(planDelete(many, real({}), { complete: true, items: [] })).toMatchObject({ refused: null, typed: '100 items' });
    expect(planDelete([item('/home/ada/a')], real({}), { complete: true, items: [] })).toMatchObject({ typed: null });
  });

  it('refuses the top folder, a mount point, and a folder that holds an open storage', () => {
    expect(planDelete([item('/', true)], real({}), { complete: true, items: [] }).refused).toBe('root');
    expect(planDelete([item('/mnt/photos', true)], real({}), { complete: true, items: [mount('/mnt/photos')] }).refused).toEqual({ mount: 'Photos' });
    expect(planDelete([item('/mnt', true)], real({}), { complete: true, items: [mount('/mnt/photos')] }).refused).toEqual({ mount: 'Photos' });
    // Judged on the resolved path too: a link to a folder above a storage.
    expect(planDelete([item('/home/ada/m', true)], real({ '/home/ada/m': '/mnt' }), { complete: true, items: [mount('/mnt/photos')] }).refused).toEqual({ mount: 'Photos' });
  });

  it('refuses a folder delete while the open storages are not known for sure', () => {
    expect(planDelete([item('/home/ada/p', true)], real({}), { complete: false, items: [] }).refused).toBe('mountsUnknown');
    expect(planDelete([item('/home/ada/p', true)], real({}), null).refused).toBe('mountsUnknown');
    // A file holds no storage: it needs no mount list beyond its own disk check, which an unknown list makes typed.
    expect(planDelete([item('/home/ada/a.txt')], real({}), null)).toMatchObject({ refused: null, typed: 'a.txt' });
  });
});

describe('what a fresh listing proves', () => {
  const listing = (path: string, entries: { name: string; dir: boolean; size: number | null; modified: number | null }[]) => ({ computer: 'c1', path, entries: entries.map((e) => ({ ...e, lossy: false })), hidden: 0, whole: true });

  it('mkdir: a folder there is done, nothing there is not done, a file there is no verdict', () => {
    const id = { computer: 'c1', path: '/home/new' };
    expect(mkdirProved(id, [[listing('/home', [{ name: 'new', dir: true, size: null, modified: 1 }])]])).toBe('applied');
    expect(mkdirProved(id, [[listing('/home', [])]])).toBe('not_applied');
    expect(mkdirProved(id, [[listing('/home', [{ name: 'new', dir: false, size: 3, modified: 1 }])]])).toBeUndefined();
    expect(mkdirProved(id, [[listing('/srv', [])]])).toBeUndefined();
    expect(mkdirProved(id, [[{ ...listing('/home', []), computer: 'c2' }]])).toBeUndefined();
  });

  it('rename: the new name with the approved version and the old one empty is done', () => {
    const id = { computer: 'c1', path: '/home/a', to: 'b', dir: false, size: 10, modified: 1000 };
    expect(renameProved(id, [[listing('/home', [{ name: 'b', dir: false, size: 10, modified: 1000 }])]])).toBe('applied');
    expect(renameProved(id, [[listing('/home', [{ name: 'a', dir: false, size: 10, modified: 1000 }])]])).toBe('not_applied');
    expect(renameProved(id, [[listing('/home', [{ name: 'b', dir: false, size: 11, modified: 1000 }])]])).toBeUndefined();
    expect(renameProved(id, [[listing('/home', [])]])).toBeUndefined();
    // No version evidence proves nothing: a file without size or time, a folder at the name with another time.
    const bare = { ...id, size: null, modified: null };
    expect(renameProved(bare, [[listing('/home', [{ name: 'b', dir: false, size: null, modified: null }])]])).toBeUndefined();
    expect(renameProved(bare, [[listing('/home', [{ name: 'a', dir: false, size: null, modified: null }])]])).toBeUndefined();
    expect(renameProved(id, [[listing('/home', [{ name: 'b', dir: false, size: 10, modified: null }])]])).toBeUndefined();
    const dirId = { ...id, dir: true, size: null, modified: 500 };
    expect(renameProved(dirId, [[listing('/home', [{ name: 'b', dir: true, size: null, modified: 900 }])]])).toBeUndefined();
    expect(renameProved(dirId, [[listing('/home', [{ name: 'b', dir: true, size: null, modified: 500 }])]])).toBe('applied');
    expect(renameProved({ ...dirId, modified: null }, [[listing('/home', [{ name: 'b', dir: true, size: null, modified: null }])]])).toBeUndefined();
  });

  it('delete: gone frees it, the approved version still there is not done, another file there frees it', () => {
    const id = { computer: 'c1', path: '/home/a', dir: false, size: 10, modified: 1000 };
    expect(deleteProved(id, [[listing('/home', [])]])).toBe('applied');
    expect(deleteProved(id, [[listing('/home', [{ name: 'a', dir: false, size: 10, modified: 1000 }])]])).toBe('not_applied');
    expect(deleteProved(id, [[listing('/home', [{ name: 'a', dir: false, size: 99, modified: 2000 }])]])).toBe('applied');
    expect(deleteProved({ ...id, dir: true, size: null }, [[listing('/home', [{ name: 'a', dir: true, size: null, modified: 5 }])]])).toBe('not_applied');
    expect(deleteProved(id, [[listing('/srv', [])]])).toBeUndefined();
    // A file still at the name whose version the listing cannot establish: no verdict, it stays held.
    expect(deleteProved({ ...id, size: null }, [[listing('/home', [{ name: 'a', dir: false, size: null, modified: 1000 }])]])).toBeUndefined();
    expect(deleteProved(id, [[listing('/home', [{ name: 'a', dir: true, size: null, modified: 1 }])]])).toBe('applied');
  });
});

describe('copyDoneOf: a copy answer proves this very copy made', () => {
  const ok = { success: true, source: '/home/ada/site', destination: '/tmp/site', skipped: [{ path: '/home/ada/site/pipe', reason: 'not a regular file' }], skipped_count: 3 };
  it('takes the program\'s answer for this source and destination, a cut list with a larger count included', () => {
    expect(copyDoneOf(ok, '/home/ada/site', '/tmp/site')).toEqual(ok);
    expect(copyDoneOf({ ...ok, skipped: [], skipped_count: 0, extra: 1 }, '/home/ada/site', '/tmp/site')).toEqual({ ...ok, skipped: [], skipped_count: 0 });
    const full = Array.from({ length: COPY_SKIPPED_MAX }, (_, i) => ({ path: `/p${i}`, reason: 'r' }));
    expect(copyDoneOf({ ...ok, skipped: full, skipped_count: 5000 }, '/home/ada/site', '/tmp/site')?.skipped_count).toBe(5000);
  });
  it('is null for another source or destination, or a path not in the "/" form', () => {
    expect(copyDoneOf(ok, '/home/ada/web', '/tmp/site')).toBeNull();
    expect(copyDoneOf(ok, '/home/ada/site', '/tmp/site-1')).toBeNull();
    expect(copyDoneOf({ ...ok, source: 'home/ada/site' }, '/home/ada/site', '/tmp/site')).toBeNull();
    expect(copyDoneOf({ ...ok, destination: undefined }, '/home/ada/site', '/tmp/site')).toBeNull();
  });
  it('is null without success true, or with a missing or malformed skipped list or count', () => {
    const at = (b: unknown) => copyDoneOf(b, '/home/ada/site', '/tmp/site');
    for (const b of [null, [], 'done', { ...ok, success: 'true' }, { ...ok, success: undefined }, { ...ok, skipped: undefined }, { ...ok, skipped: {} },
      { ...ok, skipped: [{ path: '/a' }] }, { ...ok, skipped: [{ path: 1, reason: 'r' }] }, { ...ok, skipped: ['/a'] }, { ...ok, skipped_count: undefined },
      { ...ok, skipped_count: '3' }, { ...ok, skipped_count: 0 }, { ...ok, skipped_count: 1.5 }, { ...ok, skipped_count: -1 }, { ...ok, skipped_count: Infinity },
      { ...ok, skipped: Array.from({ length: COPY_SKIPPED_MAX + 1 }, () => ({ path: '/a', reason: 'r' })), skipped_count: 2000 }]) expect(at(b)).toBeNull();
  });
});

// Shared folders: a folder another computer shares with this one appears under /hoody/shares; a folder this computer shares
// is used by another computer.
describe('planDelete and shared folders', () => {
  const known = { complete: true, items: [] };
  const real = (m: Record<string, string>) => (p: string) => m[p] ?? p;
  it('refuses where received folders appear, each received folder itself, and a folder that holds them', () => {
    expect(planDelete([item('/hoody/shares', true)], real({}), known).refused).toBe('shareRoot');
    expect(planDelete([item('/hoody/shares/photos-7e5d9c1b', true)], real({}), known).refused).toBe('shareRoot');
    expect(planDelete([item('/hoody', true)], real({}), known).refused).toBe('shareRoot');
    // A link that resolves there is judged where it resolves.
    expect(planDelete([item('/home/ada/link', true)], real({ '/home/ada/link': '/hoody/shares/photos-7e5d9c1b' }), known).refused).toBe('shareRoot');
    expect(planDelete([item('/home/ada/a'), item('/hoody/shares/photos-7e5d9c1b', true)], real({}), known).refused).toBe('shareRoot');
  });
  it('treats what is inside a received folder as another computer\'s: typed, and said so', () => {
    const p = planDelete([item('/hoody/shares/photos-7e5d9c1b/a.jpg')], real({}), known);
    expect(p).toMatchObject({ refused: null, typed: 'a.jpg', received: true });
    expect(planDelete([item('/home/ada/a.jpg')], real({}), known)).toMatchObject({ typed: null, received: false, shared: false });
    // A folder that only starts the same way is this computer's own.
    expect(planDelete([item('/hoody/sharesx/a.jpg')], real({}), known).received).toBe(false);
  });
  it('warns and asks for the name when the item is, holds or is inside a folder this computer shares', () => {
    const out = ['/srv/data'];
    expect(planDelete([item('/srv/data', true)], real({}), known, out)).toMatchObject({ refused: null, shared: true, typed: 'data' });
    expect(planDelete([item('/srv', true)], real({}), known, out)).toMatchObject({ shared: true });
    expect(planDelete([item('/srv/data/report.txt')], real({}), known, out)).toMatchObject({ shared: true, typed: 'report.txt' });
    expect(planDelete([item('/srv/database/report.txt')], real({}), known, out)).toMatchObject({ shared: false, typed: null });
    expect(planDelete([item('/home/l')], real({ '/home/l': '/srv/data/x' }), known, out)).toMatchObject({ shared: true });
    expect(planDelete([item('/srv/data/report.txt')], real({}), known)).toMatchObject({ shared: false, typed: null });
  });
  it('judges the selected path as well as where it resolves, against every spelling of a shared folder it is given', () => {
    // Selected inside a shared folder, resolving elsewhere (a link): still warned.
    expect(planDelete([item('/srv/data/l')], real({ '/srv/data/l': '/home/ada/elsewhere' }), known, ['/srv/data'])).toMatchObject({ shared: true, typed: 'l' });
    expect(planDelete([item('/srv/l', true)], real({ '/srv/l': '/home/ada/x' }), known, ['/srv/l/inner'])).toMatchObject({ shared: true });
    // A shared folder given by its link and by where the link resolves (the planner passes both): either matches.
    expect(planDelete([item('/mnt/real/a.txt')], real({}), known, ['/home/ada/link', '/mnt/real'])).toMatchObject({ shared: true });
    expect(planDelete([item('/home/ada/linked.txt')], real({}), known, ['/home/ada/link', '/mnt/real'])).toMatchObject({ shared: false, typed: null });
  });
});

describe('planDelete inside a received folder', () => {
  it('does not call another computer\'s files part of this computer\'s system', () => {
    expect(planDelete([item('/hoody/shares/photos-7e5d9c1b/a.jpg')], (p) => p, { complete: true, items: [] }).protected).toBe(false);
    expect(planDelete([item('/hoody/other/a.jpg')], (p) => p, { complete: true, items: [] }).protected).toBe(true);
  });
});
