// The terminal Hub's local store, host side (build/hub-store.ts).
// Real files in a private temp directory; the lock is the C library's flock unless a test names its own.
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { COMPACT_AT, HubStoreError, STORE_MAX, VALUE_MAX, hubStoreDir, journalLine, openHubStore, storeIdOf, systemTryLock, type HubStore, type StoreIo, type TryLock } from './hub-store';

let home = '';
let dir = '';
let flock: TryLock = () => true;
const opened: HubStore[] = [];
beforeAll(async () => { flock = await systemTryLock(); });
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-store-test-'));
  fs.chmodSync(home, 0o700);
  dir = hubStoreDir(home, 'https://api.example.invalid', '64f0ada00000000000000001')!;
});
afterEach(() => {
  for (const s of opened.splice(0)) s.close();
  fs.rmSync(home, { recursive: true, force: true });
});
const open = (o: { io?: Partial<StoreIo>; tryLock?: TryLock; now?: () => number; pid?: number; limits?: { valueMax?: number; storeMax?: number; compactAt?: number } } = {}): HubStore => {
  const s = openHubStore(dir, { home, tryLock: flock, ...o });
  opened.push(s);
  return s;
};
const code = (fn: () => unknown): string => { try { fn(); } catch (e) { return e instanceof HubStoreError ? e.code : `other: ${String(e)}`; } return 'no throw'; };
const J = (): string => path.join(dir, 'journal.jsonl');
/** The refusal's full text (code and reason), or 'no throw'. */
const said = (fn: () => unknown): string => { try { fn(); } catch (e) { return e instanceof HubStoreError ? e.message : `other: ${String(e)}`; } return 'no throw'; };
const temps = (): string[] => fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
/** An io whose writes to a store TEMP file (compaction, store.json) are cut short while `cut()` says so. */
const shortTemps = (cut: () => boolean): Partial<StoreIo> => {
  const tmpFds = new Set<number>();
  return {
    openSync: ((p: fs.PathLike, ...rest: unknown[]) => { const fd = (fs.openSync as (...x: unknown[]) => number)(p, ...rest); if (String(p).endsWith('.tmp')) tmpFds.add(fd); else tmpFds.delete(fd); return fd; }) as typeof fs.openSync,
    writeSync: ((fd: number, text: string) => (cut() && tmpFds.has(fd) ? fs.writeSync(fd, text.slice(0, Math.max(1, text.length >> 1))) : fs.writeSync(fd, text))) as typeof fs.writeSync,
  };
};
const modeOf = (f: string): number => fs.lstatSync(f).mode & 0o777;
const CANARY = 'canary-7f3a9c';

describe('where the store lives', () => {
  test('one directory per platform and account, under the home directory, naming neither', () => {
    const id = storeIdOf('https://api.example.invalid', '64f0ada00000000000000001');
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(dir).toBe(path.join(home, '.hoody', 'hub', id));
    expect(dir).not.toContain('64f0ada');
    expect(dir).not.toContain('example');
    expect(storeIdOf('https://api.example.invalid', '64f0ada00000000000000002')).not.toBe(id);
    expect(storeIdOf('https://api2.example.invalid', '64f0ada00000000000000001')).not.toBe(id);
    // The separator is a NUL: an origin that ends in the start of a uid is another store.
    expect(storeIdOf('https://a', 'b')).not.toBe(storeIdOf('https://', 'ab'));
    for (const h of [undefined, '', 'rel', '/']) expect(hubStoreDir(h, 'https://a', 'b')).toBeNull();
  });
  test('created private: every directory 0700, every file 0600', () => {
    const s = open();
    s.journalSet('k', 'v');
    s.set('p', 'q');
    for (const d of [path.join(home, '.hoody'), path.join(home, '.hoody', 'hub'), dir]) expect(modeOf(d), d).toBe(0o700);
    for (const f of fs.readdirSync(dir)) expect(modeOf(path.join(dir, f)), f).toBe(0o600);
    expect(fs.readdirSync(dir).sort()).toEqual(['journal.jsonl', 'lock', 'store.json']);
  });
});

describe('a store that must not be used', () => {
  const made = (): void => { open().close(); opened.length = 0; };
  test('an ancestor that others can write, a symlinked ancestor, a store directory that is not 0700', () => {
    made();
    fs.chmodSync(path.join(home, '.hoody'), 0o770);
    expect(code(() => open())).toBe('TERM_STORE_UNSAFE');
    fs.chmodSync(path.join(home, '.hoody'), 0o700);
    fs.chmodSync(dir, 0o750);
    expect(code(() => open())).toBe('TERM_STORE_UNSAFE');
    fs.chmodSync(dir, 0o700);
    expect(code(() => open())).toBe('no throw');
    opened.splice(0).forEach((s) => { s.close(); });
    const real = path.join(home, 'elsewhere');
    fs.renameSync(path.join(home, '.hoody'), real);
    fs.symlinkSync(real, path.join(home, '.hoody'));
    // The reason, not only the code: on Linux a symlink's lstat mode (0777) would also trip the writable check; on macOS
    // Only the directory check refuses it.
    expect(said(() => open())).toBe('TERM_STORE_UNSAFE: an ancestor of the store is not a real directory');
  });
  test('a store outside the home directory, or a relative path', () => {
    expect(code(() => openHubStore(path.join(os.tmpdir(), 'x'), { home: path.join(home, 'sub'), tryLock: flock }))).toBe('TERM_STORE_UNSAFE');
    expect(code(() => openHubStore('rel/x', { home, tryLock: flock }))).toBe('TERM_STORE_UNSAFE');
    expect(code(() => openHubStore(path.join(home, 'a', '..', '..', 'x'), { home, tryLock: flock }))).toBe('TERM_STORE_UNSAFE');
  });
  for (const name of ['journal.jsonl', 'store.json', 'lock']) {
    test(`${name}: a symlink, a second link, a wider mode, each refused on the opened file`, () => {
      const s = open();
      s.journalSet('k', 'v');
      s.set('p', 'q');
      s.close();
      opened.length = 0;
      const f = path.join(dir, name);
      const keep = fs.readFileSync(f);
      // wider mode
      fs.chmodSync(f, 0o644);
      expect(code(() => open()), 'mode').toBe('TERM_STORE_UNSAFE');
      fs.chmodSync(f, 0o600);
      // a second link
      fs.linkSync(f, path.join(home, 'second-link'));
      expect(code(() => open()), 'link').toBe('TERM_STORE_UNSAFE');
      fs.unlinkSync(path.join(home, 'second-link'));
      // a symlink to a private file with the same content
      const target = path.join(home, 'target');
      fs.writeFileSync(target, keep, { mode: 0o600 });
      fs.unlinkSync(f);
      fs.symlinkSync(target, f);
      expect(code(() => open()), 'symlink').toBe('TERM_STORE_UNSAFE');
      fs.unlinkSync(f);
      fs.writeFileSync(f, keep, { mode: 0o600 });
      expect(code(() => open()), 'restored').toBe('no throw');
    });
  }
  test('a temporary file name that already exists is refused, never reused', () => {
    const s = open({ pid: 4242 });
    fs.writeFileSync(path.join(dir, 'store.json.4242.tmp'), CANARY, { mode: 0o600 });
    expect(code(() => { s.set('p', 'q'); })).toBe('TERM_STORE_UNSAFE');
    expect(fs.readFileSync(path.join(dir, 'store.json.4242.tmp'), 'utf8')).toBe(CANARY);
    expect(s.failed()).toBe(true);
  });
});

describe('the journal', () => {
  test('a value is there after a reopen; a removed one is not; lines carry a sequence and a sum', () => {
    const s = open({ now: () => 1000 });
    s.journalSet('hub.v3.changes', '[1]');
    s.journalSet('hub.v3.changes', '[1,2]');
    s.journalSet('other', 'x');
    s.journalDel('other');
    const lines = fs.readFileSync(J(), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { n: number; sum: string; op: string });
    expect(lines.map((l) => l.n)).toEqual([1, 2, 3, 4]);
    expect(lines.map((l) => l.op)).toEqual(['set', 'set', 'set', 'del']);
    for (const l of lines) expect(l.sum).toMatch(/^[0-9a-f]{16}$/);
    s.close();
    opened.length = 0;
    const again = open();
    expect(again.journalGet('hub.v3.changes')).toBe('[1,2]');
    expect(again.journalGet('other')).toBeNull();
    expect(again.journalKeys()).toEqual(['hub.v3.changes']);
    expect(again.droppedTail).toBe(false);
  });
  test('every line is fsynced before the write returns, and the new file\'s directory is fsynced', () => {
    const calls: string[] = [];
    const s = open({ io: { writeSync: ((...a: Parameters<typeof fs.writeSync>) => { calls.push('write'); return fs.writeSync(...a); }) as typeof fs.writeSync, fsyncSync: (fd) => { calls.push(fs.fstatSync(fd).isDirectory() ? 'fsync-dir' : 'fsync'); fs.fsyncSync(fd); } } });
    expect(calls.filter((c) => c === 'fsync-dir').length).toBeGreaterThanOrEqual(4); // .hoody, hub, the store, then the journal's creation
    calls.length = 0;
    s.journalSet('k', 'v');
    expect(calls).toEqual(['write', 'fsync']);
  });
  test('only a last line without a newline is dropped; the next write starts on its own line', () => {
    const s = open();
    s.journalSet('a', '1');
    s.close();
    opened.length = 0;
    const whole = fs.readFileSync(J(), 'utf8');
    fs.appendFileSync(J(), journalLine({ v: 1, n: 2, t: 5, key: 'b', op: 'set', value: CANARY }).slice(0, 40));
    const again = open();
    expect(again.droppedTail).toBe(true);
    expect(again.journalGet('a')).toBe('1');
    expect(again.journalGet('b')).toBeNull();
    expect(fs.readFileSync(J(), 'utf8')).toBe(whole);
    again.journalSet('c', '3');
    again.close();
    opened.length = 0;
    const third = open();
    expect(third.droppedTail).toBe(false);
    expect(third.journalGet('c')).toBe('3');
  });
  const corrupt: Array<[string, (lines: string[]) => string]> = [
    ['a complete last line with a bad sum', (l) => [...l.slice(0, 2), l[2]!.replace(/"sum":"./, (m) => m.slice(0, -1) + (m.endsWith('0') ? '1' : '0'))].join('\n') + '\n'],
    ['a changed value in the middle', (l) => [l[0]!, l[1]!.replace('"value":"2"', '"value":"9"'), l[2]!].join('\n') + '\n'],
    ['a gap in the sequence', (l) => [l[0]!, l[2]!].join('\n') + '\n'],
    ['a line that is not a record', (l) => [l[0]!, 'not json', l[1]!, l[2]!].join('\n') + '\n'],
    ['a record with an extra field', (l) => [l[0]!.replace('{"v":1', '{"x":1,"v":1'), l[1]!, l[2]!].join('\n') + '\n'],
    ['an empty line in the middle', (l) => [l[0]!, '', l[1]!, l[2]!].join('\n') + '\n'],
  ];
  for (const [what, change] of corrupt) {
    test(`${what}: the store is not used and the file is kept as it was`, () => {
      const s = open();
      s.journalSet('a', '1');
      s.journalSet('b', '2');
      s.journalSet('c', '3');
      const text = fs.readFileSync(J(), 'utf8'); // read before close: a close compacts
      s.close();
      opened.length = 0;
      const bad = change(text.split('\n').filter(Boolean));
      fs.writeFileSync(J(), bad, { mode: 0o600 });
      expect(code(() => open())).toBe('TERM_STORE_CORRUPT');
      expect(fs.readFileSync(J(), 'utf8')).toBe(bad);
    });
  }
  test('a failed write or fsync: that write throws, and so does every later one (never retried into "durable")', () => {
    for (const failing of ['writeSync', 'fsyncSync'] as const) {
      let fail = false;
      const s = open({ io: { [failing]: ((...a: unknown[]) => { if (fail) throw Object.assign(new Error('EIO'), { code: 'EIO' }); return (fs[failing] as (...x: unknown[]) => unknown)(...a); }) } as Partial<StoreIo> });
      s.journalSet('a', '1');
      fail = true;
      expect(code(() => { s.journalSet('a', '2'); }), failing).toBe('TERM_STORE_FAILED');
      expect(s.journalGet('a'), 'the read-back is what was durable').toBe('1');
      fail = false;
      expect(code(() => { s.journalSet('a', '3'); }), failing + ' later').toBe('TERM_STORE_FAILED');
      expect(code(() => { s.set('p', 'q'); }), failing + ' preferences').toBe('TERM_STORE_FAILED');
      expect(s.failed()).toBe(true);
      s.close();
      opened.length = 0;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  test('a write the kernel cut short is a failure', () => {
    let short = false;
    const s = open({ io: { writeSync: ((fd: number, text: string) => (short ? fs.writeSync(fd, text.slice(0, 10)) : fs.writeSync(fd, text))) as typeof fs.writeSync } });
    short = true;
    expect(code(() => { s.journalSet('a', '1'); })).toBe('TERM_STORE_FAILED');
    expect(s.journalGet('a')).toBeNull();
  });
  // The line that crossed the bound is written and fsynced before the compaction starts. A compaction
  // that then fails must not fail that write (core would call the change unsent, the next mount would read it held).
  for (const [what, io] of [
    ['its rename fails', (f: { on: boolean }): Partial<StoreIo> => ({ renameSync: (a, b) => { if (f.on && String(a).includes('journal.jsonl')) throw new Error('EIO'); fs.renameSync(a, b); } })],
    ['its write is cut short', (f: { on: boolean }): Partial<StoreIo> => shortTemps(() => f.on)],
  ] as const) {
    test(`a compaction that fails (${what}): the write that crossed the bound stands, the store is failed, the next mount holds it`, () => {
      const f = { on: false };
      const s = open({ limits: { compactAt: 4096 }, io: io(f) });
      const big = 'x'.repeat(1000);
      for (let i = 0; i < 3; i++) s.journalSet('k', big + i);
      const before = fs.readFileSync(J(), 'utf8');
      expect(before.length, 'three lines stay under the bound').toBeLessThan(4096);
      const held = `change-1-${big}`; // this line takes the journal past the bound
      f.on = true;
      expect(code(() => { s.journalSet('held', held); }), 'the line is durable: no throw').toBe('no throw');
      expect(s.failed()).toBe(true);
      expect(s.journalGet('held')).toBe(held);
      expect(code(() => { s.journalSet('next', '1'); })).toBe('TERM_STORE_FAILED');
      // The old journal stays, with the new line appended; no temp file is left behind.
      const after = fs.readFileSync(J(), 'utf8');
      expect(after.startsWith(before)).toBe(true);
      expect(after.slice(before.length)).toContain('change-1');
      expect(temps()).toEqual([]);
      s.close();
      opened.length = 0;
      const again = open();
      expect(again.droppedTail).toBe(false);
      expect(again.journalGet('held')).toBe(held);
      expect(again.journalGet('k')).toBe(big + 2);
      expect(again.journalGet('next')).toBeNull();
    });
  }
  test('compaction: past the bound the journal is rewritten whole, inside the write that crossed it, and reads back the same', () => {
    const s = open({ limits: { compactAt: 4096 } });
    const big = 'x'.repeat(1000);
    for (let i = 0; i < 4; i++) s.journalSet('k', big + i); // the fourth line crosses the bound
    expect(fs.statSync(J()).size).toBeLessThan(4096);
    expect(fs.readFileSync(J(), 'utf8').split('\n').filter(Boolean)).toHaveLength(1);
    s.journalSet('after', '1');
    // The sequence goes on after a compaction: the next opener reads a file with no gap.
    expect(fs.readFileSync(J(), 'utf8').split('\n').filter(Boolean).map((l) => (JSON.parse(l) as { n: number }).n)).toEqual([5, 6]);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    s.close();
    opened.length = 0;
    const again = open();
    expect(again.journalGet('k')).toBe(big + 3);
    expect(again.journalGet('after')).toBe('1');
  });
  test('an orderly leave compacts: a removed value is in no line of the file', () => {
    const s = open();
    s.journalSet('a', CANARY);
    s.journalDel('a');
    s.journalSet('b', '1');
    expect(fs.readFileSync(J(), 'utf8')).toContain(CANARY);
    s.close();
    opened.length = 0;
    expect(fs.readFileSync(J(), 'utf8')).not.toContain(CANARY);
    expect(open().journalGet('b')).toBe('1');
  });
  test('bounds: 256 KiB a value, 8 MiB a store, 1 MiB before a compaction', () => {
    expect([VALUE_MAX, STORE_MAX, COMPACT_AT]).toEqual([256 * 1024, 8 * 1024 * 1024, 1024 * 1024]);
  });
  test('a value over the bound, or one that would take the store over its bound, is refused; the store stays usable', () => {
    const s = open({ limits: { valueMax: 1000, storeMax: 5000 } });
    expect(code(() => { s.journalSet('a', 'x'.repeat(1001)); })).toBe('TERM_STORE_TOO_LARGE');
    expect(code(() => { s.set('a', 'x'.repeat(1001)); })).toBe('TERM_STORE_TOO_LARGE');
    const v = 'y'.repeat(1000);
    for (let i = 0; i < 4; i++) s.journalSet(`k${i}`, v);
    expect(code(() => { s.journalSet('one-more', v); })).toBe('TERM_STORE_TOO_LARGE');
    expect(code(() => { s.set('one-more', v); }), 'both files count').toBe('TERM_STORE_TOO_LARGE');
    // Replacing a value counts the new one only.
    s.journalSet('k0', v);
    expect(s.failed()).toBe(false);
    s.journalSet('small', '1');
    expect(s.journalGet('small')).toBe('1');
    expect(s.journalGet('one-more')).toBeNull();
  });
});

describe('store.json', () => {
  test('replaced whole through a private temp file: write, fsync, rename, directory fsync, in that order', () => {
    const calls: string[] = [];
    const s = open({ io: {
      writeSync: ((...a: Parameters<typeof fs.writeSync>) => { calls.push('write'); return fs.writeSync(...a); }) as typeof fs.writeSync,
      fsyncSync: (fd) => { calls.push(fs.fstatSync(fd).isDirectory() ? 'fsync-dir' : 'fsync'); fs.fsyncSync(fd); },
      renameSync: (a, b) => { calls.push(`rename ${path.basename(String(a)).replace(/\.\d+\./, '.PID.')} ${path.basename(String(b))}`); fs.renameSync(a, b); },
    } });
    calls.length = 0;
    s.set('hub_theme_v1', 'dark');
    expect(calls).toEqual(['write', 'fsync', 'rename store.json.PID.tmp store.json', 'fsync-dir']);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'store.json'), 'utf8'))).toEqual({ v: 1, keys: { hub_theme_v1: 'dark' } });
    s.del('hub_theme_v1');
    s.close();
    opened.length = 0;
    expect(open().get('hub_theme_v1')).toBeNull();
  });
  test('a write the kernel cut short: nothing renamed, the old file stays, the store is failed', () => {
    let cut = false;
    const s = open({ io: shortTemps(() => cut) });
    s.set('p', '1');
    const before = fs.readFileSync(path.join(dir, 'store.json'), 'utf8');
    cut = true;
    expect(said(() => { s.set('p', '2'); })).toBe('TERM_STORE_FAILED: a write to the store was cut short');
    expect(s.get('p')).toBe('1');
    expect(s.failed()).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'store.json'), 'utf8')).toBe(before);
    expect(temps()).toEqual([]);
    s.close();
    opened.length = 0;
    expect(open().get('p')).toBe('1');
  });
  test('a failed rename leaves the old value as the read-back and fails the store', () => {
    let fail = false;
    const s = open({ io: { renameSync: (a, b) => { if (fail) throw new Error('EIO'); fs.renameSync(a, b); } } });
    s.set('p', '1');
    fail = true;
    expect(code(() => { s.set('p', '2'); })).toBe('TERM_STORE_FAILED');
    expect(s.get('p')).toBe('1');
  });
  for (const bad of ['{', '[]', '{"v":2,"keys":{}}', '{"v":1,"keys":{"a":1}}', '{"v":1,"keys":{},"more":1}', '{"v":1,"keys":[]}']) {
    test(`unreadable content ${bad}: the store is not used, the file is kept`, () => {
      open().close();
      opened.length = 0;
      fs.writeFileSync(path.join(dir, 'store.json'), bad, { mode: 0o600 });
      expect(code(() => open())).toBe('TERM_STORE_CORRUPT');
      expect(fs.readFileSync(path.join(dir, 'store.json'), 'utf8')).toBe(bad);
    });
  }
});

describe('one writer', () => {
  test('a second Hub finds the lock held (the real flock): read-only, reads what is there, writes nothing', () => {
    const s = open();
    s.journalSet('a', '1');
    s.set('p', 'q');
    const listing = (): string[] => fs.readdirSync(dir).map((f) => `${f}:${fs.statSync(path.join(dir, f)).size}`).sort();
    const before = listing();
    // flock belongs to the open file, not the process: a second open here is refused as another process's would be.
    const second = openHubStore(dir, { home, tryLock: flock });
    expect(second.readOnly).toBe('busy');
    expect([second.journalGet('a'), second.get('p')]).toEqual(['1', 'q']);
    expect(code(() => { second.journalSet('b', '2'); })).toBe('TERM_STORE_READ_ONLY');
    expect(code(() => { second.journalDel('a'); })).toBe('TERM_STORE_READ_ONLY');
    expect(code(() => { second.set('x', 'y'); })).toBe('TERM_STORE_READ_ONLY');
    expect(code(() => { second.del('p'); })).toBe('TERM_STORE_READ_ONLY');
    second.close();
    expect(listing()).toEqual(before);
    // The first Hub still writes; once it leaves, the next opener holds the lock.
    s.journalSet('a', '2');
    s.close();
    opened.length = 0;
    const next = open();
    expect(next.readOnly).toBeNull();
    expect(next.journalGet('a')).toBe('2');
  });
  test('a read-only opener does not cut a dropped tail (the writer may be in that write)', () => {
    const s = open();
    s.journalSet('a', '1');
    s.close();
    opened.length = 0;
    fs.appendFileSync(J(), '{"v":1,"n":2');
    const text = fs.readFileSync(J(), 'utf8');
    const ro = open({ tryLock: () => false });
    expect(ro.readOnly).toBe('busy');
    expect(ro.droppedTail).toBe(true);
    expect(fs.readFileSync(J(), 'utf8')).toBe(text);
    ro.close();
    expect(fs.readFileSync(J(), 'utf8')).toBe(text);
  });
});
