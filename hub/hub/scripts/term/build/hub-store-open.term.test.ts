// Opening an account's store for a start (build/hub-store-open.ts). Real files in a private temp directory, the C
// library's flock, and the Hub's own storage seam (src/term/env/persist.ts) and change-store adapter
// (src/term/app/live-records.ts) over them: what one Hub wrote is what the next one finds.
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { KeyValueStore } from '../../../src/core/host-env';
import { changeStoreOver, recordKept, storeModeOf } from '../../../src/term/app/live-records';
import { persistentStore } from '../../../src/term/env/persist';
import { hubStoreDir, journalLine, openHubStore, systemTryLock, type StoreIo, type TryLock } from './hub-store';
import { KEPT_ASIDE_MAX, RESUME_KEY, openAccountStore, readResume, storeNoticeText, storeNoticeToast, writeResume, type OpenedStore, type StoreNotice } from './hub-store-open';

const API = 'https://api.example.invalid';
const UID = '64f0ada00000000000000001';
let home = '';
let dir = '';
let flock: TryLock = () => true;
const opened: OpenedStore[] = [];
beforeAll(async () => { flock = await systemTryLock(); });
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-store-open-test-'));
  fs.chmodSync(home, 0o700);
  dir = hubStoreDir(home, API, UID)!;
});
afterEach(() => {
  for (const s of opened.splice(0)) s.close();
  fs.rmSync(home, { recursive: true, force: true });
});
const open = (o: { tryLock?: TryLock; now?: () => number; pid?: number; io?: Partial<StoreIo>; home?: string | undefined } = {}): OpenedStore => {
  const s = openAccountStore({ home, apiOrigin: API, uid: UID, tryLock: flock, ...o });
  opened.push(s);
  return s;
};
const leave = (s: OpenedStore): void => { s.close(); opened.splice(opened.indexOf(s), 1); };
const names = (): string[] => fs.readdirSync(dir).sort();
const listing = (): string[] => names().map((f) => `${f}:${fs.readFileSync(path.join(dir, f), 'utf8')}`);
const memory = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
};
/** A held change as core's change store writes it (core/change-store.ts StoredChange): sent, no answer yet. */
const CHANGE_ID = `${UID}\u0001computers.rename\u00016f1d`;
const heldChange = JSON.stringify([{
  id: CHANGE_ID, pending: true, key: 'idem-2f6c1a', at: 1_800_000_000_000, fmt: 1, inc: 'a1B2', nonce: 'c3D4', t: 1_800_000_000_001,
  meta: { base: API, target: { project: { id: 'a'.repeat(24) }, computer: { id: 'b'.repeat(24) } }, realm: 'f'.repeat(24), by: UID },
  sending: { tab: 't1', at: 1_800_000_000_002 },
}]);

describe('a first start', () => {
  test('creates the store, writable, with nothing to say', () => {
    const s = open({ now: () => 1234 });
    expect(s.notice).toBeNull();
    expect(storeNoticeText(s.notice)).toBeNull();
    expect(s.area!.readOnly).toBeNull();
    expect(s.openedAt).toBe(1234);
    expect(storeModeOf(s.area)).toBe('rw');
    expect(names()).toEqual(['journal.jsonl', 'lock']);
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    for (const f of names()) expect(fs.statSync(path.join(dir, f)).mode & 0o777).toBe(0o600);
  });
  test('no home directory: no store, nothing written anywhere, and the notice says changes are off', () => {
    for (const h of [undefined, '', 'relative/home', '/']) {
      const s = open({ home: h });
      expect(s.area).toBeNull();
      expect(s.notice?.reason).toBe('no-home');
      expect(storeNoticeText(s.notice)).toContain('changes are off');
      expect(storeModeOf(s.area)).toBe('none');
      s.close();
    }
    expect(fs.readdirSync(home)).toEqual([]);
  });
  test('a store directory others can write: not used, not changed', () => {
    leave(open());
    fs.chmodSync(dir, 0o777);
    const before = listing();
    const s = open();
    expect(s.area).toBeNull();
    expect(s.notice?.reason).toBe('unsafe');
    expect(storeNoticeText(s.notice)).toContain(dir);
    expect(listing()).toEqual(before);
  });
});

describe('restart: what one Hub kept, the next one finds', () => {
  test('a change that was sent and never answered is still held, pending, after the Hub was killed', () => {
    const first = open();
    const seam = persistentStore(memory(), first.area!);
    // Core's hold, through the seam: on disk when setItem returns.
    expect(changeStoreOver(seam, { droppedTail: false }).write(heldChange)).toBe(true);
    seam.setItem('hub_theme_v1', 'dark');
    expect(writeResume(first.area, { page: 'computers', realmId: 'f'.repeat(24) })).toBe(true);
    // Killed: no close, no compaction. Only its lock goes (the kernel drops a dead process's flock).
    const killedAt = listing();
    opened.length = 0;
    const next = open({ tryLock: () => true });
    expect(listing()).toEqual(killedAt);
    expect(next.notice).toBeNull();
    const again = persistentStore(memory(), next.area!);
    const shown = JSON.parse(changeStoreOver(again, { droppedTail: next.area!.droppedTail }).read()!) as Array<Record<string, unknown>>;
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ id: CHANGE_ID, pending: true, key: 'idem-2f6c1a' });
    // Row 6 of the send gate reads the same record (live-records.ts): this hold, durably kept.
    expect(recordKept(next.area, { id: CHANGE_ID, token: 'a1B2#c3D4' })).toBe(true);
    expect(again.getItem('hub_theme_v1')).toBe('dark');
    expect(readResume(next.area)).toEqual({ page: 'computers', realmId: 'f'.repeat(24) });
  });
  test('killed inside the write of a held change (a cut last line): the earlier record stands and the store is writable', () => {
    const first = open();
    persistentStore(memory(), first.area!).setItem('hub.v3.changes', heldChange);
    opened.length = 0;
    const whole = journalLine({ v: 1, n: 2, t: 5, key: 'hub.v3.changes', op: 'set', value: '[]' });
    fs.appendFileSync(path.join(dir, 'journal.jsonl'), whole.slice(0, whole.length >> 1));
    const next = open({ tryLock: () => true });
    expect(next.notice).toBeNull();
    expect(next.area!.droppedTail).toBe(true);
    expect(next.area!.journalGet('hub.v3.changes')).toBe(heldChange);
    next.area!.journalSet('hub.v3.changes', '[]');
    leave(next);
    const third = open({ tryLock: () => true });
    expect(third.area!.droppedTail).toBe(false);
    expect(third.area!.journalGet('hub.v3.changes')).toBe('[]');
  });
  test('after an orderly leave the next start reads the same values', () => {
    const first = open();
    first.area!.journalSet('hub.v3.changes', heldChange);
    first.area!.set('hub_theme_v1', 'light');
    leave(first);
    const next = open();
    expect(next.area!.readOnly).toBeNull();
    expect([next.area!.journalGet('hub.v3.changes'), next.area!.get('hub_theme_v1')]).toEqual([heldChange, 'light']);
  });
});

describe('killed between the write of the new file and its rename', () => {
  /** A Hub that dies at the rename: the call never returns and nothing after it runs (no cleanup of the temp file). */
  const dieAtRename = (): Partial<StoreIo> => ({
    renameSync: (() => { throw new Error('killed'); }) as typeof fs.renameSync,
    unlinkSync: (() => { throw new Error('killed'); }) as typeof fs.unlinkSync,
  });
  test('preferences: the old value stands, the leftover file is removed, and the same process id can write again', () => {
    const a = open({ pid: 4242 });
    a.area!.set('hub_theme_v1', 'light');
    leave(a);
    const dying = openHubStore(dir, { home, tryLock: () => true, pid: 4242, io: dieAtRename() });
    expect(() => { dying.set('hub_theme_v1', 'dark'); }).toThrow();
    expect(names()).toContain('store.json.4242.tmp');
    expect(fs.readFileSync(path.join(dir, 'store.json.4242.tmp'), 'utf8')).toContain('dark');
    const next = open({ pid: 4242 });
    expect(next.notice).toBeNull();
    expect(next.area!.get('hub_theme_v1')).toBe('light');
    expect(names()).toEqual(['journal.jsonl', 'lock', 'store.json']);
    next.area!.set('hub_theme_v1', 'dark');
    expect(next.area!.failed()).toBe(false);
    leave(next);
    expect(open().area!.get('hub_theme_v1')).toBe('dark');
  });
  test('the journal\'s compaction: every acknowledged record is still there, the leftover file is removed', () => {
    const dying = openHubStore(dir, { home, tryLock: () => true, pid: 4242, io: dieAtRename(), limits: { compactAt: 64 } });
    dying.journalSet('hub.v3.changes', heldChange); // crosses the bound: the line is durable, the compaction dies at its rename
    expect(names()).toContain('journal.jsonl.4242.tmp');
    const next = open({ pid: 4242 });
    expect(next.notice).toBeNull();
    expect(next.area!.journalGet('hub.v3.changes')).toBe(heldChange);
    expect(names()).toEqual(['journal.jsonl', 'lock']);
    leave(next); // the orderly leave compacts under the same process id: the name was free
    expect(open().area!.journalGet('hub.v3.changes')).toBe(heldChange);
  });
  test('a second Hub removes nothing: the temporary file may be the first Hub\'s write in progress', () => {
    const first = open();
    first.area!.set('hub_theme_v1', 'light');
    fs.writeFileSync(path.join(dir, 'store.json.777.tmp'), 'in progress', { mode: 0o600 });
    const before = listing();
    const second = open();
    expect(second.area!.readOnly).toBe('busy');
    expect(listing()).toEqual(before);
  });
});

describe('a file that cannot be read starts empty, and the Hub says so', () => {
  const damage: Array<[string, 'store.json' | 'journal.jsonl', () => void]> = [
    ['preferences that are not JSON', 'store.json', () => { fs.writeFileSync(path.join(dir, 'store.json'), '{"v":1,"keys":{"hub_theme', { mode: 0o600 }); }],
    ['preferences of another version (a foreign file)', 'store.json', () => { fs.writeFileSync(path.join(dir, 'store.json'), JSON.stringify({ v: 2, entries: [] }), { mode: 0o600 }); }],
    ['a journal line changed after it was written', 'journal.jsonl', () => { const f = path.join(dir, 'journal.jsonl'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('idem-2f6c1a', 'idem-000000')); }],
    ['a journal that is some other file', 'journal.jsonl', () => { fs.writeFileSync(path.join(dir, 'journal.jsonl'), 'not a journal\n', { mode: 0o600 }); }],
  ];
  for (const [what, file, hurt] of damage) {
    test(`${what}: set aside, that file empty, the other file untouched`, () => {
      const first = open();
      first.area!.journalSet('hub.v3.changes', heldChange);
      first.area!.set('hub_theme_v1', 'dark');
      opened.length = 0; // killed: the journal keeps its one line
      hurt();
      const bad = fs.readFileSync(path.join(dir, file), 'utf8');
      const next = open({ tryLock: () => true, now: () => 7000 });
      expect(next.notice).toEqual({ reason: 'reset', dir, files: [{ file, keptAs: `${file}.unreadable-7000` }] });
      expect(fs.readFileSync(path.join(dir, `${file}.unreadable-7000`), 'utf8')).toBe(bad);
      expect(next.area!.readOnly).toBeNull();
      expect(storeModeOf(next.area)).toBe('rw');
      expect([next.area!.journalGet('hub.v3.changes'), next.area!.get('hub_theme_v1')]).toEqual(file === 'store.json' ? [heldChange, null] : [null, 'dark']);
      const said = storeNoticeText(next.notice)!;
      expect(said).toContain(path.join(dir, `${file}.unreadable-7000`));
      expect(said.includes('still open')).toBe(file === 'journal.jsonl');
      // Usable from here on, and the next start has nothing left to report.
      next.area!.journalSet('hub.v3.changes', '[]');
      next.area!.set('hub_theme_v1', 'light');
      leave(next);
      const third = open({ tryLock: () => true });
      expect(third.notice).toBeNull();
      expect([third.area!.journalGet('hub.v3.changes'), third.area!.get('hub_theme_v1')]).toEqual(['[]', 'light']);
    });
  }
  test('both files unreadable: both set aside, one notice naming both', () => {
    leave(open());
    fs.writeFileSync(path.join(dir, 'store.json'), 'x', { mode: 0o600 });
    fs.writeFileSync(path.join(dir, 'journal.jsonl'), 'y\n', { mode: 0o600 });
    const s = open({ now: () => 9 });
    expect(s.notice?.reason).toBe('reset');
    expect(s.notice!.files.map((f) => f.file).sort()).toEqual(['journal.jsonl', 'store.json']);
    expect(s.area!.readOnly).toBeNull();
    expect(names()).toEqual(['journal.jsonl', 'journal.jsonl.unreadable-9', 'lock', 'store.json.unreadable-9']);
  });
  test('while another Hub is open nothing is moved: no store for this start, the file as it was', () => {
    const first = open();
    first.area!.set('hub_theme_v1', 'dark');
    fs.writeFileSync(path.join(dir, 'store.json'), 'damaged', { mode: 0o600 });
    const before = listing();
    const second = open();
    expect(second.area).toBeNull();
    expect(second.notice).toEqual({ reason: 'unreadable', dir, files: [{ file: 'store.json', keptAs: null }] });
    expect(storeNoticeText(second.notice)).toContain('Close any other Hub');
    expect(listing()).toEqual(before);
    // The first Hub's own copy is whole; its next write replaces the damaged file.
    first.area!.set('hub_hl_v1', 'teal');
    leave(first);
    const third = open();
    expect(third.notice).toBeNull();
    expect([third.area!.get('hub_theme_v1'), third.area!.get('hub_hl_v1')]).toEqual(['dark', 'teal']);
  });
  test(`at most ${KEPT_ASIDE_MAX} set-aside copies of a file are kept, the newest ones`, () => {
    leave(open());
    for (let i = 1; i <= KEPT_ASIDE_MAX + 2; i++) {
      fs.writeFileSync(path.join(dir, 'store.json'), `bad ${i}`, { mode: 0o600 });
      const s = open({ now: () => i * 10 });
      expect(s.notice?.reason).toBe('reset');
      leave(s);
    }
    const kept = names().filter((f) => f.startsWith('store.json.unreadable-'));
    expect(kept).toEqual([30, 40, 50].map((n) => `store.json.unreadable-${n}`));
    expect(fs.readFileSync(path.join(dir, 'store.json.unreadable-50'), 'utf8')).toBe('bad 5');
  });
  test('two set aside in the same millisecond keep both', () => {
    leave(open());
    for (const text of ['bad 1', 'bad 2']) {
      fs.writeFileSync(path.join(dir, 'store.json'), text, { mode: 0o600 });
      leave(open({ now: () => 100 }));
    }
    expect(names().filter((f) => f.includes('unreadable'))).toEqual(['store.json.unreadable-100', 'store.json.unreadable-101']);
  });
});

describe('a store that cannot be opened for another reason', () => {
  test('a disk error at open is "failed", never "not private to you"; nothing is changed', () => {
    leave(open());
    const before = listing();
    const s = open({ io: { readFileSync: (() => { throw Object.assign(new Error('EIO'), { code: 'EIO' }); }) as typeof fs.readFileSync } });
    expect(s.area).toBeNull();
    expect(s.notice).toEqual({ reason: 'failed', dir, files: [] });
    const said = storeNoticeText(s.notice)!;
    expect(said).toContain('could not be opened');
    expect(said).not.toContain('private');
    expect(said).toContain('changes are off');
    expect(listing()).toEqual(before);
  });
  test('another Hub takes the lock right after a file was set aside: the notice says both, and this Hub writes nothing', () => {
    leave(open());
    fs.writeFileSync(path.join(dir, 'store.json'), 'damaged', { mode: 0o600 });
    // The lock is free for the set-aside (call 2), then held by the other Hub when the store opens again (call 3).
    let calls = 0;
    const s = open({ tryLock: () => ++calls === 2, now: () => 5 });
    expect(calls).toBe(3);
    expect(s.notice).toEqual({ reason: 'reset', dir, files: [{ file: 'store.json', keptAs: 'store.json.unreadable-5' }], busy: true });
    expect(s.area!.readOnly).toBe('busy');
    const said = storeNoticeText(s.notice)!;
    expect(said).toContain('started again empty');
    expect(said).toContain('changes are off in this one');
  });
});

describe('the notice for the Hub (a toast at start)', () => {
  test('every reason has a title and the terminal\'s sentence without the command name; no notice, no toast', () => {
    expect(storeNoticeToast(null)).toBeNull();
    const reasons: StoreNotice['reason'][] = ['no-home', 'unsafe', 'unreadable', 'failed', 'reset', 'busy'];
    const titles = new Set<string>();
    for (const reason of reasons) {
      const n: StoreNotice = { reason, dir: '/home/x/.hoody/hub/abc', files: reason === 'reset' ? [{ file: 'journal.jsonl', keptAs: 'journal.jsonl.unreadable-1' }] : [] };
      const t = storeNoticeToast(n)!;
      titles.add(t.title);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.title.length).toBeLessThanOrEqual(40);
      expect(t.body).not.toContain('hoody hub:');
      expect(t.body.charAt(0)).toBe(t.body.charAt(0).toUpperCase());
      expect(storeNoticeText(n)!.toLowerCase()).toBe(('hoody hub: ' + t.body).toLowerCase());
    }
    expect(titles.size).toBe(reasons.length);
  });
});

describe('two Hubs at once', () => {
  test('the second reads, writes nothing and says why; the first keeps writing; the files stay whole', () => {
    const first = open();
    first.area!.journalSet('hub.v3.changes', heldChange);
    first.area!.set('hub_theme_v1', 'dark');
    const before = listing();
    const second = open();
    expect(second.notice).toEqual({ reason: 'busy', dir, files: [] });
    expect(storeNoticeText(second.notice)).toContain('another Hub is open');
    expect(storeModeOf(second.area)).toBe('ro');
    expect([second.area!.journalGet('hub.v3.changes'), second.area!.get('hub_theme_v1')]).toEqual([heldChange, 'dark']);
    // Through the Hub's seam: a held change is refused (core then sends nothing), a preference lives for that mount only.
    const seam = persistentStore(memory(), second.area!);
    expect(changeStoreOver(seam, { droppedTail: false }).write('[]')).toBe(false);
    seam.setItem('hub_theme_v1', 'light');
    expect(seam.getItem('hub_theme_v1')).toBe('light');
    expect(writeResume(second.area, { page: 'home' })).toBe(false);
    expect(recordKept(second.area, { id: CHANGE_ID, token: 'a1B2#c3D4' })).toBe(false);
    leave(second);
    expect(listing()).toEqual(before);
    for (let i = 0; i < 20; i++) first.area!.set('hub_hl_v1', `c${i}`);
    first.area!.journalSet('hub.v3.changes', '[]');
    leave(first);
    const third = open();
    expect(third.notice).toBeNull();
    expect([third.area!.journalGet('hub.v3.changes'), third.area!.get('hub_theme_v1'), third.area!.get('hub_hl_v1')]).toEqual(['[]', 'dark', 'c19']);
  });
});

describe('the last place (term.resume)', () => {
  test('kept beside the preferences, never in the journal; written only when it changed', () => {
    const s = open();
    expect(readResume(s.area)).toEqual({});
    expect(writeResume(s.area, { page: 'files', realmId: 'all' })).toBe(true);
    expect(s.area!.get(RESUME_KEY)).toBe('{"page":"files","realmId":"all"}');
    expect(fs.readFileSync(path.join(dir, 'journal.jsonl'), 'utf8')).toBe('');
    const stamp = fs.statSync(path.join(dir, 'store.json')).ino;
    expect(writeResume(s.area, { page: 'files', realmId: 'all' })).toBe(true);
    expect(fs.statSync(path.join(dir, 'store.json')).ino).toBe(stamp);
    expect(readResume(s.area)).toEqual({ page: 'files', realmId: 'all' });
  });
  test('only a page id and a realm of the right shape are written or read back', () => {
    const s = open();
    expect(writeResume(s.area, { page: '/computers/abc?x=hdy_secretsecret', realmId: 'not-a-realm' })).toBe(true);
    expect(s.area!.get(RESUME_KEY)).toBe('{}');
    for (const stored of ['nonsense', '[]', '"x"', JSON.stringify({ page: 'Home', realmId: 'F'.repeat(24), extra: 1 }), JSON.stringify({ page: 7 })]) {
      s.area!.set(RESUME_KEY, stored);
      expect(readResume(s.area)).toEqual({});
    }
    s.area!.set(RESUME_KEY, JSON.stringify({ page: 'ai-chat', realmId: 'not', other: 'x' }));
    expect(readResume(s.area)).toEqual({ page: 'ai-chat' });
    expect(readResume(null)).toEqual({});
    expect(writeResume(null, { page: 'home' })).toBe(false);
  });
  test('a store that failed keeps nothing more and answers false', () => {
    let fail = false;
    const s = open({ io: { fsyncSync: ((fd: number) => { if (fail) throw new Error('EIO'); fs.fsyncSync(fd); }) as typeof fs.fsyncSync } });
    expect(writeResume(s.area, { page: 'home' })).toBe(true);
    fail = true;
    expect(writeResume(s.area, { page: 'files' })).toBe(false);
    fail = false;
    expect(writeResume(s.area, { page: 'files' })).toBe(false);
    expect(readResume(s.area)).toEqual({ page: 'home' });
  });
});
