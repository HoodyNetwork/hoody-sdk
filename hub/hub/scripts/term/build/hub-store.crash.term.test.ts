// The local store under power loss (build/hub-store.ts).
// A process kill proves nothing about durability (the kernel still holds what was written), so these tests run the
// store on a MODEL of a disk that forgets, at a crash, everything that was not fsynced:
//   - a file's bytes are durable up to its last fsync;
//   - a directory's entries (a created file or directory, a rename, an unlink) are durable only after an fsync of
//     THAT directory.
// A write the store acknowledged (the call returned) must be there after any crash; a crash at ANY file call must
// leave a store that opens, with each key at an acknowledged value or the one being written.
import { describe, expect, test } from 'bun:test';
import nodeFs from 'node:fs';
import path from 'node:path';
import { HubStoreError, openHubStore, type HubStore, type StoreIo } from './hub-store';

const C = nodeFs.constants;
const UID = 1234;
interface File { kind: 'file'; data: string; durable: string; mode: number; nlink: number }
interface Dir { kind: 'dir'; entries: Map<string, Node>; durable: Map<string, Node>; mode: number }
type Node = File | Dir;
class Crash extends Error {}

/** A disk that loses what was not fsynced. `failAt`: the number of the file call that crashes (0 = never). */
function modelDisk(home: string) {
  const dir = (): Dir => ({ kind: 'dir', entries: new Map(), durable: new Map(), mode: 0o700 });
  const root = dir();
  let fds = new Map<number, { node: Node; append: boolean }>();
  let nextFd = 10;
  let calls = 0;
  let failAt = 0;
  const log: string[] = [];
  const step = (what: string): void => { calls += 1; log.push(what); if (failAt && calls === failAt) throw new Crash(what); };
  const enoent = (): never => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); };
  const walk = (p: string): { parent: Dir | null; name: string; node: Node | undefined } => {
    if (p === home) return { parent: null, name: '', node: root };
    const rel = path.relative(home, p);
    if (rel.startsWith('..')) return enoent();
    let d: Dir = root;
    const parts = rel.split(path.sep);
    for (const part of parts.slice(0, -1)) { const n = d.entries.get(part); if (!n || n.kind !== 'dir') return enoent(); d = n; }
    return { parent: d, name: parts[parts.length - 1]!, node: d.entries.get(parts[parts.length - 1]!) };
  };
  const stat = (n: Node) => ({ isDirectory: () => n.kind === 'dir', isFile: () => n.kind === 'file', uid: UID, mode: n.mode | (n.kind === 'dir' ? 0o040000 : 0o100000), nlink: n.kind === 'file' ? n.nlink : 2 });
  const io: StoreIo = {
    lstatSync: ((p: string) => { const w = walk(p); return w.node ? stat(w.node) : enoent(); }) as never,
    mkdirSync: ((p: string, o: { mode: number }) => { step(`mkdir ${path.basename(p)}`); const w = walk(p); if (w.node) throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' }); const d = dir(); d.mode = o.mode; w.parent!.entries.set(w.name, d); }) as never,
    openSync: ((p: string, flags: number, mode?: number) => {
      const w = walk(p);
      let n = w.node;
      if (!n) {
        if (!(flags & C.O_CREAT)) return enoent();
        step(`create ${path.basename(p)}`);
        n = { kind: 'file', data: '', durable: '', mode: mode ?? 0o600, nlink: 1 };
        w.parent!.entries.set(w.name, n);
      } else if ((flags & C.O_CREAT) && (flags & C.O_EXCL)) throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
      const fd = nextFd++;
      fds.set(fd, { node: n, append: (flags & C.O_APPEND) !== 0 });
      return fd;
    }) as never,
    closeSync: ((fd: number) => { fds.delete(fd); }) as never,
    fstatSync: ((fd: number) => stat(fds.get(fd)!.node)) as never,
    readFileSync: ((fd: number) => (fds.get(fd)!.node as File).data) as never,
    writeSync: ((fd: number, text: string) => { step('write'); (fds.get(fd)!.node as File).data += text; return Buffer.byteLength(text); }) as never,
    ftruncateSync: ((fd: number, len: number) => { step('truncate'); const f = fds.get(fd)!.node as File; f.data = Buffer.from(f.data).subarray(0, len).toString(); }) as never,
    fsyncSync: ((fd: number) => {
      const n = fds.get(fd)!.node;
      step(n.kind === 'dir' ? 'fsync-dir' : 'fsync');
      if (n.kind === 'dir') n.durable = new Map(n.entries); else n.durable = n.data;
    }) as never,
    renameSync: ((a: string, b: string) => { step(`rename ${path.basename(b)}`); const from = walk(a), to = walk(b); if (!from.node) return enoent(); from.parent!.entries.delete(from.name); to.parent!.entries.set(to.name, from.node); }) as never,
    unlinkSync: ((p: string) => { step('unlink'); const w = walk(p); w.parent!.entries.delete(w.name); }) as never,
  };
  const forget = (d: Dir): void => {
    d.entries = new Map(d.durable);
    for (const n of d.entries.values()) { if (n.kind === 'dir') forget(n); else n.data = n.durable; }
  };
  return {
    io,
    log,
    calls: () => calls,
    crashAt(n: number) { failAt = n ? calls + n : 0; },
    /** Power loss: every open file is gone, and the disk holds only what was fsynced. */
    crash() { fds = new Map(); failAt = 0; forget(root); },
  };
}

const HOME = '/home/ada';
const DIR = path.join(HOME, '.hoody', 'hub', 'a'.repeat(32));
const open = (d: ReturnType<typeof modelDisk>, limits?: { compactAt?: number }): HubStore => openHubStore(DIR, { home: HOME, uid: UID, io: d.io, tryLock: () => true, now: () => 1, pid: 7, ...(limits ? { limits } : {}) });

describe('the model itself', () => {
  test('a file written and not fsynced, and a file whose directory was not fsynced, are gone after a crash', () => {
    const d = modelDisk(HOME);
    d.io.mkdirSync(path.join(HOME, 'x'), { mode: 0o700 });
    const fd = d.io.openSync(path.join(HOME, 'x', 'f'), C.O_CREAT | C.O_RDWR, 0o600);
    d.io.writeSync(fd, 'abc');
    d.io.fsyncSync(fd);
    d.crash();
    expect(() => d.io.lstatSync(path.join(HOME, 'x'))).toThrow('ENOENT'); // the home directory never learned of x
  });
});

describe('what the store acknowledged survives a power loss', () => {
  test('the first held change of a brand-new store (new directories, a new journal)', () => {
    const d = modelDisk(HOME);
    open(d).journalSet('hub.v3.changes', '[1]');
    d.crash();
    const again = open(d);
    expect(again.journalGet('hub.v3.changes')).toBe('[1]');
    expect(again.droppedTail).toBe(false);
  });
  test('every later line, a removal, and a preference', () => {
    const d = modelDisk(HOME);
    const s = open(d);
    s.journalSet('a', '1');
    s.journalSet('a', '2');
    s.journalSet('b', '1');
    s.journalDel('b');
    s.set('hub_theme_v1', 'dark');
    d.crash();
    const again = open(d);
    expect([again.journalGet('a'), again.journalGet('b'), again.get('hub_theme_v1')]).toEqual(['2', null, 'dark']);
  });
  test('across a compaction, and after an orderly leave', () => {
    const d = modelDisk(HOME);
    const s = open(d, { compactAt: 300 });
    for (let i = 0; i < 12; i++) s.journalSet(`k${i % 3}`, `value-${i}`);
    expect(d.log.filter((l) => l === 'rename journal.jsonl').length).toBeGreaterThan(1);
    d.crash();
    const again = open(d);
    expect([0, 1, 2].map((i) => again.journalGet(`k${i}`))).toEqual(['value-9', 'value-10', 'value-11']);
    again.journalSet('k0', 'last');
    again.close();
    d.crash();
    expect(open(d).journalGet('k0')).toBe('last');
  });
});

describe('a power loss at any file call', () => {
  /** Runs `work` once to count its file calls, then once per call with the power lost at that call. The work must fail
   *  at every crash point, except, with `acknowledgedFrom`, at a call from that number on: there the write was already
   *  durable (an append's line is fsynced before its compaction starts) and returns; `at` then starts "acknowledged". */
  const everyCrashPoint = (prepare: (s: HubStore) => void, work: (s: HubStore) => void, check: (after: HubStore, at: string) => void, limits?: { compactAt?: number }, acknowledgedFrom = Infinity): number => {
    const count = modelDisk(HOME);
    const s0 = open(count, limits);
    prepare(s0);
    const before = count.calls();
    work(s0);
    const n = count.calls() - before;
    for (let k = 1; k <= n; k++) {
      const d = modelDisk(HOME);
      const s = open(d, limits);
      prepare(s);
      d.crashAt(k);
      let at = 'none';
      try { work(s); } catch (e) { at = e instanceof HubStoreError ? `${e.code} at call ${k} (${d.log[d.log.length - 1]})` : String(e); }
      if (at === 'none' && k >= acknowledgedFrom) at = `acknowledged, power lost at call ${k} (${d.log[d.log.length - 1]})`;
      expect(at, `call ${k} did not fail`).not.toBe('none');
      d.crash();
      check(open(d, limits), at);
    }
    return n;
  };
  test('during one append: the store opens, and the key holds the old value or the new one', () => {
    const n = everyCrashPoint((s) => { s.journalSet('a', 'old'); }, (s) => { s.journalSet('a', 'new'); }, (after, at) => {
      expect<Array<string | null>>(['old', 'new'], at).toContain(after.journalGet('a'));
    });
    expect(n).toBe(2); // write, fsync
  });
  test('during an append that compacts: never a store that cannot be read, never a lost acknowledged value', () => {
    const fill = (s: HubStore): void => { for (let i = 0; i < 3; i++) s.journalSet(`k${i}`, 'x'.repeat(80)); s.journalSet('gone', 'y'); s.journalDel('gone'); };
    let acknowledged = 0;
    const n = everyCrashPoint(fill, (s) => { s.journalSet('k0', 'z'.repeat(80)); }, (after, at) => {
      // Acknowledged (the line was fsynced, the compaction after it lost the power): the new value, never the old one.
      if (at.startsWith('acknowledged')) { acknowledged++; expect(after.journalGet('k0'), at).toBe('z'.repeat(80)); }
      expect<Array<string | null>>(['x'.repeat(80), 'z'.repeat(80)], at).toContain(after.journalGet('k0'));
      expect([after.journalGet('k1'), after.journalGet('k2'), after.journalGet('gone')], at).toEqual(['x'.repeat(80), 'x'.repeat(80), null]);
      // The store takes the next write after the recovery, whatever was left behind.
      after.journalSet('next', '1');
      expect(after.journalGet('next'), at).toBe('1');
    }, { compactAt: 700 }, 3);
    expect(n).toBeGreaterThanOrEqual(7); // write, fsync, then the compaction: create, write, fsync, rename, directory fsync
    expect(acknowledged, 'every crash inside the compaction is after the line: acknowledged').toBe(n - 2);
  });
  test('during a preference write: the old choice or the new one, and the journal untouched', () => {
    everyCrashPoint((s) => { s.journalSet('a', '1'); s.set('hub_theme_v1', 'light'); }, (s) => { s.set('hub_theme_v1', 'dark'); }, (after, at) => {
      expect<Array<string | null>>(['light', 'dark'], at).toContain(after.get('hub_theme_v1'));
      expect(after.journalGet('a'), at).toBe('1');
    });
  });
  test('during the very first open and write of a new store: it opens again, with the value or without it', () => {
    const count = modelDisk(HOME);
    open(count).journalSet('a', '1');
    const n = count.calls();
    for (let k = 1; k <= n; k++) {
      const d = modelDisk(HOME);
      d.crashAt(k);
      let acknowledged = false;
      try { open(d).journalSet('a', '1'); acknowledged = true; } catch { /* the power went */ }
      expect(acknowledged, `call ${k}`).toBe(false);
      d.crash();
      const after = open(d);
      expect([null, '1'], `call ${k}`).toContain(after.journalGet('a'));
    }
  });
});
