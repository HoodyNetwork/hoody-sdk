// A hold token names one send (a nonce
// per admission, stable across runtimes), the source forwards it, a proof never frees a hold recording no sender,
// an across-realms hold is dismissable from any realm, and nothing writes the shared list uncoordinated.
import { QueryClientProvider, type UseMutationResult } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './changes';
import { CHANGE_STORE_KEY, SENDING_HEARTBEAT_MS, readChanges, setChangeStoreAdapter } from './change-store';
import { bump, setIdentity, setRealm, snapshot } from './ctx';
import { computerLifecycle } from './power';
import { defineMutation, defineQuery, queryClient, refreshFresh } from './query';
import { refreshFresh as coreRefreshFresh } from './index';
import { defineRoute } from './routes';
import { coreSource, type SourceError, type SourceMutation, type SourceResult } from './source';
import { boot, calls, onFetch, R1, R2, settle } from './test/env';

const posts = (): number => calls.filter((c) => c.method === 'POST').length;
const switchTo = (r: string): void => { setRealm(r); bump('switch'); };
const META = { base: 'lock:case-d.raw', target: null, realm: R1, by: 'q:case-d@case-d.raw' };
const pendingWith = (idem: string) => async (replay: string | undefined) => ({ outcome: 'pending' as const, idem: replay ?? idem });
const reload = (): void => C.reloadChangesForTests();
const announce = (): boolean => window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
const incOf = (h: string | undefined): string | undefined => h?.split('#')[0];
type Stored = { id: string; pending: boolean; inc?: string; nonce?: string; meta?: { by?: string; page?: string } };
const stored = (): Stored[] => (readChanges() ?? []) as Stored[];
/** The warned forget of the shown account, passing exactly the holds the warning shows. */
const forgetShown = () => C.forgetAccountChanges(String(snapshot().account), C.changeHoldRefs(), { holdsIn: () => [], drop: () => {} });

describe('every admission is another send: a new nonce, so an earlier send\'s token frees nothing', () => {
  beforeEach(() => { boot({ realm: R1 }); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  const route = defineRoute({ method: 'POST', path: '/case-d/replay', scope: 'agent', body: ['n'], idem: true });
  const press = defineMutation<{ n: number }>(route, { input: (v) => ({ body: { n: v.n } }), lock: 'case-d.replay', lockKey: (v) => ({ n: v.n }), page: 'programs' });
  it('a replay of the kept key keeps the incarnation under a new nonce; the first send\'s token no longer frees it', async () => {
    const first = (await press.run({ n: 1 })).hold!;
    expect(await press.settle({ n: 1 }, first)).toBe(true); // released, its key kept
    const second = (await press.run({ n: 1 })).hold!;
    expect(posts()).toBe(2);
    expect(incOf(second)).toBe(incOf(first));
    expect(second).not.toBe(first);
    for (const f of [press.settle, press.dismiss, press.complete, press.discard]) expect(await f({ n: 1 }, first)).toBe(false);
    expect(await press.isPending({ n: 1 })).toBe(true);
    expect(stored().map((r) => r.inc + '#' + r.nonce)).toEqual([second.split('~')[0]]);
    expect(await press.dismiss({ n: 1 }, second)).toBe(true);
  });
  it('the token survives a reload unchanged (a tab-local count never enters it)', async () => {
    await C.guarded('s', 'd', pendingWith('K1'), META);
    const h = C.holdOfLock('s', 'd')!;
    reload();
    expect(C.holdOfLock('s', 'd')).toBe(h);
    reload();
    expect(C.holdOfLock('s', 'd')).toBe(h);
    expect(await C.release('s', 'd', h)).toBe(true);
  });
});

describe('a proof (discard) never frees a hold recording no sender; the warned Dismiss does', () => {
  beforeEach(() => { boot({ realm: R1 }); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  function storeNoSender(): void {
    const list = JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Stored[];
    for (const r of list) if (r.meta) { delete r.meta.by; delete r.meta.page; }
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list));
    reload();
  }
  it('a query definition: discard false, complete false, dismiss true', async () => {
    const route = defineRoute({ method: 'POST', path: '/case-d/nobody', scope: 'realm', body: ['n'] });
    const m = defineMutation<{ n: number }>(route, { input: (v) => ({ body: { n: v.n } }), lock: 'case-d.nobody', lockKey: (v) => ({ n: v.n }), page: 'programs' });
    expect((await m.run({ n: 1 })).outcome).toBe('pending');
    storeNoSender();
    const [h] = C.heldChanges('case-d.nobody');
    expect(h!.by).toBe(undefined);
    expect(await m.discard({ n: 1 }, h!.hold!)).toBe(false);
    expect(await m.complete({ n: 1 }, h!.hold!)).toBe(false);
    expect(await m.isPending({ n: 1 })).toBe(true);
    expect(await m.dismiss({ n: 1 }, h!.hold!)).toBe(true);
    expect(await m.isPending({ n: 1 })).toBe(false);
  });
});

describe('a source change forwards its hold, and its discard never frees a hold recording no sender', () => {
  const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }
  const create = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/case-d/sessions', scope: 'agent', body: ['name'], idem: true });
  const sessions = defineRoute({ method: 'GET', path: '/case-d/sessions', scope: 'agent' });
  const table = { reads: { sessions: { route: sessions } }, changes: { create: { route: create, lock: 'case-d.src', input: (v: { name: string }) => ({ body: v }), reads: ['sessions'] } } };
  let n = 0;
  function mount(): { m: () => UseMutationResult<SourceResult<unknown>, SourceError, { name: string }> & SourceMutation<unknown, { name: string }> } {
    const src = coreSource('case-d-src-' + ++n, table);
    let last!: ReturnType<typeof src.useMutation<unknown, { name: string }>>;
    function Probe() { last = src.useMutation<unknown, { name: string }>('create'); return null; }
    render(<Probe />, { wrapper: wrap });
    return { m: () => last as never };
  }
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: { data: [] } })); });
  afterEach(() => { cleanup(); });
  it('(5) SourceResult.hold is the send\'s token: holdOf answers it, only it dismisses', async () => {
    const { m } = mount();
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m().mutateAsync({ name: 'a' }); await flush(); });
    expect(r.outcome).toBe('pending');
    expect(r.hold).toBeTruthy();
    expect(C.heldChanges('case-d.src').map((h) => h.hold)).toEqual([r.hold]);
    expect(await m().holdOf({ name: 'a' })).toBe(r.hold);
    expect(await m().dismiss({ name: 'a' }, incOf(r.hold) + '#other')).toBe(false);
    let freed = false;
    await act(async () => { freed = await m().dismiss({ name: 'a' }, r.hold!); await flush(); });
    expect(freed).toBe(true);
    expect(C.heldChanges('case-d.src')).toEqual([]);
  });
  it('(6) a hold recording no sender: await discard(vars, hold) false, dismiss(vars, hold) true', async () => {
    const { m } = mount();
    await act(async () => { await m().mutateAsync({ name: 'a' }); await flush(); });
    const list = JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Stored[];
    for (const x of list) if (x.meta) { delete x.meta.by; delete x.meta.page; }
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list));
    reload();
    const [h] = C.heldChanges('case-d.src');
    expect(h!.by).toBe(undefined);
    expect(await m().discard({ name: 'a' }, h!.hold!)).toBe(false);
    expect(C.heldChanges('case-d.src')).toHaveLength(1);
    let freed = false;
    await act(async () => { freed = await m().dismiss({ name: 'a' }, h!.hold!); await flush(); });
    expect(freed).toBe(true);
    expect(C.heldChanges('case-d.src')).toEqual([]);
  });
});

describe('an across-realms hold sent in one realm is dismissed from another realm\'s view', () => {
  beforeEach(() => { boot({ realm: R1 }); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  it('sent in R1, seen held by another page in R2, dismissed in R2 with its token', async () => {
    const sent = await computerLifecycle.forPage('board').run({ id: 'c1', op: 'start' });
    expect(sent.outcome).toBe('pending');
    switchTo(R2);
    expect(await computerLifecycle.forPage('computers').heldByOther({ id: 'c1', op: 'start' })).toMatchObject({ code: 'HELD_BY_OTHER' });
    expect(await computerLifecycle.forPage('board').holdOf({ id: 'c1', op: 'start' })).toBe(sent.hold);
    expect(await computerLifecycle.forPage('board').dismiss({ id: 'c1', op: 'start' }, sent.hold!)).toBe(true);
    expect(C.heldChanges('computer.lifecycle')).toEqual([]);
    expect(posts()).toBe(1);
  });
});

describe('without cross-tab coordination no writer replaces the shared list; records stay', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  // A free can prove nothing without the store lock, so it answers false and keeps memory too.
  it('a release with no navigator.locks frees nothing (false; memory and storage keep the hold); a reload still has it', async () => {
    await C.guarded('s', 'd', pendingWith('K1'), META);
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    vi.stubGlobal('navigator', {});
    expect(await C.release('s', 'd', C.holdOfLock('s', 'd')!)).toBe(false);
    expect(C.isPending('s', 'd')).toBe(true);
    await settle();
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    reload();
    expect(C.isPending('s', 'd')).toBe(true);
  });
  // Erasing another tab's hold needs a stale snapshot written over that tab's newer record; a write
  // uncoordinated is what allows it, so the pin is: an uncoordinated free writes nothing at all.
  it('a discard with no navigator.locks writes nothing: this tab\'s record and another tab\'s both stay as stored', async () => {
    await C.guarded('s', 'mine', pendingWith('K1'), META);
    const mine = C.holdOfLock('s', 'mine')!;
    // Another tab admits a different change under its lock.
    const list = JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Array<Stored & { t: number; key: string | null }>;
    const other = { ...list[0]!, id: list[0]!.id.replace(/mine$/, 'theirs'), t: list[0]!.t + 1, inc: 'other-inc', nonce: 'other-nonce' };
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([...list, other]));
    vi.stubGlobal('navigator', {});
    expect(await C.discard('s', 'mine', mine)).toBe(false);
    expect(C.holdOfLock('s', 'mine')).toBe(mine);
    await settle();
    expect(stored().map((r) => r.id).sort()).toEqual([list[0]!.id, other.id].sort());
    expect(stored().every((r) => r.pending)).toBe(true);
  });
  it('a lock request that rejects: a send\'s answer is still the send\'s (never failed), the hold stays in memory', async () => {
    const real = (globalThis.navigator as { locks?: unknown }).locks;
    let n = 0;
    // Admission gets the lock; every later request (the answer's write) is refused.
    vi.stubGlobal('navigator', { locks: { request: (name: string, cb: () => unknown) => (n++ === 0 ? (real as { request: (a: string, b: () => unknown) => Promise<unknown> }).request(name, cb) : Promise.reject(new Error('AbortError'))) } });
    const res = await C.guarded('s', 'd', pendingWith('K1'), META);
    expect(res.outcome).toBe('pending');
    await settle();
    expect(C.isPending('s', 'd')).toBe(true);
    expect(n).toBeGreaterThan(1);
  });
  it('the heartbeat never writes uncoordinated: a send out while locks go away keeps its stored stamp as it was', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    let open!: (v: { outcome: 'pending'; idem: string }) => void;
    const going = C.guarded('s', 'd', () => new Promise<{ outcome: 'pending'; idem: string }>((r) => { open = r; }), META);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    expect(before).toContain('sending');
    const real = globalThis.navigator;
    vi.stubGlobal('navigator', {});
    vi.advanceTimersByTime(60_000);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    vi.stubGlobal('navigator', real);
    open({ outcome: 'pending', idem: 'K1' });
    expect((await going).outcome).toBe('pending');
  });
  it('(18) the heartbeat writes only over a clean read: a record this build cannot read (another tab\'s hold) stays, byte for byte', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    let open!: (v: { outcome: 'pending'; idem: string }) => void;
    const send = vi.fn(() => new Promise<{ outcome: 'pending'; idem: string }>((r) => { open = r; }));
    const going = C.guarded('s', 'd', send, META);
    for (let i = 0; i < 20 && !send.mock.calls.length; i++) await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    // Another build's record (unreadable here: pending is not a boolean): another tab's hold, as far as this tab knows.
    // Beside it, another tab's readable hold of a different change: the beat must keep both, byte for byte.
    const list = JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Array<Stored & { t: number; key: string | null; sending?: unknown }>;
    const theirs = { ...list[0]!, id: list[0]!.id.replace(/d$/, 'theirs'), pending: true, key: 'K9', inc: 'other-inc', nonce: 'other-nonce', t: list[0]!.t + 1 };
    delete theirs.sending;
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([...list, theirs, { id: 'other-build', pending: 'yes', t: 1 }]));
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    expect(before).toContain('other-nonce');
    for (let k = 0; k < 3; k++) {
      vi.advanceTimersByTime(SENDING_HEARTBEAT_MS);
      for (let i = 0; i < 20; i++) await Promise.resolve();
    }
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    open({ outcome: 'pending', idem: 'K1' });
    expect((await going).outcome).toBe('pending');
  });
  it('forgetAccountChanges without coordination forgets nothing and answers failed', async () => {
    await C.guarded('s', 'd', pendingWith('K1'), META);
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    vi.stubGlobal('navigator', {});
    expect(await forgetShown()).toBe('failed');
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    vi.stubGlobal('navigator', { locks: { request: () => { throw new Error('SecurityError'); } } });
    expect(await forgetShown()).toBe('failed');
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    vi.unstubAllGlobals();
    expect(await forgetShown()).toBe('done');
    expect(stored()).toEqual([]);
  });
});

const as = (id: string): void => { setIdentity({ id, banned: false }); bump('account'); };
const OTHER = 'someone-else';
/** Moves the shown account's stored records to account `uid` and shows `uid`: that account now holds them
 *  (a send of its own; the API session of the test stays the first account's, so B cannot press itself). */
function moveRecordsTo(uid: string): void {
  const from = C.changeOwner();
  as(uid);
  const to = C.changeOwner();
  const list = JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Array<Stored & { t: number }>;
  localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list.map((r) => (r.id.startsWith(from) ? { ...r, id: to + r.id.slice(from.length), t: r.t + 1 } : r))));
  reload();
}

describe('a failed forget forgets nothing, in storage or in memory', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  afterEach(() => { setChangeStoreAdapter(null); vi.unstubAllGlobals(); });
  it('a refused write: failed, the hold still counted and pending here, so the next sign-out asks again', async () => {
    await C.guarded('s', 'd', pendingWith('K1'), META);
    expect(C.unresolvedChanges()).toBe(1);
    setChangeStoreAdapter({ read: () => localStorage.getItem(CHANGE_STORE_KEY), write: () => false });
    expect(await forgetShown()).toBe('failed');
    setChangeStoreAdapter(null);
    expect(C.unresolvedChanges()).toBe(1);
    expect(C.isPending('s', 'd')).toBe(true);
    expect(stored()).toHaveLength(1);
    expect(await forgetShown()).toBe('done');
    expect(C.unresolvedChanges()).toBe(0);
    expect(stored()).toEqual([]);
  });
  // The removal write lands, the read that should prove it fails. The forget fails, so the records
  // are still holds: storage gets them back, and neither a clean refresh nor a reload loses them.
  const plain = { read: () => localStorage.getItem(CHANGE_STORE_KEY), write: (t: string | null) => { if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t); return true; } };
  // The read that should prove the removal fails once, by throwing or by reading back corrupt.
  for (const how of ['throws', 'reads back corrupt'] as const) {
    it(`the removal lands, its read-back ${how}: failed, the exact prior records go back at once; a clean refresh and a reload keep the hold`, async () => {
      await C.guarded('s', 'd', pendingWith('K1'), META);
      const before = localStorage.getItem(CHANGE_STORE_KEY);
      let wrote = false, failed = 0;
      setChangeStoreAdapter({
        read: () => { if (wrote && failed === 0) { failed++; if (how === 'throws') throw new Error('read failed'); return '{not json'; } return plain.read(); },
        write: (t) => { wrote = true; return plain.write(t); },
      });
      expect(await forgetShown()).toBe('failed');
      setChangeStoreAdapter(null);
      expect(failed).toBe(1);
      expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
      announce();
      await settle();
      expect(C.unresolvedChanges()).toBe(1);
      reload();
      expect(C.unresolvedChanges()).toBe(1);
      expect(C.isPending('s', 'd')).toBe(true);
    });
  }
  // An earlier version kept the records and
  // wrote them back later, which could resurrect a freed hold. Now there is no verdict: 'unknown', this tab drops
  // the account's holds, and nothing is ever written back.
  it('the removal lands, its read-back fails and the write-back is refused: unknown, memory drops the hold, nothing is written back', async () => {
    await C.guarded('s', 'd', pendingWith('K1'), META);
    let writes = 0, broken = true;
    setChangeStoreAdapter({ read: () => { if (writes > 0 && broken) throw new Error('read failed'); return plain.read(); }, write: (t) => (++writes === 1 ? plain.write(t) : false) });
    expect(await forgetShown()).toBe('unknown');
    expect(writes).toBe(2); // the removal, then the refused write-back
    expect(JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) ?? '[]')).toEqual([]); // the removal did land
    expect(C.unresolvedChanges()).toBe(0);
    broken = false;
    setChangeStoreAdapter(null);
    announce();
    await settle();
    expect(stored()).toEqual([]);
    reload();
    expect(C.unresolvedChanges()).toBe(0);
    expect(await forgetShown()).toBe('done');
  });
  it('a store that reads back corrupt: failed, memory keeps the hold', async () => {
    await C.guarded('s', 'd', pendingWith('K1'), META);
    localStorage.setItem(CHANGE_STORE_KEY, '{not json');
    expect(await forgetShown()).toBe('failed');
    expect(C.unresolvedChanges()).toBe(1);
  });
});

describe('forget names the leaving account; others\' holds stay', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  it('forgetAccountChanges(uid) removes only that account\'s records; the shown account keeps its own', async () => {
    const a = String(snapshot().account);
    as(OTHER);
    await C.guarded('s', 'b', pendingWith('KB'), META);
    as(a);
    await C.guarded('s', 'a', pendingWith('KA'), META);
    expect(stored()).toHaveLength(2);
    expect(await C.forgetAccountChanges(OTHER, C.changeHoldRefsIn(readChanges()!, OTHER, Date.now()), { holdsIn: () => [], drop: () => {} })).toBe('done');
    expect(stored().map((r) => r.id.endsWith('a'))).toEqual([true]);
    expect(C.isPending('s', 'a')).toBe(true);
    expect(await C.forgetAccountChanges('', [], { holdsIn: () => [], drop: () => {} })).toBe('failed');
    expect(stored()).toHaveLength(1);
  });
});

describe('a lock with no token (a record stored before incarnations) is never taken by a missing hold', () => {
  beforeEach(() => { boot({ realm: R1 }); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  it('release, complete, discard and heldInstance refuse undefined and \'\'; the query layer too', async () => {
    const route = defineRoute({ method: 'POST', path: '/case-d/legacy', scope: 'realm', body: ['n'] });
    const m = defineMutation<{ n: number }>(route, { input: (v) => ({ body: { n: v.n } }), lock: 'case-d.legacy', lockKey: (v) => ({ n: v.n }), page: 'programs' });
    expect((await m.run({ n: 1 })).outcome).toBe('pending');
    const list = JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Stored[];
    for (const r of list) { delete r.inc; delete r.nonce; }
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list));
    reload();
    const [h] = C.heldChanges('case-d.legacy');
    expect(h!.hold).toBe(undefined);
    const { scope, digest } = C.pendingOf('lock:case-d.legacy')[0]!;
    for (const bad of [undefined, ''] as unknown as string[]) {
      expect(await C.release(scope, digest, bad)).toBe(false);
      expect(await C.complete(scope, digest, bad)).toBe(false);
      expect(await C.discard(scope, digest, bad)).toBe(false);
      expect(C.heldInstance('lock:case-d.legacy', bad)).toBe(null);
      for (const f of [m.settle, m.dismiss, m.complete, m.discard]) expect(await f({ n: 1 }, bad)).toBe(false);
    }
    expect(C.isPending(scope, digest)).toBe(true);
  });
});

describe('an account switch inside a call\'s await never reaches the other account\'s lock', () => {
  beforeEach(() => { boot({ realm: R1 }); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  const route = defineRoute({ method: 'POST', path: '/case-d/acct', scope: 'agent', body: ['n', 'x'], idem: true });
  const m = defineMutation<{ n: number; x: string }>(route, { input: (v) => ({ body: { n: v.n, x: v.x } }), lock: 'case-d.acct', lockKey: (v) => ({ n: v.n }), page: 'programs' });
  const keyOf = (): Array<string | null | undefined> => (readChanges() ?? []).map((r) => r.key);
  it('(14) a press made in A, the account switched to B while hashing: stale, nothing sent, B\'s kept key untouched', async () => {
    const a = String(snapshot().account);
    const b = await m.run({ n: 1, x: 'old' });
    expect(b.outcome).toBe('pending');
    expect(await m.settle({ n: 1, x: 'old' }, b.hold!)).toBe(true); // released, its key kept
    moveRecordsTo(OTHER); // B holds that released change with its kept key
    const kept = JSON.stringify(readChanges());
    expect(keyOf()).toEqual([b.idem]);
    as(a); // A holds nothing of it
    const going = m.run({ n: 1, x: 'new' }); // other bytes: in B's lock this would drop the kept key
    as(OTHER);
    const res = await going;
    expect(res.outcome).toBe('stale');
    expect(posts()).toBe(1);
    expect(JSON.stringify(readChanges())).toBe(kept);
  });
  it('(15) heldByOther and isPending asked in A, answered after a switch to B: nothing of B\'s is named', async () => {
    const a = String(snapshot().account);
    expect((await computerLifecycle.forPage('board').run({ id: 'c1', op: 'start' })).outcome).toBe('pending');
    moveRecordsTo(OTHER);
    as(a);
    const other = computerLifecycle.forPage('computers').heldByOther({ id: 'c1', op: 'start' });
    const pend = computerLifecycle.forPage('computers').isPending({ id: 'c1', op: 'start' });
    as(OTHER);
    expect(await other).toBe(undefined);
    expect(await pend).toBe(false);
    expect(await computerLifecycle.forPage('computers').heldByOther({ id: 'c1', op: 'start' })).toMatchObject({ code: 'HELD_BY_OTHER' });
    expect(await computerLifecycle.forPage('computers').isPending({ id: 'c1', op: 'start' })).toBe(true);
  });
  it('(17) a dismiss made in A, switched to B (holding a record with the very same token) while hashing: B\'s stays', async () => {
    const a = String(snapshot().account);
    const sent = await m.run({ n: 2, x: 'a' });
    const aOwn = C.changeOwner();
    as(OTHER);
    const bOwn = C.changeOwner();
    // B's record of the same change carrying A's token (inc and nonce): only the account guard tells them apart.
    const list = JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Array<Stored & { t: number }>;
    const twin = { ...list[0]!, id: bOwn + list[0]!.id.slice(aOwn.length), t: list[0]!.t + 1 };
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([...list, twin]));
    reload();
    expect(C.heldChanges('case-d.acct').map((h) => h.hold)).toEqual([sent.hold]);
    as(a);
    const going = m.dismiss({ n: 2, x: 'a' }, sent.hold!);
    as(OTHER);
    expect(await going).toBe(false);
    expect(C.heldChanges('case-d.acct').map((h) => h.hold)).toEqual([sent.hold]);
    as(a);
    expect(await m.dismiss({ n: 2, x: 'a' }, sent.hold!)).toBe(true);
  });
});

describe('the hook\'s own sends honour acrossRealms', () => {
  beforeEach(() => { boot({ realm: R1 }); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  it('a computer Start sent from the hook in R1 is settled by the same hook after a switch to R2', async () => {
    const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const def = computerLifecycle.forPage('board');
    let hook!: ReturnType<typeof def.use>;
    function Probe() { hook = def.use(); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await hook.run({ id: 'c1', op: 'start' }); });
    expect(C.heldChanges('computer.lifecycle')).toHaveLength(1);
    await act(async () => { switchTo(R2); });
    await act(async () => { hook.settle(); });
    expect(C.heldChanges('computer.lifecycle')).toEqual([]);
  });
});

// Two runtimes on one storage (two tabs, or a page and its reload in another module graph): each its own module
// instances (their own registry, counters and tab id), the browser's localStorage and navigator.locks shared.
type Changes = typeof C;
async function secondRuntime(): Promise<Changes> {
  const saved: Array<[string, string]> = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; saved.push([k, localStorage.getItem(k)!]); }
  vi.resetModules();
  const env = await import('./test/env');
  env.boot({ realm: R1 }); // the same browser: same session, same realm
  for (const [k, v] of saved) localStorage.setItem(k, v);
  const B = await import('./changes');
  // boot() may already have loaded this graph's changes.ts (before the restore): load the shared records now.
  B.reloadChangesForTests();
  return B;
}

describe('two runtimes: after B replays a send, A\'s stale token frees nothing', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  afterEach(() => { cleanup(); });
  it('A sent, B released and replayed it: A\'s dismiss, complete and discard with A\'s token free nothing, in A or in storage', async () => {
    // A has an unrelated change pending first, so its counter is ahead of B's (the case a tab-local seq collided in).
    await C.guarded('s', 'x', pendingWith('KX'), META);
    await C.guarded('s', 'd', pendingWith('K1'), META);
    const aToken = C.holdOfLock('s', 'd')!;
    expect(await C.complete('s', 'x', C.holdOfLock('s', 'x')!)).toBe(true);
    const B = await secondRuntime();
    expect(B.holdOfLock('s', 'd')).toBe(aToken); // one send: one token in every runtime
    expect(await B.release('s', 'd', aToken)).toBe(true);
    const seen: Array<string | undefined> = [];
    const replay = await B.guarded('s', 'd', async (k) => { seen.push(k); return { outcome: 'pending' as const, idem: k ?? 'K2' }; }, META);
    expect(replay.outcome).toBe('pending');
    expect(seen).toEqual(['K1']);
    const bToken = B.holdOfLock('s', 'd')!;
    expect(incOf(bToken)).toBe(incOf(aToken));
    expect(bToken).not.toBe(aToken);
    announce(); // A hears B's write
    expect(C.holdOfLock('s', 'd')).toBe(bToken);
    expect(await C.release('s', 'd', aToken)).toBe(false);
    expect(await C.complete('s', 'd', aToken)).toBe(false);
    expect(await C.discard('s', 'd', aToken)).toBe(false);
    expect(C.isPending('s', 'd')).toBe(true);
    await settle();
    expect(stored().filter((r) => r.id.endsWith('d')).map((r) => [r.pending, r.inc + '#' + r.nonce])).toEqual([[true, bToken.split('~')[0]]]);
  });
});

describe('admission across runtimes: never two sends', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it('no navigator.locks: both runtimes refuse NO_COORDINATION, neither send is called, nothing stored', async () => {
    const B = await secondRuntime();
    vi.stubGlobal('navigator', {});
    const a = vi.fn(pendingWith('KA')), b = vi.fn(pendingWith('KB'));
    const [ra, rb] = await Promise.all([C.guarded('s', 'd', a, META), B.guarded('s', 'd', b, META)]);
    expect(ra).toEqual({ outcome: 'not_sent', code: 'NO_COORDINATION' });
    expect(rb).toEqual({ outcome: 'not_sent', code: 'NO_COORDINATION' });
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    expect(stored()).toEqual([]);
  });
  it('two runtimes with a stale "free" snapshot press at once: exactly one send; the other is refused unsent', async () => {
    const B = await secondRuntime(); // both loaded an empty store: each believes the change is free
    expect(C.isPending('s', 'd') || B.isPending('s', 'd')).toBe(false);
    let openA!: (v: { outcome: 'pending'; idem: string }) => void, openB!: (v: { outcome: 'pending'; idem: string }) => void;
    const a = vi.fn(() => new Promise<{ outcome: 'pending'; idem: string }>((r) => { openA = r; }));
    const b = vi.fn(() => new Promise<{ outcome: 'pending'; idem: string }>((r) => { openB = r; }));
    const pa = C.guarded('s', 'd', a, META), pb = B.guarded('s', 'd', b, META);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(a.mock.calls.length + b.mock.calls.length).toBe(1);
    if (openA) openA({ outcome: 'pending', idem: 'KA' });
    if (openB) openB({ outcome: 'pending', idem: 'KB' });
    const outs = (await Promise.all([pa, pb])).map((r) => r.outcome).sort();
    expect(outs).toEqual(['not_sent', 'pending']);
  });
});

// The source-side twins of (14), (15) and (16): coreSource's mutationFn, heldByOther and no-argument settle().
describe('an account switch never reaches the other account\'s lock; acrossRealms holds in every realm', () => {
  const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }
  const create = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/case-d/acct-src', scope: 'agent', body: ['name'], idem: true });
  const list = defineRoute({ method: 'GET', path: '/case-d/acct-src', scope: 'agent' });
  const table = {
    reads: { list: { route: list } },
    changes: {
      create: { route: create, lock: 'case-d.acct-src', input: (v: { name: string }) => ({ body: v }), reads: ['list'] },
      across: { route: create, lock: 'case-d.across-src', acrossRealms: true, input: (v: { name: string }) => ({ body: v }), reads: ['list'] },
    },
  };
  let n = 0;
  function mount(key: 'create' | 'across' = 'create'): { m: () => SourceMutation<unknown, { name: string }> & { mutateAsync: (v: { name: string }) => Promise<SourceResult<unknown>> } } {
    const src = coreSource('case-d-acct-src-' + ++n, table);
    let last!: ReturnType<typeof src.useMutation<unknown, { name: string }>>;
    function Probe() { last = src.useMutation<unknown, { name: string }>(key); return null; }
    render(<Probe />, { wrapper: wrap });
    return { m: () => last as never };
  }
  const gets = (): number => calls.filter((c) => c.method === 'GET').length;
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  it('(14) a press made in A, switched to B (holding that change pending) while hashing: stale, nothing sent, B\'s not read back', async () => {
    const { m } = mount();
    const a = String(snapshot().account);
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m().mutateAsync({ name: 'a' }); await flush(); });
    expect(r.outcome).toBe('pending');
    moveRecordsTo(OTHER); // B holds the pending change, recorded as this key's
    const kept = JSON.stringify(readChanges());
    await act(async () => { as(a); });
    const sent = posts(), read = gets();
    let res!: SourceResult<unknown>;
    await act(async () => { const going = m().mutateAsync({ name: 'a' }); as(OTHER); res = await going; await flush(); });
    expect(res.outcome).toBe('stale');
    expect(posts()).toBe(sent);
    expect(gets()).toBe(read);
    expect(JSON.stringify(readChanges())).toBe(kept);
  });
  it('(15) heldByOther asked in A, answered after a switch to B: nothing of B\'s is named', async () => {
    const one = mount(), two = mount();
    const a = String(snapshot().account);
    await act(async () => { await two.m().mutateAsync({ name: 'b' }); await flush(); });
    moveRecordsTo(OTHER); // B holds another page's pending change of these variables
    await act(async () => { as(a); });
    let got: unknown = 'unset';
    await act(async () => { const q = one.m().heldByOther({ name: 'b' }); as(OTHER); got = await q; });
    expect(got).toBe(undefined);
    expect(await one.m().heldByOther({ name: 'b' })).toMatchObject({ code: 'HELD_BY_OTHER' });
  });
  it('(16) an across-realms change sent from the hook in R1 is settled by the same hook (no arguments) after a switch to R2', async () => {
    const { m } = mount('across');
    await act(async () => { await m().mutateAsync({ name: 'c' }); await flush(); });
    expect(C.heldChanges('case-d.across-src')).toHaveLength(1);
    await act(async () => { switchTo(R2); });
    let freed = false;
    await act(async () => { freed = await m().settle(); await flush(); });
    expect(freed).toBe(true);
    expect(C.heldChanges('case-d.across-src')).toEqual([]);
  });
});

// The nonce in adopt() is a needed guard, not a second one. A replay another tab sent of this very
// hold (same incarnation, a new nonce) is another send: a read-back started after it must not join a read that was
// already out before it (its answer may predate the replay), so it sends its own request.
describe('a replay adopted while a read-back is out: a later read-back sends its own request', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  afterEach(() => { cleanup(); });
  it('the adopted replay moves the token and the pending mark: the next read-back does not join the earlier flight', async () => {
    const list = defineRoute<{ data: string[] }>({ method: 'GET', path: '/case-d/replayed', scope: 'agent' });
    const rows = defineQuery(list, { select: (r) => r.data });
    const go = defineRoute({ method: 'POST', path: '/case-d/replayed', scope: 'agent', body: ['x'], idem: true });
    const m = defineMutation<{ x: number }>(go, { input: (v) => ({ body: v }), reads: [rows], lock: 'case-d.replayed' });
    const opens: Array<() => void> = [];
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : new Promise((res) => { opens.push(() => res({ status: 200, body: { data: [] } })); })));
    const gets = (): number => calls.filter((c) => c.method === 'GET').length;
    // The page holds the read (an observer), as a page showing the hold does.
    const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    function Probe() { rows.use(undefined); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await settle(); for (const f of opens.splice(0)) f(); await settle(); });
    const sent = await m.run({ x: 1 });
    expect(sent.outcome).toBe('pending');
    await settle();
    const first = m.readBack({ x: 1 });
    await settle();
    const g1 = gets();
    expect(g1).toBeGreaterThan(0);
    // Another tab released and replayed this send: same incarnation, a new nonce; this tab adopts it.
    const stored0 = JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Array<Stored & { t: number }>;
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([{ ...stored0[0]!, nonce: 'replayed-elsewhere', t: stored0[0]!.t + 1 }]));
    announce();
    expect(C.heldChanges('case-d.replayed').map((h) => h.hold)).toEqual([incOf(sent.hold) + '#replayed-elsewhere~' + ((stored0[0] as { oc?: string }).oc ?? '')]);
    const second = m.readBack({ x: 1 });
    await settle();
    expect(gets()).toBe(g1 + 1);
    for (const f of opens) f();
    await settle();
    await Promise.all([first, second]);
  });
});

// A no-argument settle()/dismiss()/complete() frees only what THIS mount sent and showed.
// An editor of file B, mounted after file A's write went unknown, never frees A's hold by declaration alone.
describe('no-argument recovery frees only this mount\'s own sends', () => {
  const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }
  const write = defineRoute<unknown, { file: string; text: string }>({ method: 'POST', path: '/case-d/write', scope: 'agent', body: ['file', 'text'] });
  const files = defineRoute({ method: 'GET', path: '/case-d/files', scope: 'agent' });
  const table = { reads: { files: { route: files } }, changes: { write: { route: write, lock: 'case-d.write', lockKey: (v: { file: string }) => ({ file: v.file }), input: (v: { file: string; text: string }) => ({ body: v }), reads: ['files'] } } };
  const src = coreSource('case-d-editor', table);
  type M = SourceMutation<unknown, { file: string; text: string }> & { mutateAsync: (v: { file: string; text: string }) => Promise<SourceResult<unknown>>; pending: boolean };
  function editor(): { m: () => M; unmount: () => void } {
    let last!: M;
    function Probe() { last = src.useMutation<unknown, { file: string; text: string }>('write') as never; return null; }
    const r = render(<Probe />, { wrapper: wrap });
    return { m: () => last, unmount: r.unmount };
  }
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  it('file A\'s write goes unknown; the editor of file B (sent nothing) settles, dismisses and completes nothing; A\'s hold stays until dismissed by its own hold', async () => {
    const a = editor();
    let r!: SourceResult<unknown>;
    await act(async () => { r = await a.m().mutateAsync({ file: 'A', text: 'x' }); await flush(); });
    expect(r.outcome).toBe('pending');
    a.unmount();
    const b = editor();
    let out: boolean[] = [];
    await act(async () => { out = [await b.m().settle(), await b.m().dismiss(), await b.m().complete()]; await flush(); });
    expect(out).toEqual([false, false, false]);
    expect(C.heldChanges('case-d.write').map((h) => h.hold)).toEqual([r.hold]);
    expect(stored()).toHaveLength(1);
    // The page that shows A's hold frees it by naming it.
    let freed = false;
    await act(async () => { freed = await b.m().dismiss({ file: 'A', text: 'x' }, r.hold!); await flush(); });
    expect(freed).toBe(true);
    expect(C.heldChanges('case-d.write')).toEqual([]);
  });
  it('remount recovery by token: the later editor lists A\'s hold (hold, at, identity) and dismissHeld(row) frees exactly it', async () => {
    const a = editor();
    let r!: SourceResult<unknown>;
    await act(async () => { r = await a.m().mutateAsync({ file: 'A', text: 'x' }); await flush(); });
    a.unmount();
    const b = editor();
    const rows = b.m().held();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.hold).toBe(r.hold);
    expect(rows[0]!.identity).toEqual({ file: 'A' });
    expect(rows[0]!.at).toBeGreaterThan(0);
    let freed = false;
    await act(async () => { freed = await b.m().dismissHeld(rows[0]!); await flush(); });
    expect(freed).toBe(true);
    expect(C.heldChanges('case-d.write')).toEqual([]);
    expect(stored()).toEqual([]);
    expect(b.m().held()).toEqual([]);
  });
  it('by token: a stale token, another account and another key\'s row free nothing; settleHeld frees the shown one', async () => {
    const a = editor();
    let r!: SourceResult<unknown>;
    await act(async () => { r = await a.m().mutateAsync({ file: 'A', text: 'x' }); await flush(); });
    const [row] = a.m().held();
    expect(await a.m().settleHeld({ ...row!, hold: incOf(r.hold) + '#stale' })).toBe(false);
    // Another key on the same lock: its rows list nothing of this key's, and this key's row frees nothing there.
    const other = coreSource('case-d-editor-2', table);
    let o!: M;
    function Other() { o = other.useMutation<unknown, { file: string; text: string }>('write') as never; return null; }
    render(<Other />, { wrapper: wrap });
    expect(o.held()).toEqual([]);
    expect(await o.dismissHeld(row!)).toBe(false);
    // Another account shown, holding a record with this very token (only the account tells them apart): the row
    // read under the first account frees nothing of it.
    const first = String(snapshot().account);
    const aOwn = C.changeOwner();
    await act(async () => { as(OTHER); });
    const bOwn = C.changeOwner();
    const list = JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Array<Stored & { t: number }>;
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([...list, { ...list[0]!, id: bOwn + list[0]!.id.slice(aOwn.length), t: list[0]!.t + 1 }]));
    await act(async () => { reload(); });
    expect(C.heldChanges('case-d.write').map((h) => h.hold)).toEqual([r.hold]);
    expect(await a.m().settleHeld(row!)).toBe(false);
    expect(C.heldChanges('case-d.write').map((h) => h.hold)).toEqual([r.hold]);
    await act(async () => { as(first); });
    expect(C.heldChanges('case-d.write').map((h) => h.hold)).toEqual([r.hold]);
    let freed = false;
    await act(async () => { freed = await a.m().settleHeld(row!); await flush(); });
    expect(freed).toBe(true);
    expect(C.heldChanges('case-d.write')).toEqual([]);
  });
  it('the mount\'s own send: its no-argument dismiss frees it (the banner it showed)', async () => {
    const a = editor();
    await act(async () => { await a.m().mutateAsync({ file: 'A', text: 'x' }); await flush(); });
    let freed = false;
    await act(async () => { freed = await a.m().dismiss(); await flush(); });
    expect(freed).toBe(true);
    expect(C.heldChanges('case-d.write')).toEqual([]);
  });
});

// @core exports refreshFresh (a fetch's own success counts, never the cache), for pages that
// need a fresh read with its answers (Scripts, in place of a timestamp guard).
describe('refreshFresh from @core', () => {
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); });
  afterEach(() => { cleanup(); });
  it('is core\'s own: fresh with the answer a request sent now fetched; failed when that request fails', async () => {
    // Static imports: a dynamic import here could resolve another module graph (the two-runtime tests reset modules).
    expect(coreRefreshFresh).toBe(refreshFresh);
    const list = defineRoute<{ data: string[] }>({ method: 'GET', path: '/case-d/fresh', scope: 'agent' });
    const rows = defineQuery(list, { select: (r) => r.data });
    let n = 0;
    onFetch(() => (n++ === 2 ? { status: 502, body: {} } : { status: 200, body: { data: ['v' + n] } }));
    const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    function Probe() { rows.use(undefined); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await settle(); });
    const match = (k: readonly unknown[]): boolean => k.includes(list.id);
    const ok = await coreRefreshFresh(match);
    expect(ok.state).toBe('fresh');
    expect(ok.answers.map((a) => a.data)).toEqual([{ data: ['v2'] }]);
    expect((await coreRefreshFresh(match)).state).toBe('failed');
  });
});
