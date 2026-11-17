// Every free of a change is judged and stored in
// ONE store-lock turn, against the stored state the caller observed. Rows:
//   - renewal: this tab adopted another tab's expired stamp; that tab renews it (no storage event yet); a
//       non-warned free answers false and the renewed stamp stays; another runtime's press is BUSY, nothing sent.
//   - newer pending outcome: the other tab's answer stores a new pending outcome (same token, stamp cleared) after
//       this tab's read began; the proof frees nothing and the outcome stays pending; another press is refused.
//   - a proof in the tab that sent, right after its own pending answer: frees on the first read.
//   - a realm switch after the read, before the free's turn: false, nothing freed.
//   warned: the person's warned Dismiss still frees over a renewed stamp (documented exception).
//   - every warned Dismiss entry point frees over a newer outcome; each proof counterpart refuses it.
//   - a request still out here (re-adopted copy after X->Y->X): proofs refuse, the warned Dismiss frees, a press
//       is BUSY until the request answers, and its late answer never brings the record back.
//   - a refused free answers false even when memory then shows nothing pending (an account switch while the
//       read-back's free waits for its store-lock turn).
//   - a record without an outcome nonce (an older build's, with fmt:1 or none) is proved by nothing; the warned
//       Dismiss frees it.
//   - after a warned keyed release over a newer outcome, a fresh hold names the kept outcome and a proof retires it.
//   - readBack(vars) refuses a realm or account round trip during its digest await.
//   - a first proof queued behind its own send's pending answer (both on the store lock) frees on the first read,
//        judging and writing in one lock grant.
//   - useLockedChange's dismiss() answers the stored outcome: false when refused, true when stored, nothing while
//       its store-lock turn waits.
//   - a hold without an outcome nonce whose record another tab removed: no proof frees its memory; the warned
//       Dismiss does, and nothing is written back.
//   - keyless: an older tab's newer answer (no nonce) during a read: the proof frees nothing and the next press
//       sends nothing.
//   - a free called in a context that has since moved answers refused before its store-lock turn: it writes nothing
//       (not even an older record's conversion).
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as C from './changes';
import { CHANGE_FMT, CHANGE_STORE_KEY, SENDING_STALE_MS, setChangeStoreAdapter, type StoredChange } from './change-store';
import type { HeldRow } from './changes';
import { setIdentity, setRealm, bump } from './ctx';
import { useLockedChange, type LockedChange } from './locked';
import { defineMutation, defineQuery, queryClient, type MutationHook, type ReadVerdict } from './query';
import { defineRoute } from './routes';
import { coreSource, type SourceMutation } from './source';
import { boot, calls, deferred, onFetch, R1, R2, settle } from './test/env';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const raw = (): StoredChange[] => JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as StoredChange[];
const put = (list: StoredChange[]): void => localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list));
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }
const posts = (): number => calls.filter((c) => c.method === 'POST').length;

type V = { id: string };
const list = defineRoute({ method: 'GET', path: '/s1/list', scope: 'agent' });
const q = defineQuery(list);
// What a read proves ('not_applied': the strongest case, which lets a fresh send go out).
let verdict: ReadVerdict = undefined;
const proves = (): ReadVerdict => verdict;
const runRoute = defineRoute({ method: 'POST', path: '/s1/run', scope: 'agent', body: ['id'], idem: true });
const runM = defineMutation<V>(runRoute, { input: (v) => ({ body: v }), lock: 's1.run', lockKey: (v) => ({ id: v.id }), reads: [q], proves, page: 'scripts' });
// A route without a key: its record stores none.
const keylessRoute = defineRoute({ method: 'POST', path: '/s1/keyless', scope: 'agent', body: ['id'] });
const keylessM = defineMutation<V>(keylessRoute, { input: (v) => ({ body: v }), lock: 's1.keyless', lockKey: (v) => ({ id: v.id }), reads: [q], proves, page: 'scripts' });
const srcRoute = defineRoute<unknown, V>({ method: 'POST', path: '/s1/src', scope: 'agent', body: ['id'], idem: true });
const table = { reads: { all: { route: list } }, changes: { create: { route: srcRoute, lock: 's1.src', lockKey: (v: V) => ({ id: v.id }), input: (v: V) => ({ body: v }), reads: ['all'], proves } } };
// One source for the file: its key is the sender, so every mount (a remount, another runtime) is the same sender.
const src = coreSource('s1-src', table);
// The read-back's GET waits on `readGate` when set (a read in flight), so a test can change storage meanwhile.
let readGate: ReturnType<typeof deferred<void>> | null = null;
const lockedSend = async (): Promise<never> => { throw Object.assign(new Error('gone'), { kind: 'pending' }); };

// One family's controls, as far as these rows use them (each answer awaited: a Promise now, a boolean before).
type Ctl = {
  held(): readonly HeldRow[];
  settleHeld?(r: HeldRow): boolean | Promise<boolean>;
  dismissHeld?(r: HeldRow): boolean | Promise<boolean>;
  readBack(): Promise<boolean>;
};
type Family = { name: string; base: string; mount(): () => Ctl; start(h: () => Ctl): Promise<unknown>; settleVars?: (h: () => Ctl, hold: string) => Promise<boolean>; holdOf?: (h: () => Ctl) => Promise<string | undefined> };
let n = 0;
const families: Family[] = [
  {
    name: 'defineMutation', base: 's1.run',
    mount: () => { let last!: MutationHook<V, unknown>; function P() { last = runM.use(); return null; } render(<P />, { wrapper: wrap }); return () => last as unknown as Ctl; },
    start: async () => runM.run({ id: 'a' }),
    settleVars: (_h, hold) => runM.settle({ id: 'a' }, hold),
    holdOf: () => runM.holdOf({ id: 'a' }),
  },
  {
    name: 'coreSource', base: 's1.src',
    mount: () => {
      let last!: SourceMutation<unknown, V>;
      function P() { last = src.useMutation<unknown, V>('create'); return null; }
      render(<P />, { wrapper: wrap });
      return () => last as unknown as Ctl;
    },
    start: async (h) => (h() as unknown as SourceMutation<unknown, V>).mutateAsync({ id: 'a' }).catch((e: unknown) => e),
    settleVars: (h, hold) => (h() as unknown as SourceMutation<unknown, V>).settle({ id: 'a' }, hold),
    holdOf: (h) => (h() as unknown as SourceMutation<unknown, V>).holdOf({ id: 'a' }),
  },
  {
    name: 'useLockedChange', base: 's1.locked',
    mount: () => {
      const id = 's1.l' + ++n;
      let last!: LockedChange<V, unknown>;
      function P() { last = useLockedChange(lockedSend, [q], id, { lock: 's1.locked', lockKey: (v: V) => ({ id: v.id }), proves, page: 'scripts', realm: true }); return null; }
      render(<P />, { wrapper: wrap });
      lockedRun = () => last.run({ id: 'a' });
      return () => ({ held: () => [], readBack: () => last.readBack() });
    },
    start: async () => lockedRun(),
  },
];
// useLockedChange's run, through the mounted hook (set by its mount).
let lockedRun: () => Promise<unknown> = async () => undefined;

beforeEach(() => {
  boot({ realm: R1 }); queryClient.clear(); readGate = null; verdict = undefined; calls.length = 0;
  onFetch(async (c) => { if (c.method !== 'POST') { if (readGate) await readGate.p; return { status: 200, body: { data: [] } }; } return { status: 502, body: {} }; });
});
// A row that wraps navigator.locks.request puts the shim's own method back here.
let unwrapLocks: (() => void) | null = null;
afterEach(() => { cleanup(); setChangeStoreAdapter(null); readGate = null; unwrapLocks?.(); unwrapLocks = null; });

/** This tab's held send, made another tab's whose stamp went stale (this runtime reloads and adopts it as pending). */
function adoptStale(): void {
  const old = Date.now() - SENDING_STALE_MS - 1000;
  put(raw().map((r) => ({ ...r, sending: { tab: 'other-tab', at: old } })));
  C.reloadChangesForTests();
}
/** That tab renews its stamp (its heartbeat), without the storage event reaching this tab yet. */
function renewElsewhere(): void {
  put(raw().map((r) => ({ ...r, sending: { tab: 'other-tab', at: Date.now() }, t: r.t + 1 })));
}
/** That tab's answer comes back unknown: its finalizer stores the send's new pending outcome (same token, stamp
 *  cleared, a new outcome nonce), without the storage event reaching this tab yet. */
function answerElsewhere(): void {
  put(raw().map((r) => { const { sending: _s, ...rest } = r; void _s; return { ...rest, pending: true, at: Date.now(), t: r.t + 1, oc: 'answered-elsewhere' } as StoredChange; }));
}
/** Another runtime (a third tab) presses the same change: it must send nothing. */
async function pressElsewhere(f: Family): Promise<void> {
  C.reloadChangesForTests();
  cleanup();
  const before = posts();
  const h = f.mount();
  await act(async () => { await f.start(h); await flush(); });
  expect(posts()).toBe(before);
}
async function sent(f: Family): Promise<() => Ctl> {
  const h = f.mount();
  await act(async () => { await f.start(h); await flush(); });
  return h;
}

describe('a non-warned free never removes a stamp another tab renewed', () => {
  for (const f of families.filter((x) => x.settleVars)) {
    it(`${f.name}: settleHeld answers false and the renewed stamp stays; another press sends nothing`, async () => {
      await sent(f);
      adoptStale();
      cleanup();
      const h = f.mount();
      const [row] = h().held();
      expect(row).toBeDefined();
      renewElsewhere();
      let ok: boolean | undefined;
      await act(async () => { ok = await h().settleHeld!(row!); await flush(); });
      expect(ok).toBe(false);
      expect(raw()).toHaveLength(1);
      expect(raw()[0]!.sending?.tab).toBe('other-tab');
      await pressElsewhere(f);
    });
    it(`${f.name}: settle(vars, hold) answers false and the renewed stamp stays; another press sends nothing`, async () => {
      await sent(f);
      adoptStale();
      cleanup();
      const h = f.mount();
      const hold = await f.holdOf!(h);
      expect(hold).toBeDefined();
      renewElsewhere();
      let ok: boolean | undefined;
      await act(async () => { ok = await f.settleVars!(h, hold!); await flush(); });
      expect(ok).toBe(false);
      expect(raw()[0]!.sending?.tab).toBe('other-tab');
      await pressElsewhere(f);
    });
  }
  it('the warned Dismiss still frees over the renewed stamp (the person was warned)', async () => {
    const f = families[0]!;
    await sent(f);
    adoptStale();
    cleanup();
    const h = f.mount();
    const [row] = h().held();
    renewElsewhere();
    let ok: boolean | undefined;
    await act(async () => { ok = await h().dismissHeld!(row!); await flush(); });
    expect(ok).toBe(true);
    expect(raw().every((r) => r.sending === undefined)).toBe(true);
    expect(C.heldChanges(f.base)).toEqual([]);
  });
});

describe('a proof never frees an outcome stored after its read began', () => {
  for (const f of families) {
    it(`${f.name}: readBack() reads not_applied after the other tab's answer landed: false, still pending, another press refused`, async () => {
      const h = await sent(f);
      adoptStale();
      verdict = 'not_applied';
      readGate = deferred<void>();
      let p!: Promise<boolean>;
      act(() => { p = h().readBack(); });
      await flush();
      answerElsewhere();
      readGate.res();
      let ok: boolean | undefined;
      await act(async () => { ok = await p; await flush(); });
      expect(ok).toBe(false);
      expect(raw()).toHaveLength(1);
      expect(raw()[0]!.pending).toBe(true);
      readGate = null;
      verdict = undefined;
      await pressElsewhere(f);
    });
  }
  for (const f of families.filter((x) => x.settleVars)) {
    it(`${f.name}: settle(vars, hold) with the hold taken before the read: false after the other tab's answer landed`, async () => {
      await sent(f);
      adoptStale();
      cleanup();
      const h = f.mount();
      const hold = await f.holdOf!(h);
      answerElsewhere();
      let ok: boolean | undefined;
      await act(async () => { ok = await f.settleVars!(h, hold!); await flush(); });
      expect(ok).toBe(false);
      expect(raw()[0]!.pending).toBe(true);
      await pressElsewhere(f);
    });
    it(`${f.name}: settleHeld of a row listed before the other tab's answer landed: false`, async () => {
      await sent(f);
      adoptStale();
      cleanup();
      const h = f.mount();
      const [row] = h().held();
      answerElsewhere();
      let ok: boolean | undefined;
      await act(async () => { ok = await h().settleHeld!(row!); await flush(); });
      expect(ok).toBe(false);
      expect(raw()[0]!.pending).toBe(true);
    });
  }
});

describe('valid proofs still free on their first read', () => {
  for (const f of families.filter((x) => x.settleVars)) {
    it(`${f.name}: in the tab that sent, a read-back right after the pending answer frees it`, async () => {
      const h = await sent(f);
      verdict = 'not_applied';
      let ok: boolean | undefined;
      await act(async () => { ok = await h().readBack(); await flush(); });
      expect(ok).toBe(true);
      expect(raw().every((r) => !r.pending)).toBe(true);
    });
    it(`${f.name}: after a reload, the stable record is proved and freed`, async () => {
      await sent(f);
      C.reloadChangesForTests();
      cleanup();
      const h = f.mount();
      const hold = await f.holdOf!(h);
      let ok: boolean | undefined;
      await act(async () => { ok = await f.settleVars!(h, hold!); await flush(); });
      expect(ok).toBe(true);
      expect(raw().every((r) => !r.pending)).toBe(true);
    });
  }
});

describe('a realm switch between the read and the free frees nothing', () => {
  it('defineMutation settle(vars, hold) called after a switch away and back keeps the hold', async () => {
    const f = families[0]!;
    await sent(f);
    const hold = await runM.holdOf({ id: 'a' });
    let p!: Promise<boolean>;
    act(() => { p = runM.settle({ id: 'a' }, hold!); setRealm(R2); bump('switch'); });
    let ok: boolean | undefined;
    await act(async () => { ok = await p; await flush(); });
    act(() => { setRealm(R1); bump('switch'); });
    expect(ok).toBe(false);
    expect(raw()[0]!.pending).toBe(true);
  });
});

// The warned Dismiss is warned at every entry point. After this tab's own pending answer, another tab stores a
// new pending outcome of the same send (no storage event yet): every proof refuses it, and every warned Dismiss frees
// it (each entry point passes `warned`; dropping it at any one turns its row red).
describe('every warned Dismiss entry point frees over a newer outcome; its proof counterpart refuses', () => {
  const freed = (base: string): void => {
    expect(C.heldChanges(base)).toEqual([]);
    expect(raw().every((r) => !r.pending)).toBe(true);
  };
  const kept = (base: string): void => {
    expect(C.heldChanges(base)).toHaveLength(1);
    expect(raw()[0]!.pending).toBe(true);
  };
  it('defineMutation dismiss(vars, hold) frees; settle(vars, hold) refuses', async () => {
    await sent(families[0]!);
    const hold = (await runM.holdOf({ id: 'a' }))!;
    answerElsewhere();
    let ok: boolean | undefined;
    await act(async () => { ok = await runM.settle({ id: 'a' }, hold); await flush(); });
    expect(ok).toBe(false);
    kept('s1.run');
    await act(async () => { ok = await runM.dismiss({ id: 'a' }, hold); await flush(); });
    expect(ok).toBe(true);
    freed('s1.run');
  });
  it('defineMutation hook: dismiss() frees this mount\'s send; settle() refuses', async () => {
    let last!: MutationHook<V, unknown>;
    function P() { last = runM.use(); return null; }
    render(<P />, { wrapper: wrap });
    await act(async () => { await last.run({ id: 'a' }); await flush(); });
    answerElsewhere();
    await act(async () => { last.settle(); await flush(); });
    kept('s1.run');
    await act(async () => { last.dismiss(); await flush(); });
    freed('s1.run');
  });
  it('defineMutation dismissHeld frees; settleHeld refuses', async () => {
    const h = await sent(families[0]!);
    const [row] = h().held();
    answerElsewhere();
    let ok: boolean | undefined;
    await act(async () => { ok = await h().settleHeld!(row!); await flush(); });
    expect(ok).toBe(false);
    kept('s1.run');
    await act(async () => { ok = await h().dismissHeld!(row!); await flush(); });
    expect(ok).toBe(true);
    freed('s1.run');
  });
  it('coreSource dismiss(vars, hold) frees; settle(vars, hold) refuses', async () => {
    const h = await sent(families[1]!);
    const m = (): SourceMutation<unknown, V> => h() as unknown as SourceMutation<unknown, V>;
    const hold = (await m().holdOf({ id: 'a' }))!;
    answerElsewhere();
    let ok: boolean | undefined;
    await act(async () => { ok = await m().settle({ id: 'a' }, hold); await flush(); });
    expect(ok).toBe(false);
    kept('s1.src');
    await act(async () => { ok = await m().dismiss({ id: 'a' }, hold); await flush(); });
    expect(ok).toBe(true);
    freed('s1.src');
  });
  it('coreSource dismiss() frees this mount\'s send; settle() refuses', async () => {
    const h = await sent(families[1]!);
    const m = (): SourceMutation<unknown, V> => h() as unknown as SourceMutation<unknown, V>;
    answerElsewhere();
    let ok: boolean | undefined;
    await act(async () => { ok = await m().settle(); await flush(); });
    expect(ok).toBe(false);
    kept('s1.src');
    await act(async () => { ok = await m().dismiss(); await flush(); });
    expect(ok).toBe(true);
    freed('s1.src');
  });
  it('coreSource dismissHeld frees; settleHeld refuses', async () => {
    const h = await sent(families[1]!);
    const [row] = h().held();
    answerElsewhere();
    let ok: boolean | undefined;
    await act(async () => { ok = await h().settleHeld!(row!); await flush(); });
    expect(ok).toBe(false);
    kept('s1.src');
    await act(async () => { ok = await h().dismissHeld!(row!); await flush(); });
    expect(ok).toBe(true);
    freed('s1.src');
  });
  it('useLockedChange dismiss() frees; its read-back proof refuses', async () => {
    let last!: LockedChange<V, unknown>;
    function P() { last = useLockedChange(lockedSend, [q], 's1.l18', { lock: 's1.locked', lockKey: (v: V) => ({ id: v.id }), proves, page: 'scripts', realm: true }); return null; }
    render(<P />, { wrapper: wrap });
    await act(async () => { await last.run({ id: 'a' }); await flush(); });
    verdict = 'not_applied';
    readGate = deferred<void>();
    let p!: Promise<boolean>;
    act(() => { p = last.readBack(); });
    await flush();
    answerElsewhere();
    readGate.res();
    let ok: boolean | undefined;
    await act(async () => { ok = await p; await flush(); });
    readGate = null;
    verdict = undefined;
    expect(ok).toBe(false);
    kept('s1.locked');
    let dismissed: boolean | undefined;
    await act(async () => { dismissed = await last.dismiss(); await flush(); });
    expect(dismissed).toBe(true);
    freed('s1.locked');
  });
});

// A request still out in this tab. After an account round trip the copy is re-adopted while the request is out:
// a proof refuses it (it may still answer), the warned Dismiss frees it, and this tab's next press stays BUSY until
// the request answers (one request of a change out per tab).
describe('a request still out here: a proof refuses, the warned Dismiss frees, a press is BUSY', () => {
  const META = { base: 'lock:s1.raw', target: null, realm: R1, by: 'q:s1@s1.raw' };
  it('core release() and warned release() over the re-adopted copy; the press while out sends nothing', async () => {
    const out = deferred<{ outcome: 'pending'; idem: string }>();
    const going = C.guarded('s', 'r19', () => out.p, META);
    await flush();
    const me = String((await import('./ctx')).snapshot().account);
    const { setIdentity } = await import('./ctx');
    setIdentity({ id: 'someone-else', banned: false }); bump('account'); await flush();
    setIdentity({ id: me, banned: false }); bump('account'); await flush();
    expect(C.isPending('s', 'r19')).toBe(true);
    const hold = C.holdOfLock('s', 'r19')!;
    expect(await C.release('s', 'r19', hold)).toBe(false);
    expect(await C.complete('s', 'r19', hold)).toBe(false);
    expect(await C.discard('s', 'r19', hold)).toBe(false);
    expect(C.isPending('s', 'r19')).toBe(true);
    expect(await C.release('s', 'r19', hold, { warned: true })).toBe(true);
    expect(C.isPending('s', 'r19')).toBe(false);
    let n2 = 0;
    expect(await C.guarded('s', 'r19', async () => { n2++; return { outcome: 'pending' as const, idem: 'X' }; }, META)).toEqual({ outcome: 'not_sent', code: 'BUSY' });
    expect(n2).toBe(0);
    out.res({ outcome: 'pending', idem: 'K' });
    await going;
    await flush();
    expect(raw().filter((r) => r.id.endsWith('\u0000r19'))).toEqual([]); // a removed record never comes back
    expect((await C.guarded('s', 'r19', async () => { n2++; return { outcome: 'pending' as const, idem: 'N' }; }, META)).outcome).toBe('pending');
    expect(n2).toBe(1);
  });
  it('a stampless record while the request is still out here (another tab released it): a proof still refuses', async () => {
    const out = deferred<{ outcome: 'pending'; idem: string }>();
    const going = C.guarded('s', 'r19b', () => out.p, META, 'b', 'K0');
    await flush();
    const { setIdentity, snapshot } = await import('./ctx');
    const me = String(snapshot().account);
    setIdentity({ id: 'someone-else', banned: false }); bump('account'); await flush();
    setIdentity({ id: me, banned: false }); bump('account'); await flush();
    // Another tab released the copy keeping its key (its stamp gone): no live stamp, the same outcome nonce.
    put(raw().map((r) => { const { sending: _s, ...rest } = r; void _s; return { ...rest, pending: false, t: r.t + 1 } as StoredChange; }));
    window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
    await flush();
    const hold = C.holdOfLock('s', 'r19b')!;
    expect(hold).toBeDefined();
    // Only the request still out here (sendsOut) stops this proof: it may still answer.
    expect(await C.complete('s', 'r19b', hold)).toBe(false);
    expect(raw().filter((r) => r.id.endsWith('\u0000r19b'))).toHaveLength(1);
    out.res({ outcome: 'pending', idem: 'K0' });
    await going;
    await flush();
  });
});

// A read-back whose free is refused answers false even when memory then shows nothing pending. Here the account
// changes while the free waits for its store-lock turn: the free's context moved, so it frees nothing, and the
// account shown now holds none of these changes (isPending and pendingOf read false). The answer is the free's own
// (freeByVerdict, and each read-back hook's `ok`), never memory alone.
describe('a refused free answers false even when memory shows nothing pending', () => {
  for (const f of families) {
    it(`${f.name}: readBack() whose free waits out an account switch answers false; the record stays pending`, async () => {
      const h = await sent(f);
      verdict = 'not_applied';
      readGate = deferred<void>();
      let p!: Promise<boolean>;
      act(() => { p = h().readBack(); });
      await flush();
      let open!: () => void;
      const gate = new Promise<void>((r) => { open = r; });
      void navigator.locks.request('hub_changes', () => gate); // another tab holds the store lock
      await flush();
      readGate.res(); // the read answers; its free waits for the store lock
      await flush();
      act(() => { setIdentity({ id: 'someone-else', banned: false }); bump('account'); });
      open();
      let ok: boolean | undefined;
      await act(async () => { ok = await p; await flush(); });
      expect(C.pendingOf(f.base)).toHaveLength(0); // memory, for the account shown now, holds nothing pending
      expect(ok).toBe(false);
      expect(raw()).toHaveLength(1);
      expect(raw()[0]!.pending).toBe(true);
      readGate = null;
    });
  }
});

// A record without an outcome nonce (an older build's tab wrote it, and its tabs store a
// newer pending answer without one) is proved by nothing: two such outcomes cannot be told apart. Only the warned
// Dismiss frees it.
/** The stored record as an older build writes it: no outcome nonce; `fmt` 1 (a fmt:1 writer before oc) or none (older still). */
function stripOc(fmt?: number): void {
  put(raw().map((r) => { const { oc: _o, fmt: _f, ...rest } = r; void _o; void _f; return (fmt === undefined ? rest : { ...rest, fmt }) as StoredChange; }));
}
const olderWriters: { name: string; fmt?: number }[] = [{ name: 'fmt:1 without oc', fmt: CHANGE_FMT }, { name: 'an older writer (no fmt, no oc)' }];
describe('a record without an outcome nonce is proved by nothing; the warned Dismiss frees it', () => {
  for (const f of families.filter((x) => x.settleVars)) {
    for (const w of olderWriters) it(`${f.name}: ${w.name}, keyed, on reload: no proof frees it, dismiss does`, async () => {
      await sent(f);
      expect(raw()[0]!.key).toBeTruthy();
      stripOc(w.fmt);
      expect(raw()[0]!.oc).toBeUndefined();
      expect(raw()[0]!.fmt).toBe(w.fmt);
      C.reloadChangesForTests();
      cleanup();
      const h = f.mount();
      await act(async () => { await flush(); });
      let ok: boolean | undefined;
      if (w.fmt !== undefined) {
        const hold = await f.holdOf!(h);
        expect(hold!.endsWith('~')).toBe(true);
        await act(async () => { ok = await f.settleVars!(h, hold!); await flush(); });
        expect(ok).toBe(false);
      } else {
        // An older writer's record converts on load into an older change (fresh id, no key, no oc): the variables
        // name nothing any more, and no read proves it.
        expect(await f.holdOf!(h)).toBeFalsy();
        expect(raw()).toHaveLength(1);
        expect(raw()[0]!.key).toBeNull();
        expect(raw()[0]!.oc).toBeUndefined();
      }
      expect(raw()[0]!.pending).toBe(true);
      const [row] = h().held();
      await act(async () => { ok = await h().dismissHeld!(row!); await flush(); });
      expect(ok).toBe(true);
      expect(raw().every((r) => !r.pending)).toBe(true);
    });
    it(`${f.name}: an older tab stores a newer pending answer (no nonce) after the read began: the proof frees nothing`, async () => {
      const h = await sent(f);
      verdict = 'not_applied';
      readGate = deferred<void>();
      let p!: Promise<boolean>;
      act(() => { p = h().readBack(); });
      await flush();
      put(raw().map((r) => { const { oc: _o, sending: _s, ...rest } = r; void _o; void _s; return { ...rest, pending: true, at: Date.now(), t: r.t + 1 } as StoredChange; }));
      readGate.res();
      let ok: boolean | undefined;
      await act(async () => { ok = await p; await flush(); });
      expect(ok).toBe(false);
      expect(raw()[0]!.pending).toBe(true);
      readGate = null;
    });
  }
});

// A warned keyed release over another tab's newer outcome keeps that outcome's nonce in
// storage and in memory: a hold read afterwards names it, and a proof on that hold retires the change.
describe('after a warned keyed release, a fresh hold names the outcome the write kept', () => {
  it('defineMutation: dismiss(vars, hold) over a newer outcome, then complete(vars, fresh hold) retires it', async () => {
    await sent(families[0]!);
    const hold = await runM.holdOf({ id: 'a' });
    answerElsewhere();
    let ok: boolean | undefined;
    await act(async () => { ok = await runM.dismiss({ id: 'a' }, hold!); await flush(); });
    expect(ok).toBe(true);
    expect(raw()[0]).toMatchObject({ pending: false, oc: 'answered-elsewhere' });
    const fresh = await runM.holdOf({ id: 'a' });
    expect(fresh!.endsWith('~answered-elsewhere')).toBe(true);
    await act(async () => { ok = await runM.complete({ id: 'a' }, fresh!); await flush(); });
    expect(ok).toBe(true);
    expect(raw()).toHaveLength(0);
  });
});

// ReadBack(vars) takes its account and context before its digest await: a realm round
// trip while it hashes judges nothing.
describe('readBack(vars) refuses a realm or account round trip during its digest', () => {
  it('defineMutation: R1 -> R2 -> R1 while hashing: false, the hold stays', async () => {
    await sent(families[0]!);
    verdict = 'not_applied';
    let p!: Promise<boolean>;
    act(() => { p = runM.readBack({ id: 'a' }); setRealm(R2); bump('switch'); setRealm(R1); bump('switch'); });
    let ok: boolean | undefined;
    await act(async () => { ok = await p; await flush(); });
    expect(ok).toBe(false);
    expect(raw()[0]!.pending).toBe(true);
  });
  it('defineMutation: account A -> B -> A while hashing: false, the hold stays', async () => {
    await sent(families[0]!);
    verdict = 'not_applied';
    const { snapshot } = await import('./ctx');
    const me = snapshot().identity!.id;
    let p!: Promise<boolean>;
    act(() => {
      p = runM.readBack({ id: 'a' });
      setIdentity({ id: 'someone-else', banned: false }); bump('account');
      setIdentity({ id: me, banned: false }); bump('account');
    });
    let ok: boolean | undefined;
    await act(async () => { ok = await p; await flush(); });
    expect(ok).toBe(false);
    expect(raw()[0]!.pending).toBe(true);
  });
});

// The first proof in the tab that sent, started while that send's pending answer is
// still queued behind the store lock (its write not landed): the answer's turn comes first (FIFO), stores the outcome
// the proof's hold names, and the proof frees it on that first read.
describe('a first proof queued behind its own send\'s answer frees on the first read', () => {
  // The families that send over the wire (useLockedChange's fixture send answers before any request goes out).
  for (const f of families.filter((x) => x.settleVars)) {
    it(`${f.name}: answer and proof both wait on the store lock; the proof answers true`, async () => {
      const postGate = deferred<void>();
      onFetch(async (c) => { if (c.method !== 'POST') return { status: 200, body: { data: [] } }; await postGate.p; return { status: 502, body: {} }; });
      // Every store read and write, tagged with the store-lock grant it ran in (0: outside any grant).
      const log: Array<{ op: 'r' | 'w'; grant: number; text: string | null }> = [];
      let grant = 0, grants = 0;
      const own = navigator.locks.request;
      unwrapLocks = () => Object.defineProperty(navigator.locks, 'request', { configurable: true, writable: true, value: own });
      const real = navigator.locks.request.bind(navigator.locks) as (name: string, cb: (l: unknown) => unknown) => Promise<unknown>;
      Object.defineProperty(navigator.locks, 'request', { configurable: true, writable: true, value: (name: string, ...rest: unknown[]) => {
        const cb = rest[rest.length - 1] as (l: unknown) => unknown;
        return real(name, async (l: unknown) => { const me = ++grants; grant = me; try { return await cb(l); } finally { if (grant === me) grant = 0; } });
      } });
      setChangeStoreAdapter({
        read: () => { const text = localStorage.getItem(CHANGE_STORE_KEY); log.push({ op: 'r', grant, text }); return text; },
        write: (text) => { log.push({ op: 'w', grant, text }); try { if (text === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, text); return true; } catch { return false; } },
      });
      const h = f.mount();
      let sending!: Promise<unknown>;
      act(() => { sending = f.start(h); });
      await flush();
      let open!: () => void;
      const gate = new Promise<void>((r) => { open = r; });
      void navigator.locks.request('hub_changes', () => gate); // another tab holds the store lock
      await flush();
      postGate.res(); // the answer: pending; its write waits for the lock
      await act(async () => { await sending; await flush(); });
      expect(raw()[0]?.pending === true && raw()[0]?.sending === undefined).toBe(false); // not landed yet
      verdict = 'not_applied';
      let p!: Promise<boolean>;
      act(() => { p = h().readBack(); });
      await flush();
      open();
      let ok: boolean | undefined;
      await act(async () => { ok = await p; await flush(); });
      expect(ok).toBe(true);
      expect(raw().every((r) => !r.pending)).toBe(true);
      // The proof's write (the first that leaves nothing pending) ran inside a grant, after a read in that same grant
      // that still showed the change pending, with no other grant's write between them.
      const pendingIn = (text: string | null) => (JSON.parse(text || '[]') as StoredChange[]).some((r) => r.pending);
      const w = log.findIndex((e, i) => e.op === 'w' && !pendingIn(e.text) && log.slice(0, i).some((x) => x.op === 'w' && pendingIn(x.text)));
      expect(w).toBeGreaterThan(0);
      expect(log[w]!.grant).toBeGreaterThan(0);
      const r = log.slice(0, w).map((e, i) => ({ ...e, i })).filter((e) => e.op === 'r' && e.grant === log[w]!.grant && pendingIn(e.text)).pop();
      expect(r).toBeDefined();
      expect(log.slice(r!.i + 1, w).some((e) => e.op === 'w' && e.grant !== log[w]!.grant)).toBe(false);
    });
  }
});

// UseLockedChange's warned dismiss() answers what core stored: false when its free is
// refused (the account changed while it waited for its store-lock turn), so a page keeps its state; true at rest.
describe('useLockedChange dismiss() answers the stored outcome', () => {
  it('false when the account switches during its store-lock turn (the hold stays); true for a dismiss at rest', async () => {
    let last!: LockedChange<V, unknown>;
    function P() { last = useLockedChange(lockedSend, [q], 's1.l24', { lock: 's1.locked', lockKey: (v: V) => ({ id: v.id }), proves, page: 'scripts', realm: true }); return null; }
    render(<P />, { wrapper: wrap });
    await act(async () => { await last.run({ id: 'a' }); await flush(); });
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    void navigator.locks.request('hub_changes', () => gate); // another tab holds the store lock
    await flush();
    let p!: Promise<boolean>;
    act(() => { p = last.dismiss(); });
    act(() => { setIdentity({ id: 'someone-else', banned: false }); bump('account'); });
    open();
    let ok: boolean | undefined;
    await act(async () => { ok = await p; await flush(); });
    expect(ok).toBe(false);
    expect(raw()[0]!.pending).toBe(true);
  });
  it('answers nothing while its store-lock turn waits, then true once the free is stored', async () => {
    let last!: LockedChange<V, unknown>;
    function P() { last = useLockedChange(lockedSend, [q], 's1.l24c', { lock: 's1.locked', lockKey: (v: V) => ({ id: v.id }), proves, page: 'scripts', realm: true }); return null; }
    render(<P />, { wrapper: wrap });
    await act(async () => { await last.run({ id: 'a' }); await flush(); });
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    void navigator.locks.request('hub_changes', () => gate); // another tab holds the store lock
    await flush();
    let answer: boolean | undefined;
    act(() => { void last.dismiss().then((v) => { answer = v; }); });
    await act(async () => { await flush(); });
    expect(answer).toBeUndefined();
    expect(raw()[0]!.pending).toBe(true);
    open();
    await act(async () => { await flush(); });
    expect(answer).toBe(true);
    expect(raw().every((r) => !r.pending)).toBe(true);
  });
  it('true when its free is stored', async () => {
    let last!: LockedChange<V, unknown>;
    function P() { last = useLockedChange(lockedSend, [q], 's1.l24b', { lock: 's1.locked', lockKey: (v: V) => ({ id: v.id }), proves, page: 'scripts', realm: true }); return null; }
    render(<P />, { wrapper: wrap });
    await act(async () => { await last.run({ id: 'a' }); await flush(); });
    let ok: boolean | undefined;
    await act(async () => { ok = await last.dismiss(); await flush(); });
    expect(ok).toBe(true);
    expect(raw().every((r) => !r.pending)).toBe(true);
  });
});

// A hold without an outcome nonce (an older build's record) whose record another tab
// removed without this runtime hearing of it: release, complete and discard answer false and keep the memory hold;
// only the warned Dismiss frees it, and no record is written back.
describe('a nonce-less hold whose record is gone is freed only by the warned Dismiss', () => {
  const META = { base: 'lock:s1.raw', target: null, realm: R1, by: 'q:s1@s1.raw' };
  it('release/complete/discard: false, memory kept, storage stays empty; warned release frees it', async () => {
    expect((await C.guarded('s', 'r25', async () => ({ outcome: 'pending' as const, idem: 'K' }), META)).outcome).toBe('pending');
    await flush();
    stripOc(CHANGE_FMT);
    C.reloadChangesForTests();
    await flush();
    const hold = C.holdOfLock('s', 'r25')!;
    expect(hold.endsWith('~')).toBe(true);
    put([]); // another tab removed it; no storage event reaches this runtime
    expect(await C.complete('s', 'r25', hold)).toBe(false);
    expect(await C.discard('s', 'r25', hold)).toBe(false);
    expect(await C.release('s', 'r25', hold)).toBe(false);
    expect(C.isPending('s', 'r25')).toBe(true);
    expect(raw()).toEqual([]);
    expect(await C.release('s', 'r25', hold, { warned: true })).toBe(true);
    expect(C.isPending('s', 'r25')).toBe(false);
    expect(raw()).toEqual([]);
  });
});

// The keyless case of the older-tab row above (a route that takes no key):
// an older tab stores a newer pending answer without a nonce while the read is out: the proof frees nothing, and the
// next press sends nothing.
describe('keyless: an older tab\'s newer answer during a read is proved by nothing; the next press sends nothing', () => {
  it('defineMutation without a key: readBack false, the record stays pending, the next run sends nothing', async () => {
    let last!: MutationHook<V, unknown>;
    function P() { last = keylessM.use(); return null; }
    render(<P />, { wrapper: wrap });
    const h = () => last as unknown as Ctl;
    await act(async () => { await keylessM.run({ id: 'a' }); await flush(); });
    expect(raw()).toHaveLength(1);
    expect(raw()[0]!.pending).toBe(true);
    expect(raw()[0]!.key).toBeNull();
    const before = posts();
    verdict = 'not_applied';
    readGate = deferred<void>();
    let p!: Promise<boolean>;
    act(() => { p = h().readBack(); });
    await flush();
    put(raw().map((r) => { const { oc: _o, sending: _s, ...rest } = r; void _o; void _s; return { ...rest, pending: true, at: Date.now(), t: r.t + 1 } as StoredChange; }));
    readGate.res();
    let ok: boolean | undefined;
    await act(async () => { ok = await p; await flush(); });
    readGate = null;
    expect(ok).toBe(false);
    expect(raw()[0]!.pending).toBe(true);
    let again: unknown;
    await act(async () => { again = await keylessM.run({ id: 'a' }); await flush(); });
    expect(again).toMatchObject({ outcome: 'not_sent' });
    expect(posts()).toBe(before);
  });
});

// The entry check is not just a spared lock turn. A free whose context moved before it was
// called answers refused and takes no store-lock turn, so an older build's record waiting to convert stays as it was.
describe('a free called after its context moved writes nothing, not even a conversion', () => {
  const META = { base: 'lock:s1.raw', target: null, realm: R1, by: 'q:s1@s1.raw' };
  it('complete/discard/release with a stale ctx: refused, storage untouched', async () => {
    expect((await C.guarded('s', 'r27', async () => ({ outcome: 'pending' as const, idem: 'K' }), META)).outcome).toBe('pending');
    await flush();
    const hold = C.holdOfLock('s', 'r27')!;
    const [mine] = raw();
    const { oc: _o, fmt: _f, ...older } = mine!; void _o; void _f;
    put([mine!, { ...older, id: mine!.id.replace('r27', 'r27old') } as StoredChange]); // an older build's record
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    let writes = 0;
    setChangeStoreAdapter({
      read: () => localStorage.getItem(CHANGE_STORE_KEY),
      write: (text) => { writes++; if (text === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, text); return true; },
    });
    const ctx = C.changeContext(), owner = C.changeOwner();
    act(() => { bump('switch'); });
    for (const kind of ['complete', 'discard', 'release'] as const) {
      expect(await C.settleChange({ scope: 's', digest: 'r27', hold, kind, ctx, owner })).toBe('refused');
    }
    expect(writes).toBe(0);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    expect(C.isPending('s', 'r27')).toBe(true);
  });
});
