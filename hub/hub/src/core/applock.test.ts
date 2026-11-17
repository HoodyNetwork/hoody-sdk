// applock.test.ts: the passcode engine. Tabs are separate module instances
// over one shared storage, one fake Web Locks (FIFO exclusion, AbortSignal on queued requests), one message bus and a
// pausable fake PBKDF2; plus one real-WebCrypto known-answer test and the writeRecordChecked call-site enumeration.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Applock from './applock';
import { cryptPartitioned } from './cryptStore';
import { partitioned, store as kitStore } from './kit-io';
import { localSetting } from './prefs';
import { setTint } from './realm';
import { registryEntry } from './registry';
import { installShared, shared, storageEntry, type Shared } from './session';

type Mod = typeof Applock;
const UID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const KEY = 'hub_lock:' + UID;
const PASS = '482913';
const NEWPASS = '730215';
const HERE = dirname(fileURLToPath(import.meta.url));
const APPLOCK_SRC = join(HERE, 'applock.ts');

// ── Harness ───────────────────────────────────────────────

/** Every setItem/removeItem/clear touching the `hub_lock` family during the engine tests, from the harness store or
 *  from the browser's own Storage, with the applock.ts line that made it. */
const lockOps: Array<{ op: 'set' | 'remove' | 'clear'; key: string; line: number | null; via: 'fake' | 'real' }> = [];
function callerLine(): number | null {
  const st = new Error().stack ?? '';
  for (const l of st.split('\n')) {
    const m = /applock\.ts:(\d+):\d+/.exec(l);
    if (m && !l.includes('applock.test.ts')) return Number(m[1]);
  }
  return null;
}

let map: Map<string, string>;
function makeStore() {
  return {
    getItem: (k: string) => {
      if (hooks.onGet) hooks.onGet(k);
      return map.has(k) ? (map.get(k) as string) : null;
    },
    setItem: (k: string, v: string) => {
      if (k.startsWith('hub_lock')) lockOps.push({ op: 'set', key: k, line: callerLine(), via: 'fake' });
      if (hooks.beforeSet) hooks.beforeSet(k);
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      if (k.startsWith('hub_lock')) lockOps.push({ op: 'remove', key: k, line: callerLine(), via: 'fake' });
      map.delete(k);
    },
  };
}

// The browser's Storage itself: an engine (or any code under test) reaching localStorage directly is seen too. Fixture
// seeding and cleanup run inside seed() and are not recorded; everything else is.
let seeding = 0;
function seed(fn: () => void): void { seeding++; try { fn(); } finally { seeding--; } }
const realStorage = { set: Storage.prototype.setItem, remove: Storage.prototype.removeItem, clear: Storage.prototype.clear };
Storage.prototype.setItem = function (this: Storage, k: string, v: string): void {
  if (!seeding && String(k).startsWith('hub_lock')) lockOps.push({ op: 'set', key: String(k), line: callerLine(), via: 'real' });
  realStorage.set.call(this, k, v);
};
Storage.prototype.removeItem = function (this: Storage, k: string): void {
  if (!seeding && String(k).startsWith('hub_lock')) lockOps.push({ op: 'remove', key: String(k), line: callerLine(), via: 'real' });
  realStorage.remove.call(this, k);
};
Storage.prototype.clear = function (this: Storage): void {
  if (!seeding && Object.keys(this).some((k) => k.startsWith('hub_lock'))) lockOps.push({ op: 'clear', key: '*', line: callerLine(), via: 'real' });
  realStorage.clear.call(this);
};
const hooks: { beforeSet?: (k: string) => void; onGet?: (k: string) => void } = {};

type Entry = { cb: (l: unknown) => unknown; resolve: (v: unknown) => void; reject: (e: unknown) => void; signal?: AbortSignal; onAbort?: () => void };
class FakeLocks {
  held = new Set<string>();
  grants: string[] = [];
  queues = new Map<string, Entry[]>();
  /** Real Web Locks may resolve request() in a later task after the callback ended: model that window. */
  afterBody: (() => void) | null = null;
  /** Only exclusive requests are modelled: any other mode is refused, so a shared-mode engine fails every test. */
  request = (name: string, o: { mode?: string; signal?: AbortSignal }, cb: (l: unknown) => unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (o.mode !== 'exclusive') { reject(new TypeError('FakeLocks models exclusive requests only')); return; }
      if (o.signal?.aborted) { reject(new DOMException('aborted', 'AbortError')); return; }
      const q = this.queues.get(name) ?? [];
      this.queues.set(name, q);
      const e: Entry = { cb, resolve, reject, signal: o.signal };
      if (o.signal) {
        e.onAbort = () => {
          const i = q.indexOf(e);
          if (i >= 0) { q.splice(i, 1); reject(new DOMException('aborted', 'AbortError')); }
        };
        o.signal.addEventListener('abort', e.onAbort);
      }
      q.push(e);
      this.pump(name);
    });
  pump(name: string): void {
    if (this.held.has(name)) return;
    const q = this.queues.get(name);
    const e = q?.shift();
    if (!e) return;
    this.held.add(name);
    Promise.resolve()
      .then(() => {
        // As the spec's queue processing: a request aborted before its callback runs is rejected, never granted.
        if (e.signal && e.onAbort) e.signal.removeEventListener('abort', e.onAbort);
        if (e.signal?.aborted) throw new DOMException('aborted', 'AbortError');
        this.grants.push(name);
        return e.cb({ name });
      })
      .then(
        (v) => {
          this.held.delete(name);
          const hook = this.afterBody;
          if (!hook) { e.resolve(v); this.pump(name); return; }
          this.afterBody = null;
          setTimeout(() => { hook(); e.resolve(v); this.pump(name); }, 0);
        },
        (err) => { this.held.delete(name); e.reject(err); this.pump(name); },
      );
  }
  waiting(name: string): number { return this.queues.get(name)?.length ?? 0; }
}

/** The fake PBKDF2: deterministic in (passcode, salt, iterations); `pause` parks each derivation until `go()`. */
const crypto = {
  pause: false,
  fail: false,
  parked: [] as Array<() => void>,
  calls: 0,
  go(): void { const p = crypto.parked.shift(); p?.(); },
};
const subtle = {
  importKey: async (_f: string, bytes: Uint8Array) => ({ bytes: new Uint8Array(bytes) }),
  deriveBits: async (alg: { salt: Uint8Array; iterations: number }, key: { bytes: Uint8Array }) => {
    crypto.calls++;
    if (crypto.pause) await new Promise<void>((r) => crypto.parked.push(r));
    if (crypto.fail) throw new Error('crypto');
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = ((key.bytes[i % key.bytes.length] as number) * 31 + (alg.salt[i % alg.salt.length] as number) + i * 7 + alg.iterations) & 255;
    return out.buffer;
  },
} as unknown as SubtleCrypto;

let locks: FakeLocks;
const clock = { now: 1_800_000_000_000, mono: 0 };
let seq = 0;
const rnd = (n: number): Uint8Array => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (++seq * 13 + i) & 255; return b; };
let timers: Array<{ fn: () => void; ms: number; live: boolean }>;
type Bus = { tab: Tab; onData: (d: unknown) => void; onStorage: (k: string | null, v: string | null) => void };
let bus: Bus[];
let channel = true;

interface Tab {
  m: Mod;
  sid: string;
  visible: boolean;
  uid: string | null;
  /** For each terminal call: whether `hub-lock:<uid>` was held at that moment (must be false). */
  terminals: boolean[];
  noLocks: boolean;
}

async function tab(o: { sid?: string; uid?: string | null } = {}): Promise<Tab> {
  vi.resetModules();
  const m = (await import('./applock')) as Mod;
  const t: Tab = { m, sid: o.sid ?? 'S1', visible: true, uid: o.uid === undefined ? UID : o.uid, terminals: [], noLocks: false };
  m.configureAppLock({
    storage: () => makeStore(),
    locks: () => (t.noLocks ? null : (locks as never)),
    subtle: () => subtle,
    random: rnd,
    now: () => clock.now,
    mono: () => clock.mono,
    uid: () => t.uid,
    sessionOk: () => map.get('access_token') === t.sid,
    visible: () => t.visible,
    post: (uid) => {
      if (channel) { for (const b of bus) if (b.tab !== t) b.onData({ t: 'lock', uid }); return; }
      const k = 'hub_lock_now:' + uid;
      map.set(k, JSON.stringify({ at: clock.now, n: String(++seq) }));
      for (const b of bus) if (b.tab !== t) b.onStorage(k, map.get(k) as string);
    },
    listen: (onData, onStorage) => {
      const b = { tab: t, onData, onStorage };
      bus.push(b);
      return () => { bus = bus.filter((x) => x !== b); };
    },
    terminal: () => { t.terminals.push(locks.held.has('hub-lock:' + UID)); },
    timer: (fn, ms) => { const e = { fn, ms, live: true }; timers.push(e); return () => { e.live = false; }; },
  });
  m.startLockReceiver();
  return t;
}

async function flush(n = 20): Promise<void> {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
}
async function until(pred: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !pred(); i++) await new Promise((r) => setTimeout(r, 0));
  expect(pred()).toBe(true);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test reads and rewrites the raw stored record
const rec = (): Record<string, any> => JSON.parse(map.get(KEY) as string);
const settings: { digits: boolean; idleMin: 1 | 5 | 15 | 60; onLeave: boolean } = { digits: true, idleMin: 5, onLeave: false };

/** Signed in (sid S1) with a passcode set by a throwaway tab. */
async function withPasscode(over: Partial<typeof settings> = {}): Promise<void> {
  const s = await tab();
  expect(await s.m.setPasscode(PASS, { ...settings, ...over })).toBe('set');
}
/** A fresh page load: a new module instance through the boot gate. */
async function load(o: { sid?: string } = {}): Promise<Tab> {
  const t = await tab(o);
  t.m.bootGate();
  return t;
}
function writeTries(t: Partial<{ n: number; until: number; pending: null | { id: string; at: number }; out: boolean }>): void {
  const r = rec();
  r.tries = { ...r.tries, ...t };
  map.set(KEY, JSON.stringify(r));
}
/** What Forget does to storage (shared.js forgetBrowser order): credentials first, then every record. */
function forgetStorage(): void {
  map.delete('access_token');
  for (const k of [...map.keys()]) if (k.startsWith('hub_lock:')) map.delete(k);
}
/** Arms a Forget at the checked read (step 1) of the one writeRecordChecked call on the applock.ts line holding
 *  `marker`, so every step before that writer has succeeded. `fired()` proves the targeted boundary was reached. */
function forgetAtWriter(marker: string): { fired: () => boolean } {
  const lines = readFileSync(APPLOCK_SRC, 'utf8').split('\n');
  const hits = lines.flatMap((l, i) => (l.includes(marker) && l.includes('writeRecordChecked(') ? [i + 1] : []));
  expect(hits.length, 'writer line for ' + marker).toBe(1);
  const at = 'applock.ts:' + hits[0] + ':';
  let fired = false;
  hooks.onGet = (k) => {
    if (fired || k !== KEY) return;
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 50;
    const st = new Error().stack ?? '';
    Error.stackTraceLimit = limit;
    if (!/at writeRecordChecked \(/.test(st) || !st.includes(at)) return;
    fired = true;
    forgetStorage();
  };
  return { fired: () => fired };
}
const W_RESERVE = 'const reserved = writeRecordChecked(';
const W_FOLD = 'cur.tries.pending ? folded(cur) : null';
const W_REFUND = 'const refund = (): WriteAnswer =>';
const W_RIGHT = 'n: 0, pending: null } } : null';
const W_OUTCOME = 'pending: null, until, out }';
const W_SETTINGS = 'writeRecordChecked(uid, (cur) => (cur ? {';

beforeEach(() => {
  map = new Map([['access_token', 'S1']]);
  locks = new FakeLocks();
  crypto.pause = false;
  crypto.fail = false;
  crypto.parked = [];
  crypto.calls = 0;
  timers = [];
  bus = [];
  channel = true;
  clock.now = 1_800_000_000_000;
  clock.mono = 0;
  delete hooks.beforeSet;
  delete hooks.onGet;
});
afterEach(() => { vi.resetModules(); });

// ── Record ────────────────────────────────────────────────

describe('record', () => {
  it('setup writes one complete, strictly valid record; any other shape is malformed', async () => {
    await withPasscode();
    const t = await tab();
    const r = rec();
    expect(Object.keys(r).sort()).toEqual(['digits', 'hash', 'idleMin', 'iter', 'kdf', 'onLeave', 'rev', 'salt', 'tries', 'v']);
    expect(r).toMatchObject({ v: 1, kdf: 'pbkdf2-sha256', iter: 600000, digits: true, idleMin: 5, onLeave: false, tries: { n: 0, until: 0, pending: null, out: false } });
    expect(t.m.validRecord(r)).toBe(true);
    for (const bad of [
      { ...r, extra: 1 }, { ...r, v: 2 }, { ...r, iter: 599999 }, { ...r, iter: 2000001 }, { ...r, salt: 'AAAA' }, { ...r, hash: r.salt },
      { ...r, rev: r.salt }, { ...r, idleMin: 2 }, { ...r, digits: 'yes' }, { ...r, tries: { ...r.tries, n: 11 } },
      { ...r, tries: { ...r.tries, until: Infinity } }, { ...r, tries: { ...r.tries, pending: { id: 'x' } } },
      { ...r, tries: { ...r.tries, pending: { id: '', at: 1 } } }, { ...r, tries: { ...r.tries, more: 1 } },
    ]) expect(t.m.validRecord(bad)).toBe(false);
  });

  it('a malformed record locks at load with no verifier: unlock answers noVerifier', async () => {
    map.set(KEY, '{"v":1}');
    const a = await load();
    expect(a.m.isLocked()).toBe(true);
    expect(a.m.lockView().record).toBe('malformed');
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'noVerifier' });
    expect(a.m.isLocked()).toBe(true);
    expect(map.get(KEY)).toBe('{"v":1}');
  });
});

// ── Per tab ───────────────────────────────────────────────

describe('per-tab lock', () => {
  it('every load with a record starts locked; without one it does not; a token session is inert', async () => {
    const none = await load();
    expect(none.m.isLocked()).toBe(false);
    await withPasscode();
    const a = await load();
    expect(a.m.isLocked()).toBe(true);
    const tok = await tab({ uid: null });
    expect(tok.m.bootGate()).toBe(false);
    expect(tok.m.isLocked()).toBe(false);
  });

  it('unlock in A leaves B locked; storage is unchanged by lock and unlock', async () => {
    await withPasscode();
    const before = map.get(KEY);
    const all = JSON.stringify([...map.entries()]);
    const a = await load();
    const b = await load();
    await flush();
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    expect(a.m.isLocked()).toBe(false);
    expect(b.m.isLocked()).toBe(true);
    expect(map.get(KEY)).toBe(before);
    a.m.lockTab();
    a.m.leaveTab();
    clock.mono += 3_600_000;
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    a.m.checkIdle();
    expect(JSON.stringify([...map.entries()])).toBe(all);
  });

  it('a reload of an unlocked tab loads locked', async () => {
    await withPasscode();
    const a = await load();
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    const again = await load();
    expect(again.m.isLocked()).toBe(true);
  });

  it('idle and leave in A leave B unlocked', async () => {
    await withPasscode({ onLeave: true, idleMin: 1 });
    const a = await load();
    const b = await load();
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    expect(await b.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    a.m.leaveTab();
    expect(a.m.isLocked()).toBe(true);
    expect(b.m.isLocked()).toBe(false);
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    clock.mono += 61_000;
    b.m.noteInput();
    expect(a.m.checkIdle()).toBe(true);
    expect(b.m.checkIdle()).toBe(false);
    expect(b.m.isLocked()).toBe(false);
  });

  it('Lock now in A locks B and C (BroadcastChannel), and with the storage fallback', async () => {
    for (const ch of [true, false]) {
      channel = ch;
      map = new Map([['access_token', 'S1']]);
      bus = [];
      await withPasscode();
      const [a, b, c] = [await load(), await load(), await load()];
      for (const t of [a, b, c]) expect(await t.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
      expect(a.m.lockNow()).toBe(true);
      expect([a.m.isLocked(), b.m.isLocked(), c.m.isLocked()]).toEqual([true, true, true]);
    }
  });

  it('a forged message with an unlock field locks and never unlocks; another uid is ignored; no field but t and uid is read', async () => {
    await withPasscode();
    const a = await load();
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    const deliver = (d: unknown): void => { for (const x of bus) if (x.tab === a) x.onData(d); };
    deliver({ t: 'lock', uid: OTHER });
    expect(a.m.isLocked()).toBe(false);
    deliver({ t: 'unlock', uid: UID });
    expect(a.m.isLocked()).toBe(false);
    const read: string[] = [];
    deliver(new Proxy({ t: 'lock', uid: UID, unlock: true, locked: false }, { get: (o, p) => { read.push(String(p)); return (o as never)[p]; } }));
    expect(a.m.isLocked()).toBe(true);
    expect(read.filter((p) => p !== 't' && p !== 'uid')).toEqual([]);
    deliver({ t: 'lock', uid: UID, unlock: true });
    expect(a.m.isLocked()).toBe(true);
  });

  it('a lock message for a tab with no passcode does not lock it', async () => {
    const a = await load();
    for (const x of bus) x.onData({ t: 'lock', uid: UID });
    expect(a.m.isLocked()).toBe(false);
  });
});

// ── Verification and tries ────────────────────────────────

describe('verification', () => {
  it('two tabs submitting together are serialised: two tries', async () => {
    await withPasscode();
    const a = await load();
    const b = await load();
    await flush();
    const [ra, rb] = await Promise.all([a.m.checkPasscode('000001x'), b.m.checkPasscode('000002x')]);
    expect(ra).toMatchObject({ k: 'wrong' });
    expect(rb).toMatchObject({ k: 'wrong' });
    expect(rec().tries.n).toBe(2);
  });

  it('wrong tries wait per wait(n); the 5th wrong waits 30 s and refuses until then', async () => {
    await withPasscode();
    const a = await load();
    await flush();
    for (let i = 1; i <= 4; i++) expect(await a.m.checkPasscode('nope' + i + 'zz')).toMatchObject({ k: 'wrong', n: i });
    expect(await a.m.checkPasscode('nope5zz')).toMatchObject({ k: 'wrong', n: 5, until: clock.now + 30_000 });
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'wait', until: clock.now + 30_000 });
    expect(rec().tries.n).toBe(5);
    clock.now += 30_000;
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    expect(rec().tries).toEqual({ n: 0, until: clock.now - 30_000 + 30_000, pending: null, out: false });
  });

  // The wait table written out here, not read from waitMs(): a changed delay for any try fails its own row.
  const WAIT_TABLE: Array<[number, number]> = [[5, 30_000], [6, 60_000], [7, 5 * 60_000], [8, 15 * 60_000], [9, 60 * 60_000]];
  it.each(WAIT_TABLE)('the wrong try n=%i writes until = now + %i ms, refuses before it and checks at it', async (n, ms) => {
    await withPasscode();
    writeTries({ n: n - 1, until: 0 });
    const a = await load();
    await flush();
    expect(await a.m.checkPasscode('nope' + n + 'zz')).toMatchObject({ k: 'wrong', n, until: clock.now + ms });
    expect(rec().tries).toMatchObject({ n, until: clock.now + ms, pending: null, out: false });
    clock.now += ms - 1;
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'wait', until: clock.now + 1 });
    expect(rec().tries.n).toBe(n);
    clock.now += 1;
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
  });

  it('tries 1 to 4 write no wait: the next check runs at once', async () => {
    await withPasscode();
    const a = await load();
    await flush();
    for (let i = 1; i <= 4; i++) {
      expect(await a.m.checkPasscode('nope' + i + 'zz')).toMatchObject({ k: 'wrong', n: i });
      expect(rec().tries.until).toBeLessThanOrEqual(clock.now);
    }
  });

  it('a killed tab\'s pending reservation folds as one wrong try with its wait (B.2b)', async () => {
    await withPasscode();
    writeTries({ n: 5, pending: { id: 'dead', at: clock.now } });
    const a = await load();
    await flush();
    expect(rec().tries).toMatchObject({ n: 5, pending: null, until: clock.now + 30_000 });
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'wait', until: clock.now + 30_000 });
  });

  it('an abandoned reservation 10 → reload → out, terminal path after release (B.25)', async () => {
    await withPasscode();
    writeTries({ n: 10, pending: { id: 'dead', at: clock.now } });
    const a = await load();
    await until(() => a.terminals.length > 0);
    expect(rec().tries.out).toBe(true);
    expect(a.terminals).toEqual([false]);
    const b = await load();
    await until(() => b.terminals.length > 0);
    expect(b.terminals).toEqual([false]);
  });

  it('the 10th wrong writes out and runs the terminal path after release', async () => {
    await withPasscode();
    writeTries({ n: 9, until: 0 });
    const a = await load();
    await flush();
    expect(await a.m.checkPasscode('wrongwrong')).toEqual({ k: 'terminal' });
    expect(rec().tries).toMatchObject({ n: 10, out: true, pending: null });
    expect(a.terminals).toEqual([false]);
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'terminal' });
  });

  it('a right answer on reservation 10 unlocks', async () => {
    await withPasscode();
    writeTries({ n: 9, until: 0 });
    const a = await load();
    await flush();
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    expect(rec().tries).toMatchObject({ n: 0, pending: null, out: false });
    expect(a.terminals).toEqual([]);
  });

  it('a crypto error refunds only its own try (B.2c)', async () => {
    await withPasscode();
    writeTries({ n: 2 });
    const a = await load();
    await flush();
    crypto.fail = true;
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'check' });
    expect(rec().tries).toMatchObject({ n: 2, pending: null });
  });

  it('the 8 s cap counts as a crypto error and refunds', async () => {
    await withPasscode();
    const a = await load();
    await flush();
    crypto.pause = true;
    const p = a.m.checkPasscode(PASS);
    await until(() => crypto.parked.length > 0);
    expect(rec().tries.n).toBe(1);
    const cap = timers.find((x) => x.live && x.ms === 8000);
    expect(cap).toBeTruthy();
    cap?.fn();
    expect(await p).toEqual({ k: 'check' });
    expect(rec().tries).toMatchObject({ n: 0, pending: null });
    expect(a.m.isLocked()).toBe(true);
  });

  it('a backgrounded tab\'s late right answer leaves it locked, tries 0 (B.4)', async () => {
    await withPasscode();
    const a = await load();
    await flush();
    crypto.pause = true;
    const p = a.m.checkPasscode(PASS);
    await until(() => crypto.parked.length > 0);
    a.visible = false;
    crypto.go();
    expect(await p).toEqual({ k: 'again' });
    expect(a.m.isLocked()).toBe(true);
    expect(rec().tries.n).toBe(0);
  });

  it('a right answer after the session changed leaves the tab locked', async () => {
    await withPasscode();
    const a = await load();
    await flush();
    crypto.pause = true;
    const p = a.m.checkPasscode(PASS);
    await until(() => crypto.parked.length > 0);
    map.set('access_token', 'S2');
    crypto.go();
    const r = await p;
    expect(r.k === 'again' || r.k === 'removed').toBe(true);
    expect(a.m.isLocked()).toBe(true);
  });

  it('every verification runs in one hold of hub-lock:<uid>', async () => {
    await withPasscode();
    const a = await load();
    await flush();
    const before = locks.grants.length;
    crypto.pause = true;
    const p = a.m.checkPasscode(PASS);
    await until(() => crypto.parked.length > 0);
    expect(locks.held.has('hub-lock:' + UID)).toBe(true);
    crypto.go();
    await p;
    expect(locks.grants.length - before).toBe(1);
  });
});

// ── Local generation and CANCEL ───────────────────────────

describe('tabGen and CANCEL', () => {
  it('right passcode, then hide and return before the derivation ends: stays locked, try refunded', async () => {
    await withPasscode();
    const a = await load();
    await flush();
    crypto.pause = true;
    const p = a.m.checkPasscode(PASS);
    await until(() => crypto.parked.length > 0);
    a.m.leaveTab();
    a.visible = true;
    expect(await p).toEqual({ k: 'cancelled' });
    expect(a.m.isLocked()).toBe(true);
    expect(rec().tries).toMatchObject({ n: 0, pending: null });
    expect(locks.held.size).toBe(0);
    crypto.go();
    await flush();
    expect(a.m.isLocked()).toBe(true);
  });

  it('a lock that lands after the hold ended but before the answer is applied keeps the tab locked (tabGen)', async () => {
    await withPasscode();
    const a = await load();
    const b = await load();
    expect(await b.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    locks.afterBody = () => { b.m.lockNow(); };
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'again' });
    expect(a.m.isLocked()).toBe(true);
    expect(rec().tries).toMatchObject({ n: 0, pending: null });
  });

  it('a hide with onLeave off after the hold ended, then a return before the answer is applied: stays locked (CANCEL)', async () => {
    await withPasscode({ onLeave: false });
    const a = await load();
    await flush();
    locks.afterBody = () => { a.visible = false; a.m.leaveTab(); a.visible = true; };
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'again' });
    expect(a.m.isLocked()).toBe(true);
    expect(a.visible).toBe(true);
  });

  it('a lock message during the check: stays locked', async () => {
    await withPasscode();
    const a = await load();
    const b = await load();
    expect(await b.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    crypto.pause = true;
    const p = a.m.checkPasscode(PASS);
    await until(() => crypto.parked.length > 0);
    b.m.lockNow();
    crypto.go();
    const r = await p;
    expect(r.k).not.toBe('unlocked');
    expect(a.m.isLocked()).toBe(true);
    expect(rec().tries).toMatchObject({ n: 0, pending: null });
  });

  it('onLeave off: a hide during the derivation refunds and releases; the tab stays as it was', async () => {
    await withPasscode({ onLeave: false });
    const a = await load();
    await flush();
    crypto.pause = true;
    const p = a.m.checkPasscode(PASS);
    await until(() => crypto.parked.length > 0);
    a.m.leaveTab();
    expect(await p).toEqual({ k: 'cancelled' });
    expect(rec().tries).toMatchObject({ n: 0, pending: null });
    expect(locks.held.size).toBe(0);
  });

  it('a request queued behind another tab is aborted by a hide and never granted', async () => {
    await withPasscode();
    const a = await load();
    const b = await load();
    await flush();
    const calls0 = crypto.calls;
    crypto.pause = true;
    const pa = a.m.checkPasscode('wrongwrong');
    await until(() => crypto.parked.length > 0);
    const pb = b.m.checkPasscode(PASS);
    await until(() => locks.waiting('hub-lock:' + UID) === 1);
    b.m.leaveTab();
    expect(await pb).toEqual({ k: 'cancelled' });
    expect(locks.waiting('hub-lock:' + UID)).toBe(0);
    crypto.go();
    expect(await pa).toMatchObject({ k: 'wrong', n: 1 });
    await flush();
    expect(crypto.calls - calls0).toBe(1);
    expect(rec().tries.n).toBe(1);
  });

  it('a lock of this tab also aborts its own queued request', async () => {
    await withPasscode();
    const a = await load();
    const b = await load();
    await flush();
    crypto.pause = true;
    const pa = a.m.checkPasscode('wrongwrong');
    await until(() => crypto.parked.length > 0);
    const pb = b.m.checkPasscode(PASS);
    await until(() => locks.waiting('hub-lock:' + UID) === 1);
    b.m.lockTab();
    expect(await pb).toEqual({ k: 'cancelled' });
    crypto.go();
    await pa;
  });
});

// ── Setup and settings ────────────────────────────────────

describe('setup and settings', () => {
  it('two tabs set at once → one record, the other refused', async () => {
    const a = await tab();
    const b = await tab();
    const [ra, rb] = await Promise.all([a.m.setPasscode(PASS, settings), b.m.setPasscode(NEWPASS, settings)]);
    expect([ra, rb].sort()).toEqual(['changed', 'set']);
    const a2 = await load();
    expect(await a2.m.checkPasscode(ra === 'set' ? PASS : NEWPASS)).toEqual({ k: 'unlocked' });
  });

  it('setup refuses weak passcodes and needs Web Locks, subtle and storage', async () => {
    const a = await tab();
    expect(await a.m.setPasscode('123', settings)).toBe('short');
    expect(await a.m.setPasscode('123456', settings)).toBe('weak');
    a.noLocks = true;
    expect(a.m.lockSupport()).toBe(false);
    expect(await a.m.setPasscode(PASS, settings)).toBe('unsupported');
    expect(map.has(KEY)).toBe(false);
  });

  it('a setup whose session is gone after its write deletes its own record', async () => {
    const a = await tab();
    hooks.beforeSet = (k) => { if (k === KEY) map.delete('access_token'); };
    expect(await a.m.setPasscode(PASS, settings)).toBe('changed');
    expect(map.has(KEY)).toBe(false);
  });

  it('setup refuses when the session changed before its in-hold check', async () => {
    const a = await tab();
    crypto.pause = true;
    const p = a.m.setPasscode(PASS, settings);
    await until(() => crypto.parked.length > 0);
    map.set('access_token', 'S2');
    crypto.go();
    expect(await p).toBe('changed');
    expect(map.has(KEY)).toBe(false);
  });

  it('change in B → locked A needs the new passcode; the change spends tries like unlocking', async () => {
    await withPasscode();
    const a = await load();
    const b = await load();
    expect(await b.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    const rev = rec().rev;
    expect(await b.m.changeLock('notitzz', { ...settings, passcode: NEWPASS })).toMatchObject({ k: 'wrong', n: 1 });
    expect(await b.m.changeLock(PASS, { ...settings, idleMin: 15, passcode: NEWPASS })).toEqual({ k: 'saved' });
    expect(rec()).toMatchObject({ idleMin: 15, tries: { n: 0, pending: null } });
    expect(rec().rev).not.toBe(rev);
    expect(await a.m.checkPasscode(PASS)).toMatchObject({ k: 'wrong' });
    expect(await a.m.checkPasscode(NEWPASS)).toEqual({ k: 'unlocked' });
  });

  it('Remove in B → locked A shows Reload (removed), never reveals', async () => {
    await withPasscode();
    const a = await load();
    const b = await load();
    expect(await b.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    expect(await b.m.removePasscode('wrongwrong')).toMatchObject({ k: 'wrong' });
    expect(map.has(KEY)).toBe(true);
    expect(await b.m.removePasscode(PASS)).toEqual({ k: 'deleted' });
    expect(map.has(KEY)).toBe(false);
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'removed' });
    expect(a.m.isLocked()).toBe(true);
    expect(a.m.lockView().removed).toBe(true);
  });

  it('settings verify and write in ONE hold', async () => {
    await withPasscode();
    const b = await load();
    expect(await b.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    const before = locks.grants.length;
    expect(await b.m.changeLock(PASS, { ...settings, onLeave: true })).toEqual({ k: 'saved' });
    expect(locks.grants.length - before).toBe(1);
    expect(rec().onLeave).toBe(true);
  });
});

// ── writeRecordChecked ──────────────────────────────

describe('writeRecordChecked: no writer recreates a record a Forget deleted (F.1)', () => {
  it('the CANCEL refund after a Forget writes nothing', async () => {
    await withPasscode();
    const a = await load();
    await flush();
    crypto.pause = true;
    const p = a.m.checkPasscode(PASS);
    await until(() => crypto.parked.length > 0);
    forgetStorage();
    a.m.leaveTab();
    expect(await p).toEqual({ k: 'removed' });
    expect(map.has(KEY)).toBe(false);
  });

  it('the wrong, right and out outcomes after a Forget write nothing', async () => {
    for (const [pass, n] of [['wrongwrong', 0], [PASS, 0], ['wrongwrong', 9]] as const) {
      map = new Map([['access_token', 'S1']]);
      crypto.pause = false;
      await withPasscode();
      writeTries({ n });
      const a = await load();
      await flush();
      crypto.pause = true;
      const p = a.m.checkPasscode(pass);
      await until(() => crypto.parked.length > 0);
      forgetStorage();
      crypto.go();
      expect(await p).toEqual({ k: 'removed' });
      expect(map.has(KEY)).toBe(false);
      expect(a.terminals).toEqual([]);
    }
  });

  it('a check queued behind a Forget stops at step 1 and writes nothing', async () => {
    await withPasscode();
    writeTries({ n: 3, pending: { id: 'dead', at: clock.now } });
    const holder = await tab();
    let release!: () => void;
    void locks.request('hub-lock:' + UID, { mode: 'exclusive' }, () => new Promise<void>((r) => { release = r; }));
    await flush();
    const a = await load();
    const p = a.m.checkPasscode(PASS);
    await flush();
    expect(locks.waiting('hub-lock:' + UID)).toBe(2);
    forgetStorage();
    release();
    expect(await p).toEqual({ k: 'removed' });
    await flush();
    expect(map.has(KEY)).toBe(false);
    void holder;
  });

  it('a settings save whose verification meets a Forget stops there and writes nothing', async () => {
    await withPasscode();
    const b = await load();
    expect(await b.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    crypto.pause = true;
    const p = b.m.changeLock(PASS, { ...settings, idleMin: 60 });
    await until(() => crypto.parked.length > 0);
    forgetStorage();
    map.set('access_token', 'S1');
    crypto.go();
    expect(await p).toEqual({ k: 'removed' });
    expect(map.has(KEY)).toBe(false);
  });

  it('a setup paused after its in-hold check while a Forget runs: its write is deleted by its own re-check', async () => {
    const a = await tab();
    let forgot = false;
    hooks.beforeSet = (k) => { if (k === KEY && !forgot) { forgot = true; forgetStorage(); } };
    expect(await a.m.setPasscode(PASS, settings)).toBe('changed');
    expect(map.has(KEY)).toBe(false);
  });

  it('a writer whose session vanished deletes only its own bytes, never a record someone changed after its write', async () => {
    await withPasscode();
    const a = await tab();
    const changed = JSON.stringify({ ...rec(), idleMin: 60 });
    a.m.configureAppLock({ sessionOk: () => { map.set(KEY, changed); return false; } });
    expect(a.m.writeRecordChecked(UID, (cur) => (cur ? { ...cur, idleMin: 15 } : null))).toBe('gone');
    expect(map.get(KEY)).toBe(changed);
    a.m.configureAppLock({ sessionOk: () => false });
    expect(a.m.writeRecordChecked(UID, (cur) => (cur ? { ...cur, idleMin: 15 } : null))).toBe('gone');
    expect(map.has(KEY)).toBe(false);
  });

  it('never writes onto an absent record unless creating, and never over a malformed one', async () => {
    await withPasscode();
    const valid = rec();
    map.delete(KEY);
    const a = await tab();
    const any = () => valid as never;
    expect(a.m.writeRecordChecked(UID, any)).toBe('gone');
    expect(map.has(KEY)).toBe(false);
    map.set(KEY, 'not json');
    expect(a.m.writeRecordChecked(UID, any, { create: true })).toBe('failed');
    expect(map.get(KEY)).toBe('not json');
  });

  it('a boot fold queued behind a Forget stops at step 1 and writes nothing', async () => {
    await withPasscode();
    writeTries({ n: 10, pending: { id: 'dead', at: clock.now } });
    let release!: () => void;
    void locks.request('hub-lock:' + UID, { mode: 'exclusive' }, () => new Promise<void>((r) => { release = r; }));
    await flush();
    const a = await load();
    expect(a.m.isLocked()).toBe(true);
    forgetStorage();
    release();
    await flush();
    expect(map.has(KEY)).toBe(false);
    expect(a.terminals).toEqual([]);
  });
});

describe('writeRecordChecked: a Forget landing at each writer\'s own checked read (F.1, targeted)', () => {
  it('the reservation', async () => {
    await withPasscode();
    const a = await load();
    await flush();
    const calls = crypto.calls;
    const probe = forgetAtWriter(W_RESERVE);
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'removed' });
    expect(probe.fired()).toBe(true);
    expect(crypto.calls).toBe(calls);
    expect(map.has(KEY)).toBe(false);
  });

  it('the step-1 fold of an abandoned reservation (a check)', async () => {
    await withPasscode();
    writeTries({ n: 3, pending: { id: 'dead', at: clock.now } });
    const a = await tab();
    const probe = forgetAtWriter(W_FOLD);
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'removed' });
    expect(probe.fired()).toBe(true);
    expect(map.has(KEY)).toBe(false);
  });

  it('the boot fold', async () => {
    await withPasscode();
    writeTries({ n: 9, pending: { id: 'dead', at: clock.now } });
    const probe = forgetAtWriter(W_FOLD);
    const a = await load();
    await until(() => probe.fired());
    await flush();
    expect(map.has(KEY)).toBe(false);
    expect(a.m.isLocked()).toBe(true);
    expect(a.m.lockView().removed).toBe(true);
    expect(a.terminals).toEqual([]);
  });

  it('the refund after a crypto error (not a CANCEL)', async () => {
    await withPasscode();
    const a = await load();
    await flush();
    crypto.fail = true;
    const probe = forgetAtWriter(W_REFUND);
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'removed' });
    expect(probe.fired()).toBe(true);
    expect(map.has(KEY)).toBe(false);
  });

  it('the refund after a CANCEL', async () => {
    await withPasscode();
    const a = await load();
    await flush();
    crypto.pause = true;
    const p = a.m.checkPasscode(PASS);
    await until(() => crypto.parked.length > 0);
    const probe = forgetAtWriter(W_REFUND);
    a.m.leaveTab();
    expect(await p).toEqual({ k: 'removed' });
    expect(probe.fired()).toBe(true);
    expect(map.has(KEY)).toBe(false);
  });

  it('the right outcome, the wrong outcome and the 10th (out)', async () => {
    for (const [pass, n, marker] of [[PASS, 0, W_RIGHT], ['wrongwrong', 0, W_OUTCOME], ['wrongwrong', 9, W_OUTCOME]] as const) {
      map = new Map([['access_token', 'S1']]);
      delete hooks.onGet;
      await withPasscode();
      writeTries({ n });
      const a = await load();
      await flush();
      const probe = forgetAtWriter(marker);
      expect(await a.m.checkPasscode(pass)).toEqual({ k: 'removed' });
      expect(probe.fired()).toBe(true);
      expect(map.has(KEY)).toBe(false);
      expect(a.terminals).toEqual([]);
    }
  });

  it('the settings write, after its verification succeeded', async () => {
    await withPasscode();
    const b = await load();
    expect(await b.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    const probe = forgetAtWriter(W_SETTINGS);
    expect(await b.m.changeLock(PASS, { ...settings, idleMin: 60 })).toEqual({ k: 'removed' });
    expect(probe.fired()).toBe(true);
    expect(map.has(KEY)).toBe(false);
  });
});

describe('harness: FakeLocks follows the Web Locks request contract the engine relies on', () => {
  it('refuses any mode but exclusive (a shared-mode engine cannot pass)', async () => {
    await expect(locks.request('x', { mode: 'shared' }, () => 1)).rejects.toBeInstanceOf(TypeError);
    await expect(locks.request('x', {}, () => 1)).rejects.toBeInstanceOf(TypeError);
  });

  it('a request aborted after it was chosen but before its callback ran is rejected, never granted', async () => {
    const c = new AbortController();
    let ran = false;
    const p = locks.request('x', { mode: 'exclusive', signal: c.signal }, () => { ran = true; });
    c.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(ran).toBe(false);
    expect(await locks.request('x', { mode: 'exclusive' }, () => 'next')).toBe('next');
  });

  it('a request queued behind a holder and aborted is rejected; the holder\'s release grants the next one', async () => {
    let release!: () => void;
    void locks.request('x', { mode: 'exclusive' }, () => new Promise<void>((r) => { release = r; }));
    await flush(2);
    const c = new AbortController();
    let ran = false;
    const p = locks.request('x', { mode: 'exclusive', signal: c.signal }, () => { ran = true; });
    c.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    const q = locks.request('x', { mode: 'exclusive' }, () => 'after');
    release();
    expect(await q).toBe('after');
    expect(ran).toBe(false);
  });
});

// ── Idle, leave, no Web Locks, rules, verifier ────────────

describe('idle and leave', () => {
  it('locks after idleMin without input; a focused Board frame adds at most 15 minutes, only while visible', async () => {
    await withPasscode({ idleMin: 1 });
    const a = await load();
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    clock.mono += 59_000;
    expect(a.m.checkIdle()).toBe(false);
    clock.mono += 2_000;
    expect(a.m.checkIdle({ frameFocus: true })).toBe(false);
    clock.mono += 15 * 60_000;
    expect(a.m.checkIdle({ frameFocus: true })).toBe(true);
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    clock.mono += 61_000;
    a.visible = false;
    expect(a.m.checkIdle({ frameFocus: true })).toBe(true);
  });

  it('leave locks only with onLeave on, but always cancels', async () => {
    await withPasscode({ onLeave: false });
    const a = await load();
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    a.m.leaveTab();
    expect(a.m.isLocked()).toBe(false);
  });

  it('a lock listener runs synchronously on every lock', async () => {
    await withPasscode();
    const a = await load();
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
    const seen: boolean[] = [];
    a.m.onLockChange(() => seen.push(a.m.isLocked()));
    a.m.lockNow();
    expect(seen).toEqual([true]);
  });
});

describe('lockView tries (not only its own answers)', () => {
  it('lockView().tries mirrors the stored n, until and out; null without a valid record', async () => {
    await withPasscode();
    writeTries({ n: 6, until: clock.now + 60_000 });
    const a = await load();
    await flush();
    expect(a.m.lockView().tries).toEqual({ n: 6, until: clock.now + 60_000, out: false });
    map.set(KEY, '{');
    expect(a.m.lockView().tries).toBeNull();
  });

  it('the boot fold of a pending reservation tells listeners, so a reloaded screen shows the folded wait', async () => {
    await withPasscode();
    writeTries({ n: 7, pending: { id: 'dead', at: clock.now } });
    const a = await tab();
    const seen: number[] = [];
    a.m.onLockChange(() => seen.push(a.m.lockView().tries?.until ?? -1));
    a.m.bootGate();
    await until(() => seen.includes(clock.now + 5 * 60_000));
    expect(a.m.lockView().tries).toMatchObject({ n: 7, out: false });
  });

  it('a terminal path at boot whose Forget left the page here tells listeners after it ran; the view says out', async () => {
    await withPasscode();
    writeTries({ n: 10, out: true });
    const a = await tab();
    const seen: number[] = [];
    a.m.onLockChange(() => seen.push(a.terminals.length));
    a.m.bootGate();
    await until(() => a.terminals.length > 0);
    await until(() => seen.some((n) => n > 0));
    expect(a.m.lockView().tries?.out).toBe(true);
  });
});

describe('the record changed in another tab', () => {
  it('a storage change of this account\'s record tells the lock view, without changing the locked state; another account\'s does not', async () => {
    await withPasscode();
    const a = await load();
    await flush();
    const seen: Array<{ locked: boolean; until: number | undefined }> = [];
    a.m.onLockChange(() => seen.push({ locked: a.m.isLocked(), until: a.m.lockView().tries?.until }));
    writeTries({ n: 5, until: clock.now + 30_000 });
    for (const b of bus) if (b.tab === a) b.onStorage(KEY, map.get(KEY) as string);
    expect(seen).toEqual([{ locked: true, until: clock.now + 30_000 }]);
    for (const b of bus) if (b.tab === a) b.onStorage('hub_lock:' + OTHER, '{}');
    expect(seen).toHaveLength(1);
    // A cleared storage area (key null) is a change of the record too.
    for (const b of bus) if (b.tab === a) b.onStorage(null, null);
    expect(seen).toHaveLength(2);
    expect(a.m.isLocked()).toBe(true);
  });
});

describe('no Web Locks (C.8)', () => {
  it('settings refuse to set; an existing record locks with Forget only', async () => {
    await withPasscode();
    const a = await tab();
    a.noLocks = true;
    a.m.bootGate();
    expect(a.m.isLocked()).toBe(true);
    await flush();
    expect(a.m.lockView().noWebLocks).toBe(true);
    expect(await a.m.checkPasscode(PASS)).toEqual({ k: 'noWebLocks' });
    expect(a.m.isLocked()).toBe(true);
  });
});

describe('passcode rules and the verifier', () => {
  it('4-64 characters after NFKC; no repeated character or straight run', async () => {
    const { passcodeProblem } = await import('./applock');
    for (const s of ['', '1', '482', 'ab9']) expect(passcodeProblem(s)).toBe('short');
    for (const ok of ['4829', 'k7#q', '48291']) expect(passcodeProblem(ok)).toBeNull();
    for (const w of ['1111', '1234', '4321', 'abcd', 'DCBA', '１２３４']) expect(passcodeProblem(w)).toBe('weak');
    expect(passcodeProblem('x'.repeat(65) + 'y')).toBe('long');
    for (const w of ['111111', '123456', '654321', 'abcdef', 'FEDCBA', 'aaaaaaaa']) expect(passcodeProblem(w)).toBe('weak');
    for (const ok of ['482913', '12a456', 'abcdeg', 'correct horse']) expect(passcodeProblem(ok)).toBeNull();
    expect(passcodeProblem('１２３４５６')).toBe('weak');
  });

  it('known answer: real WebCrypto PBKDF2-HMAC-SHA-256 over NFKC UTF-8', async () => {
    vi.resetModules();
    const m = await import('./applock');
    const hex = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    const salt = new TextEncoder().encode('salt');
    expect(hex(await m.deriveVerifier('password', salt, 1))).toBe('120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
    expect(hex(await m.deriveVerifier('passﬁx', salt, 1))).toBe(hex(await m.deriveVerifier('passfix', salt, 1)));
  });
});

// ── Conformance: the writers of hub_lock:<uid> ────────────

function fnRange(src: string, head: string): [number, number] {
  const at = src.indexOf(head);
  expect(at).toBeGreaterThanOrEqual(0);
  const end = src.indexOf('\n}\n', at);
  const line = (i: number): number => src.slice(0, i).split('\n').length;
  return [line(at), line(end + 1)];
}
const inRange = (n: number, r: [number, number]): boolean => n >= r[0] && n <= r[1];

describe('conformance: only writeRecordChecked writes hub_lock:, only it, Remove and forgetBrowser remove it', () => {
  const hubSrc = join(HERE, '..');
  const authDir = join(HERE, '../../../public/auth');
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|mjs)$/.test(n) && !/\.(test|spec)\.(ts|tsx)$/.test(n)) files.push(p);
    }
  };
  walk(hubSrc);
  for (const n of readdirSync(authDir)) if (n.endsWith('.js')) files.push(join(authDir, n));

  it('only applock.ts, registry.ts, session.ts (the reservation) and shared.js name the key family or the engine\'s key helpers', () => {
    const names = (t: string): boolean => /hub_lock:|\bHUB_LOCK_PREFIX\b/.test(t) || (/from '[./a-z@]*applock'/.test(t) && /\bLOCK_PREFIX\b/.test(t));
    const naming = files.filter((f) => names(readFileSync(f, 'utf8')));
    // term/app/lock-host.ts: forgetAccountData, the terminal's Forget this terminal's Hub data, the twin of the web's Forget this browser.
    expect(naming.map((f) => relative(join(HERE, '../../..'), f)).sort()).toEqual(['hub/src/core/applock.ts', 'hub/src/core/registry.ts', 'hub/src/core/session.ts', 'hub/src/term/app/lock-host.ts', 'public/auth/shared.js']);
  });

  it('applock.ts: every setItem is inside writeRecordChecked; every removeItem inside it or removePasscode', () => {
    const src = readFileSync(APPLOCK_SRC, 'utf8');
    const w = fnRange(src, 'export function writeRecordChecked(');
    const r = fnRange(src, 'export async function removePasscode(');
    src.split('\n').forEach((l, i) => {
      if (l.includes('.setItem(')) expect(inRange(i + 1, w), 'setItem at applock.ts:' + (i + 1)).toBe(true);
      if (l.includes('.removeItem(')) expect(inRange(i + 1, w) || inRange(i + 1, r), 'removeItem at applock.ts:' + (i + 1)).toBe(true);
    });
  });

  it('registry.ts: no write, no remove', () => {
    expect(/\.(setItem|removeItem)\(/.test(readFileSync(join(HERE, 'registry.ts'), 'utf8'))).toBe(false);
  });

  it('shared.js: HUB_LOCK_PREFIX is used only in forgetBrowser, which has one removeItem; no setItem builds a hub_lock: key', () => {
    const src = readFileSync(join(authDir, 'shared.js'), 'utf8');
    const f = fnRange(src, 'function forgetBrowser() {');
    const lines = src.split('\n');
    lines.forEach((l, i) => {
      if (/\bHUB_LOCK_PREFIX\b/.test(l) && !/^var HUB_LOCK_PREFIX = /.test(l)) expect(inRange(i + 1, f), 'HUB_LOCK_PREFIX at shared.js:' + (i + 1)).toBe(true);
      if (/\.setItem\(/.test(l)) expect(/hub_lock:|HUB_LOCK_PREFIX/.test(l), 'setItem at shared.js:' + (i + 1)).toBe(false);
    });
    expect(lines.slice(f[0] - 1, f[1]).filter((l) => l.includes('.removeItem(')).length).toBe(1);
    // The purge loops remove by registry entry: hub_lock: is neither purge nor forget, so no purge removes it.
    expect(src).toContain("{ area: 'local', prefix: 'hub_lock:', purge: false },");
  });

  afterAll(() => {
    // Runtime spy over every engine test above: each hub_lock: write came from writeRecordChecked, each removal from
    // it or removePasscode.
    const src = readFileSync(APPLOCK_SRC, 'utf8');
    const w = fnRange(src, 'export function writeRecordChecked(');
    const r = fnRange(src, 'export async function removePasscode(');
    Storage.prototype.setItem = realStorage.set;
    Storage.prototype.removeItem = realStorage.remove;
    Storage.prototype.clear = realStorage.clear;
    expect(lockOps.length).toBeGreaterThan(20);
    // The real-Storage round trip below ran through the browser's Storage: the spy saw it.
    expect(lockOps.filter((o) => o.via === 'real').length).toBeGreaterThan(0);
    for (const o of lockOps) {
      expect(o.line, o.op + ' of ' + o.key + ' (' + o.via + ') from outside applock.ts').not.toBeNull();
      if (o.line === null) continue;
      expect(o.op, 'clear at applock.ts:' + o.line).not.toBe('clear');
      expect(o.key.startsWith('hub_lock:'), o.key + ' written by applock.ts:' + o.line).toBe(true);
      if (o.op === 'set') expect(inRange(o.line, w), 'set at applock.ts:' + o.line).toBe(true);
      else expect(inRange(o.line, w) || inRange(o.line, r), 'remove at applock.ts:' + o.line).toBe(true);
    }
  });

  // Red first: each test below fails on a session.ts without reserveLockKeys, where the registered row
  // (purge:false) let every one of these writers take `hub_lock:<uid>` (mutants "no reservation of the passcode keys
  // in shared()", "installShared skips the reservation", "reservation checks only hub_lock:").
  describe('the reservation (session.ts reserveLockKeys): no generic reader or writer can take a passcode key', () => {
    const real = { authStorageEntry: (area: 'local' | 'session', k: string) => registryEntry(area, k) } as unknown as Shared;
    const RECORD = '{"v":1,"the":"record"}';
    beforeEach(() => { installShared(real); seed(() => globalThis.localStorage.setItem(KEY, RECORD)); });
    afterEach(() => { installShared(null); seed(() => globalThis.localStorage.removeItem(KEY)); });
    const keys = ['hub_lock:' + UID, 'hub_lock_now:' + UID, 'hub_lock'];
    const recordKept = (): void => { expect(globalThis.localStorage.getItem(KEY)).toBe(RECORD); };

    it('storageEntry and shared().authStorageEntry read null; an ordinary key still resolves', () => {
      for (const k of keys) {
        expect(shared().authStorageEntry('local', k), k).toBeNull();
        expect(storageEntry('local', k), k).toBeNull();
      }
      expect(storageEntry('local', 'hub_theme_v1')).not.toBeNull();
    });

    it('the production path (shared() built from the shared.js globals, nothing installed) is reserved too', () => {
      const NAMES = [
        'storedSession', 'holdsIdentity', 'holdsSession', 'sessionTokenUid', 'sessionTokenSid', 'apiCall', 'isFramedPage',
        'framedSensitiveRoute', 'framedRefusedError', 'supersededAuthError', 'isSupersededAuthError', 'realmApiDomain',
        'clearAuthTokens', 'purgeOutgoingSession', 'endOutgoingSession', 'onBeforeAuthPurge', 'authStorageEntry',
        'authSessionSuperseded', 'adoptReissuedSession',
      ];
      const g = globalThis as unknown as Record<string, unknown>;
      const before = new Map(NAMES.map((n) => [n, g[n]]));
      for (const n of NAMES) g[n] = () => null;
      g.authStorageEntry = (area: 'local' | 'session', k: string) => registryEntry(area, k); // shared.js's own answer
      try {
        installShared(null);
        for (const k of keys) {
          expect(registryEntry('local', 'hub_lock:' + UID), 'the registry itself lists the family').not.toBeNull();
          expect(shared().authStorageEntry('local', k), k).toBeNull();
          expect(storageEntry('local', k), k).toBeNull();
        }
        expect(storageEntry('local', 'hub_theme_v1')).not.toBeNull();
        expect(() => localSetting(KEY, { keepAtSignOut: true }).set('x')).toThrow();
        expect(() => kitStore.set(KEY, 'x')).toThrow();
        recordKept();
      } finally {
        installShared(null);
        for (const [n, v] of before) { if (v === undefined) delete g[n]; else g[n] = v; }
      }
    });

    it('kit-io partitioned(): refused, the record unchanged', () => {
      for (const k of keys) expect(() => partitioned(k, { scope: 'account' }).set('x'), k).toThrow();
      recordKept();
    });

    it('kit-io store.set / store.get: refused, the record unchanged', () => {
      expect(() => kitStore.set(KEY, 'x')).toThrow();
      expect(() => kitStore.get(KEY)).toThrow();
      recordKept();
    });

    it('prefs localSetting: refused (account and fixed forms), the record unchanged', () => {
      expect(() => localSetting(KEY, { keepAtSignOut: true }).set('x')).toThrow();
      expect(() => localSetting('hub_lock:{uid}', { keepAtSignOut: true, account: true }).set('x')).toThrow();
      recordKept();
    });

    it('cryptStore cryptPartitioned (account preferences): refused, the record unchanged', () => {
      expect(() => cryptPartitioned(KEY, { scope: 'account', purge: false })).toThrow();
      recordKept();
    });

    // Not a reservation test: no caller can hand these writers a key (their keys are built from fixed families,
    // `hub_notif:<uid>:…` and the realm constants), so the reservation is never what stops them. Pinned here: their
    // only Storage sites, their fixed families, the storageEntry guard; and one realm write run against the record.
    it('notifications and realm: no caller-supplied key; their only writers take fixed key families behind storageEntry', () => {
      expect(setTint('cccccccccccccccccccccccc', 'red')).toBe(true);
      recordKept();
      const n = readFileSync(join(HERE, 'notifications.ts'), 'utf8');
      expect(n).toContain("const PREFIX = 'hub_notif:';");
      expect(n).toMatch(/function lsSet\(k: string, v: string\): void \{\n\s+if \(!storageEntry\('local', k\)\) return;/);
      // its other site removes only `hub_notif:` keys (cleanupOrphans)
      expect(n.match(/localStore\(\)\.(setItem|removeItem)\(/g)?.length).toBe(2);
      expect(n).toMatch(/if \(!k \|\| k\.indexOf\(PREFIX\) !== 0\) continue;[\s\S]{0,200}for \(const k of rm\) \{ try \{ localStore\(\)\.removeItem\(k\);/);
      const r = readFileSync(join(HERE, 'realm.ts'), 'utf8');
      expect(r).toMatch(/function store\(k: string, v: string \| null\): void \{\n\s+if \(!storageEntry\('local', k\)\) return;/);
      expect(r.match(/localStore\(\)\.(setItem|removeItem)\(/g)?.length).toBe(2);
      // …and storageEntry answers null for every passcode key (first test), so neither can write one.
    });

    it('the engine itself reads and writes its record through its own accessor: set, read and check round-trip', async () => {
      seed(() => globalThis.localStorage.removeItem(KEY));
      const t = await tab();
      t.m.configureAppLock({ storage: () => globalThis.localStorage });
      expect(await t.m.setPasscode(PASS, settings)).toBe('set');
      expect(JSON.parse(globalThis.localStorage.getItem(KEY) as string)).toMatchObject({ v: 1, kdf: 'pbkdf2-sha256' });
      expect(t.m.lockSettings()).toMatchObject({ set: true, idleMin: 5 });
      t.m.lockNow();
      expect(await t.m.checkPasscode('wrongwrong')).toMatchObject({ k: 'wrong', n: 1 });
      expect(await t.m.checkPasscode(PASS)).toEqual({ k: 'unlocked' });
      expect(t.m.lockSettings()).toMatchObject({ set: true });
    });
  });

  it('the files that look storage keys up in the registry (the only way to reach the family without naming it)', () => {
    const uses = files.filter((f) => /\b(storageEntry|registryEntry|authStorageEntry)\(|\bSTORAGE_REGISTRY\b/.test(readFileSync(f, 'utf8')));
    // Each one: cryptStore/kit-io/notifications/prefs/realm write only keys shared() answers for (never hub_lock,
    // see above); transport.ts removes only purge:true entries; fixture-boot.ts clears registered keys in the
    // fixtures build only; registry.ts and session.ts are the lookups; shared.js is checked line by line below;
    // term/env/client-shared.ts (the terminal's Shared) removes only purge:true entries of its own memory stores, like
    // transport.ts, and its authStorageEntry is the registry lookup.
    expect(uses.map((f) => relative(join(HERE, '../../..'), f)).sort()).toEqual([
      'hub/src/core/cryptStore.ts', 'hub/src/core/fixture-boot.ts', 'hub/src/core/kit-io.ts', 'hub/src/core/notifications.ts',
      'hub/src/core/prefs.ts', 'hub/src/core/realm.ts', 'hub/src/core/registry.ts', 'hub/src/core/session.ts',
      'hub/src/core/transport.ts', 'hub/src/term/app/live-wire.ts', 'hub/src/term/env/client-shared.ts', 'public/auth/shared.js',
    ]);
    const transport = readFileSync(join(HERE, 'transport.ts'), 'utf8');
    expect(transport).toContain('registryEntry(area, k)?.purge) doomed.push(k)');
    const termShared = readFileSync(join(HERE, '../term/env/client-shared.ts'), 'utf8');
    expect(termShared).toContain('registryEntry(area, k)?.purge) doomed.push(k)');
    // term/app/live-wire.ts: on a purge its seam removes only the store rows the registry marks purge:true.
    const liveWire = readFileSync(join(HERE, '../term/app/live-wire.ts'), 'utf8');
    expect(liveWire.match(/registryEntry\(/g) ?? []).toHaveLength(1);
    expect(liveWire).toContain("if (seam && registryEntry('local', r.key)?.purge) { try { seam.removeItem(r.key); }");
  });

  it('only core/index.ts, core/shell.ts (the shell\'s entry), core/alerts.ts (generic alerts) and core/applock-host.ts (the gate\'s DOM side) and core/dispose.ts (its session reset) import the engine module (its key helpers stay inside core)', () => {
    const importers = files.filter((f) => /from '[^']*\/applock'/.test(readFileSync(f, 'utf8')));
    // core/index.live.ts: the barrel's live half; term/app/lock-host.ts: the engine's terminal host, the twin of applock-host.ts.
    expect(importers.map((f) => relative(join(HERE, '../../..'), f)).sort()).toEqual(['hub/src/core/alerts.ts', 'hub/src/core/applock-host.ts', 'hub/src/core/dispose.ts', 'hub/src/core/index.live.ts', 'hub/src/core/shell.ts', 'hub/src/term/app/lock-host.ts']);
  });

  it('shared.js: every setItem/removeItem/clear site is one of the audited ones (a new one fails until it is checked)', () => {
    const src = readFileSync(join(authDir, 'shared.js'), 'utf8');
    const sites = src.split('\n').filter((l) => /\.(setItem|removeItem|clear)\(/.test(l)).map((l) => l.trim()).sort();
    expect(sites).toEqual(SHARED_STORAGE_SITES);
  });
});

/** Every storage mutation line of public/auth/shared.js, audited for the passcode family: constant or credential keys,
 *  the registry-driven purge loops (`store.removeItem(doomed[j])`: purge/forget entries only; hub_lock: is neither),
 *  forgetBrowser's record removal and postHubLock's stamp. */
const SHARED_STORAGE_SITES = [
  "for (var j = 0; j < doomed.length; j++) localStorage.removeItem(doomed[j]);",
  "if (!ref) { if (optedOut) localStorage.removeItem(REF_LS_KEY); return; }",
  "for (var j = 0; j < doomed.length; j++) { try { store.removeItem(doomed[j]); } catch (er) {} }",
  "if (code) sessionStorage.setItem(COUPON_PREFILL_SS_KEY, code);",
  "if (id !== null && tabFlowId() !== id) { try { sessionStorage.removeItem(AUTH_FLOW_KEY); } catch (e) {} }",
  "if (intentOurs) localStorage.removeItem('auth_intent_token');",
  "if (ownsFlowRecord(localStorage.getItem('auth_return_to'), own.ctx, own.flow)) localStorage.removeItem('auth_return_to');",
  "if (ownsFlowRecord(localStorage.getItem('auth_self_pkce_verifier'), own.verifier, own.flow)) localStorage.removeItem('auth_self_pkce_verifier');",
  "if (payload.expires_at) localStorage.setItem('access_token_expires_at', payload.expires_at);",
  "if (payload.refreshToken) localStorage.setItem('refresh_token', payload.refreshToken);",
  "if (payload.refresh_expires_at) localStorage.setItem('refresh_token_expires_at', payload.refresh_expires_at);",
  "if (payload.token) localStorage.setItem('access_token', payload.token);",
  "if (tfaOurs) localStorage.removeItem('two_factor_token');",
  "localStorage.removeItem('auth_intent_token');",
  "localStorage.removeItem('auth_return_to');",
  "localStorage.removeItem('auth_return_to');",
  "localStorage.removeItem('auth_return_to');",
  "localStorage.removeItem('auth_self_pkce_verifier');",
  "localStorage.removeItem('auth_self_pkce_verifier');",
  "localStorage.removeItem('auth_self_pkce_verifier');",
  "localStorage.removeItem('two_factor_token');",
  "localStorage.removeItem(REF_LS_KEY);",
  "localStorage.setItem('access_token', payload.token);",
  "localStorage.setItem('access_token_expires_at', payload.expires_at || '');",
  "localStorage.setItem('refresh_token', payload.refreshToken);",
  "localStorage.setItem('refresh_token_expires_at', payload.refresh_expires_at || '');",
  "localStorage.setItem(AUTH_REV_KEY, v);",
  "try { localStorage.setItem(REF_REV_KEY, randomLowerId(16)); } catch (e) { /* the fence stays as it was */ }",
  "localStorage.setItem(REF_LS_KEY, JSON.stringify({ code: code, at: Date.now(), source: 'link' }));",
  "localStorage.setItem(REF_LS_KEY, JSON.stringify({ code: ref.code, at: ticket.at, source: ref.source === 'link' ? 'link' : 'typed' }));",
  "localStorage.setItem(SELF_PKCE_KEYS[i], JSON.stringify(rec));",
  "sessionStorage.removeItem(COUPON_SS_KEY);",
  "try { if (id === null) sessionStorage.removeItem(AUTH_FLOW_KEY); else sessionStorage.setItem(AUTH_FLOW_KEY, id); } catch (e) {}",
  "try { localStorage.removeItem('two_factor_token'); localStorage.removeItem('auth_intent_token'); } catch (e) {}",
  "try { localStorage.removeItem(REF_LS_KEY); } catch (e) {}",
  "try { localStorage.removeItem(TOKEN_SESSION_KEY); } catch (e) {}",
  "try { localStorage.removeItem(TOKEN_SESSION_KEY); } catch (e) {}",
  "try { localStorage.setItem('auth_return_to', ctx); } catch(e) {}",
  "try { localStorage.setItem('auth_return_to', ctx); } catch(e) {}",
  "try { localStorage.setItem('auth_self_pkce_verifier', verifierCtx); } catch(e) {}",
  "try { localStorage.setItem('hub_boot_token_epoch:' + uid, freshEpochNonce()); epochWritten = true; } catch (e) {}",
  "try { localStorage.setItem('hub_boot_token_epoch:' + uid, freshEpochNonce()); } catch (e3) {}",
  "try { localStorage.setItem(HUB_LOCK_NOW_PREFIX + uid, JSON.stringify({ at: Date.now(), n: randomLowerId(12) })); } catch (e2) {}",
  // The standalone Hub's chosen Hoody (setStandaloneApi, clearStandaloneApi): one constant key, never hub_lock:.
  "localStorage.setItem(STANDALONE_API_KEY, JSON.stringify({ v: 1, origin: next.origin, realm: next.realmApiDomain, proxy: next.proxyDomain }));",
  "localStorage.removeItem(STANDALONE_API_KEY);",
  // purgeRemnant: only the leftovers of the outgoing session (its refresh token, expiry, boot token; never hub_lock:).
  "try { localStorage.removeItem('refresh_token'); } catch (e1) {}",
  "try { localStorage.removeItem('refresh_token_expires_at'); } catch (e2) {}",
  "try { localStorage.removeItem('hub_boot_token:' + s.uid); } catch (e3) {}",
].sort();
