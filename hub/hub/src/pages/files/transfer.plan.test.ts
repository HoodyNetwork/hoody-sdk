// Vitest: the pure rules of Copy / Move: the Keep-both name, when Copy / Move to the other
// side is offered, the place a path is on, and what a fresh read proves about a copy or a move that may have gone through.
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { copyProvesForTest, copyReadsForTest, usePartial, verdictKey, type FilesComputer } from './data';
import { copyJudge, copyProved, presentAt, keepBothName, moveProved, placeOf, sideBlock, transferBlock } from './plan';

const C = 'c1';
const listing = (path: string, entries: { name: string; dir?: boolean; size?: number | null; modified?: number | null }[], computer = C) =>
  ({ computer, path, entries: entries.map((e) => ({ name: e.name, dir: e.dir ?? false, size: e.size ?? null, modified: e.modified ?? null, lossy: false })), hidden: 0, whole: true });
const hash = (path: string, h: string, computer = C) => ({ computer, path, hash: h });
const H1 = 'a'.repeat(64), H2 = 'b'.repeat(64);

describe('keepBothName', () => {
  it('numbers a file before its extension, a folder or a dot file at the end, first free number', () => {
    expect(keepBothName('report.pdf', ['report.pdf'])).toBe('report-1.pdf');
    expect(keepBothName('report.pdf', ['report.pdf', 'report-1.pdf', 'report-2.pdf'])).toBe('report-3.pdf');
    expect(keepBothName('site', ['site'], true)).toBe('site-1');
    expect(keepBothName('a.b', ['a.b'], true)).toBe('a.b-1');
    expect(keepBothName('.bashrc', ['.bashrc'])).toBe('.bashrc-1');
    expect(keepBothName('archive.tar.gz', ['archive.tar.gz'])).toBe('archive.tar-1.gz');
  });
  it('gives up (null) rather than a name the files program would refuse or a run without end', () => {
    expect(keepBothName('x'.repeat(256), ['x'.repeat(256)])).toBeNull();
    const many = ['f', ...Array.from({ length: 999 }, (_, i) => `f-${i + 1}`)];
    expect(keepBothName('f', many, true)).toBeNull();
  });
});

describe('transferBlock', () => {
  const src = { computer: C, path: '/home/ada/site', dir: true };
  const ok = { computer: C, running: true, path: '/tmp', listed: true };
  it('offers it to a listed folder of the same running computer', () => {
    expect(transferBlock(src, ok)).toBeNull();
  });
  it('says why not: no other side, another computer, stopped, not listed, same folder, inside itself, too deep', () => {
    expect(transferBlock(src, null)).toBe('noOther');
    expect(transferBlock(src, { ...ok, computer: undefined })).toBe('noOther');
    expect(transferBlock(src, { ...ok, computer: 'c2' })).toBe('otherComputer');
    expect(transferBlock(src, { ...ok, running: false })).toBe('otherStopped');
    expect(transferBlock(src, { ...ok, path: null })).toBe('otherUnlisted');
    expect(transferBlock(src, { ...ok, listed: false })).toBe('otherUnlisted');
    expect(transferBlock(src, { ...ok, path: '/home/ada' })).toBe('sameFolder');
    expect(transferBlock(src, { ...ok, path: '/home/ada/site' })).toBe('intoItself');
    expect(transferBlock(src, { ...ok, path: '/home/ada/site/public' })).toBe('intoItself');
    // A file is never "inside itself"; a sibling with a longer name is not inside the folder.
    expect(transferBlock({ ...src, dir: false }, { ...ok, path: '/home/ada/site/public' })).toBeNull();
    expect(transferBlock(src, { ...ok, path: '/home/ada/site2' })).toBeNull();
    expect(transferBlock(src, { ...ok, path: '/a/b/c/d/e/f/g/h' })).toBe('deep');
  });
  it('an item-level reason wins over an unlisted other side (the more exact words)', () => {
    expect(transferBlock(src, { ...ok, path: '/home/ada/site/public', listed: false })).toBe('intoItself');
    expect(transferBlock(src, { ...ok, path: '/a/b/c/d/e/f/g/h', listed: false })).toBe('deep');
    expect(transferBlock(src, { ...ok, path: '/home/ada', listed: false })).toBe('sameFolder');
  });
});

describe('sideBlock (several items)', () => {
  const ok = { computer: C, running: true, path: '/tmp', listed: true };
  it('says why nothing in a folder can go to the other side, whatever the item', () => {
    expect(sideBlock(C, '/home/ada', ok)).toBeNull();
    expect(sideBlock(C, '/home/ada', null)).toBe('noOther');
    expect(sideBlock(C, '/home/ada', { ...ok, computer: 'c2' })).toBe('otherComputer');
    expect(sideBlock(C, '/home/ada', { ...ok, running: false })).toBe('otherStopped');
    expect(sideBlock(C, '/home/ada', { ...ok, path: null })).toBe('otherUnlisted');
    expect(sideBlock(C, '/home/ada', { ...ok, listed: false })).toBe('otherUnlisted');
    expect(sideBlock(C, '/tmp', ok)).toBe('sameFolder');
    // Items' own reasons are not its business: a folder going into itself is judged per item.
    expect(sideBlock(C, '/home', { ...ok, path: '/home/ada' })).toBeNull();
  });
});

describe('placeOf', () => {
  const mounts = [{ path: '/srv/media', label: 'Photos' }, { path: '/srv/media/raw', label: 'Raw' }];
  it('names the innermost open storage, a mount root, or this computer\'s own disk', () => {
    expect(placeOf('/home/ada/a.txt', mounts)).toEqual({ key: '', label: '' });
    expect(placeOf('/srv/media/x.jpg', mounts)).toEqual({ key: '/srv/media', label: 'Photos' });
    expect(placeOf('/srv/media/raw/x', mounts)).toEqual({ key: '/srv/media/raw', label: 'Raw' });
    expect(placeOf('/srv/mediaX/x', mounts)).toEqual({ key: '', label: '' });
    expect(placeOf('/hoody/mounts/permanent/pc1/doc', [])).toEqual({ key: '/hoody/mounts/permanent/pc1', label: '' });
    expect(placeOf('/run/hoody-files/vfs/b2/x', [])).toEqual({ key: '/run/hoody-files/vfs/b2', label: '' });
  });
});

describe('copyProved', () => {
  const file = { kind: 'copy', computer: C, path: '/home/ada/notes.txt', dest: '/tmp/notes.txt', dir: false, size: 10, modified: 1000 };
  it('a file: absent → not applied; same SHA-256 as the source, read now → applied; other bytes → not applied', () => {
    expect(copyProved(file, [[listing('/tmp', [])]])).toBe('not_applied');
    expect(copyProved(file, [[listing('/tmp', [{ name: 'notes.txt', size: 10 }]), hash('/tmp/notes.txt', H1), hash('/home/ada/notes.txt', H1)]])).toBe('applied');
    expect(copyProved(file, [[listing('/tmp', [{ name: 'notes.txt', size: 10 }]), hash('/tmp/notes.txt', H2), hash('/home/ada/notes.txt', H1)]])).toBe('not_applied');
  });
  it('proves nothing without the destination folder, or with a hash missing, or from another computer', () => {
    expect(copyProved(file, [[listing('/home/ada', [{ name: 'notes.txt' }])]])).toBeUndefined();
    expect(copyProved(file, [[listing('/tmp', [{ name: 'notes.txt', size: 10 }]), hash('/tmp/notes.txt', H1)]])).toBeUndefined();
    expect(copyProved(file, [[listing('/tmp', [], 'c2')]])).toBeUndefined();
    expect(copyProved(file, [[listing('/tmp', [{ name: 'notes.txt', size: 10 }]), hash('/tmp/notes.txt', H1, 'c2'), hash('/home/ada/notes.txt', H1)]])).toBeUndefined();
    // A name merely there proves nothing; equal sizes prove nothing.
    expect(copyProved(file, [[listing('/tmp', [{ name: 'notes.txt', size: 10, modified: 1000 }])]])).toBeUndefined();
  });
  it('a folder at the file\'s name proves nothing: the item may have become a folder and been part copied', () => {
    expect(copyProved(file, [[listing('/tmp', [{ name: 'notes.txt', dir: true }])]])).toBeUndefined();
  });
});

describe('copyJudge', () => {
  const file = { kind: 'copy', computer: C, path: '/home/ada/notes.txt', dest: '/tmp/notes.txt', dir: false, size: 10, modified: 1000 };
  const folder = { kind: 'copy', computer: C, path: '/srv/app', dest: '/tmp/app', dir: true, size: null, modified: 1000 };
  const m = (entries: { name: string; type: string; size?: number }[]) => ({ entries: entries.map((e) => ({ name: e.name, type: e.type, size: e.size ?? 0, lossy: false })), skipped: 0 });
  const tree = (path: string, entries: { name: string; type: string; size?: number }[], computer = C) => ({ computer, path, tree: m(entries) });
  const parents = [listing('/tmp', [{ name: 'app', dir: true }]), listing('/srv', [{ name: 'app', dir: true }])];
  const SRC = [tree('/srv/app', [{ name: 'server.js', type: 'file', size: 9 }, { name: 'public', type: 'dir' }]), tree('/srv/app/public', [])];
  const DEST = [tree('/tmp/app', [{ name: 'server.js', type: 'file', size: 9 }, { name: 'public', type: 'dir' }]), tree('/tmp/app/public', [])];
  const HASHES = [hash('/srv/app/server.js', H1), hash('/tmp/app/server.js', H1)];
  it('a file copy is copyProved\'s', () => {
    expect(copyJudge(file, [[listing('/tmp', [{ name: 'notes.txt', size: 10 }]), hash('/tmp/notes.txt', H1), hash('/home/ada/notes.txt', H1)]])).toEqual({ verdict: 'applied' });
    expect(copyJudge(file, [[listing('/tmp', [])]])).toEqual({ verdict: 'not_applied' });
  });
  it('a folder: nothing at the name → not applied; a file there while the source is a folder → not applied', () => {
    expect(copyJudge(folder, [[listing('/tmp', [])]])).toEqual({ verdict: 'not_applied' });
    expect(copyJudge(folder, [[listing('/tmp', [{ name: 'app' }]), listing('/srv', [{ name: 'app', dir: true }])]])).toEqual({ verdict: 'not_applied' });
  });
  it('a file there proves nothing when the source is a file now or not read (the program copied what it found)', () => {
    expect(copyJudge(folder, [[listing('/tmp', [{ name: 'app' }]), listing('/srv', [{ name: 'app' }])]])).toEqual({ verdict: undefined });
    expect(copyJudge(folder, [[listing('/tmp', [{ name: 'app' }])]])).toEqual({ verdict: undefined });
  });
  it('both trees read now and equal, SHA-256 included → applied', () => {
    expect(copyJudge(folder, [[...parents, ...SRC, ...DEST, ...HASHES]])).toEqual({ verdict: 'applied' });
  });
  it('items missing or different → no verdict (the copy may still be running), with their count', () => {
    expect(copyJudge(folder, [[...parents, ...SRC, tree('/tmp/app', [{ name: 'server.js', type: 'file', size: 9 }]), ...HASHES]])).toEqual({ verdict: undefined, missing: 1 });
    expect(copyJudge(folder, [[...parents, ...SRC, ...DEST, hash('/srv/app/server.js', H1), hash('/tmp/app/server.js', H2)]])).toEqual({ verdict: undefined, missing: 1 });
    // No count before every file there with the same size is hashed.
    expect(copyJudge(folder, [[...parents, ...SRC, tree('/tmp/app', [{ name: 'server.js', type: 'file', size: 9 }])]])).toEqual({ verdict: undefined });
  });
  it('a part-made count is kept for its send and reaches what shows it at once; a later read that proves nothing keeps it', () => {
    const id = { ...folder, op: 'op-part' };
    const { result } = renderHook(() => usePartial(id));
    expect(result.current).toBeUndefined();
    act(() => { expect(copyProvesForTest(id, [[...parents, ...SRC, tree('/tmp/app', [{ name: 'server.js', type: 'file', size: 9 }]), ...HASHES]])).toBeUndefined(); });
    expect(result.current).toBe(1);
    act(() => { copyProvesForTest(id, [[listing('/tmp', [{ name: 'app', dir: true }])]]); });
    expect(result.current).toBe(1);
    // Another send's count is its own.
    expect(renderHook(() => usePartial({ ...folder, op: 'op-other' })).result.current).toBeUndefined();
  });
  it('proves nothing while a tree or a SHA-256 is not read, or on another computer\'s reads', () => {
    expect(copyJudge(folder, [[...parents, ...DEST, ...HASHES]])).toEqual({ verdict: undefined });
    expect(copyJudge(folder, [[...parents, ...SRC, ...HASHES]])).toEqual({ verdict: undefined });
    expect(copyJudge(folder, [[...parents, ...SRC, ...DEST, hash('/srv/app/server.js', H1)]])).toEqual({ verdict: undefined });
    expect(copyJudge(folder, [[...parents, ...SRC, tree('/tmp/app', [], 'c2'), ...DEST.slice(1), ...HASHES]])).toEqual({ verdict: undefined });
    expect(copyJudge(folder, [[...SRC, ...DEST, ...HASHES]])).toEqual({ verdict: undefined });
  });
});

describe('presentAt', () => {
  const id = { kind: 'copy', computer: C, path: '/home/ada/notes.txt', dest: '/tmp/notes.txt' };
  it('says whether the fresh listing of the folder shows the name; not read → undefined', () => {
    expect(presentAt(id, '/tmp/notes.txt', [[listing('/tmp', [{ name: 'notes.txt' }])]])).toBe(true);
    expect(presentAt(id, '/tmp/notes.txt', [[listing('/tmp', [{ name: 'other.txt' }])]])).toBe(false);
    expect(presentAt(id, '/tmp/notes.txt', [[listing('/srv', [{ name: 'notes.txt' }])]])).toBeUndefined();
    expect(presentAt({ ...id, computer: 'c-other' }, '/tmp/notes.txt', [[listing('/tmp', [{ name: 'notes.txt' }])]])).toBeUndefined();
    expect(presentAt(id, 'tmp/notes.txt', [[listing('/tmp', [{ name: 'notes.txt' }])]])).toBeUndefined();
  });
});

describe('moveProved', () => {
  const id = { kind: 'move', computer: C, path: '/home/ada/notes.txt', dest: '/tmp/notes.txt', dir: false, size: 10, modified: 1000 };
  const from = (present: boolean, v = { size: 10, modified: 1000 }) => listing('/home/ada', present ? [{ name: 'notes.txt', ...v }] : []);
  const to = (present: boolean, v = { size: 10, modified: 1000 }) => listing('/tmp', present ? [{ name: 'notes.txt', ...v }] : []);
  it('applied: the destination holds the approved version and the source is empty', () => {
    expect(moveProved(id, [[from(false), to(true)]])).toBe('applied');
  });
  it('not applied: the source holds the approved version and the destination is empty', () => {
    expect(moveProved(id, [[from(true), to(false)]])).toBe('not_applied');
  });
  it('anything else proves nothing: both, neither, another version, a folder missing', () => {
    expect(moveProved(id, [[from(true), to(true)]])).toBeUndefined();
    expect(moveProved(id, [[from(false), to(false)]])).toBeUndefined();
    expect(moveProved(id, [[from(false), to(true, { size: 11, modified: 1000 })]])).toBeUndefined();
    expect(moveProved(id, [[from(true, { size: 10, modified: 2000 }), to(false)]])).toBeUndefined();
    expect(moveProved(id, [[to(true)]])).toBeUndefined();
    expect(moveProved(id, [[from(false)]])).toBeUndefined();
    expect(moveProved({ ...id, size: null }, [[from(false), to(true)]])).toBeUndefined();
  });
});

describe('verdictKey', () => {
  it('names one send (its op): the same paths under another op are another send; no op, no verdict', () => {
    const a = { kind: 'copy', computer: C, path: '/home/ada/notes.txt', dest: '/tmp/notes.txt', op: 'op-1' };
    expect(verdictKey(a)).toBe('op-1');
    expect(verdictKey({ ...a, op: 'op-2' })).not.toBe(verdictKey(a));
    expect(verdictKey({ ...a, op: undefined })).toBeNull();
    expect(verdictKey({ ...a, op: '' })).toBeNull();
  });
});

describe('a copy\'s read-back', () => {
  const key = (name: string, id: string, path: string) => ['hub', 'r', 'u', 'p', 'src', 'files', name, { id, project: 'p', server: 's', path }, null, null];
  it('re-reads every folder read, and a SHA-256 or tree read only while a hook holds it, for its computer and path', () => {
    const { copyReads, useHeldReads } = copyReadsForTest;
    // one `*parts` read per kind: the root listing keeps its own key
    expect(copyReads(key('folder', 'c1', '/srv/app'))).toBe(true);
    expect(copyReads(key('folder0', 'c1', '/'))).toBe(true);
    expect(copyReads(key('tree', 'c1', '/srv/app'))).toBe(false);
    const c1 = { id: 'c1' } as FilesComputer;
    const held = renderHook(({ on }) => useHeldReads('tree', c1, ['/srv/app'], on), { initialProps: { on: true } });
    expect(copyReads(key('tree', 'c1', '/srv/app'))).toBe(true);
    expect(copyReads(key('tree', 'c2', '/srv/app'))).toBe(false);
    expect(copyReads(key('hash', 'c1', '/srv/app'))).toBe(false);
    expect(copyReads(key('tree', 'c1', '/srv/app/x'))).toBe(false);
    held.rerender({ on: false });
    expect(copyReads(key('tree', 'c1', '/srv/app'))).toBe(false);
    held.unmount();
  });
});
