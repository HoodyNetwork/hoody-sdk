// An older build's record is told by a durable format marker
// (on the record), never by which declarations loaded, and a plain sender sharing the base exempts nothing; a quarantined
// hold is freed only by its sender's warned Dismiss (release without dismiss, complete, discard and every proof
// refuse it); a quarantine freed in another tab leaves memory at the next admission; an invalid press is refused
// before admission (no digest of its variables taken); a send's finally never writes another send's record through a
// lock a storage event re-adopted meanwhile. Harness from changes.lockkey-runs-once-per.test.tsx.
import { QueryClientProvider, type UseMutationResult } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import * as C from './changes';
import { CHANGE_STORE_KEY, SENDING_STALE_MS, writeChanges, type StoredChange } from './change-store';
import { capture } from './ctx';
import { useLockedChange, type LockedChange } from './locked';
import { defineMutation, freeByVerdict, queryClient, varsDigest, type MutationHook } from './query';
import { defineRoute } from './routes';
import { coreSource, type SourceError, type SourceMutation, type SourceResult } from './source';
import { boot, calls, onFetch, R1, settle, microFlush } from './test/env';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const spins = async (n = 20): Promise<void> => { for (let i = 0; i < n; i++) await settle(); };
type Rec = StoredChange & { t: number };
const raw = (): Rec[] => JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Rec[];
const rawStr = (): string => localStorage.getItem(CHANGE_STORE_KEY) ?? '';
const posts = (): number => calls.filter((c) => c.method !== 'GET').length;
const Q = '\u0000q~';
const SECRET = 'planted-secret-f3j-Wx4';
type V = { n: number; password: string };
/** An older build's record of the record now first in the store: the id under `digest`, no identity, no format. */
function olderOf(digest: string, o: { pending?: boolean; sending?: { tab: string; at: number } } = {}): Rec {
  const { fmt: _f, ...base } = raw()[0]!;
  const { identity: _i, ...meta } = base.meta!;
  void _i; void _f;
  return { ...base, id: base.id.slice(0, base.id.lastIndexOf('\u0000') + 1) + digest, meta, pending: o.pending ?? true, ...(o.sending ? { sending: o.sending } : {}) };
}

describe('older records, quarantined holds and lockKey presses', () => {
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: [] } } : { status: 502, body: {} })); });
  afterEach(() => { cleanup(); C.resetChanges(); });

  // One keyed sender, and a plain sender sharing its lock base.
  function keyedOn(lock: string, plain = false) {
    const route = defineRoute({ method: 'POST', path: '/f3j/' + lock, scope: 'agent', body: ['n', 'password'], idem: true });
    const m = defineMutation<V>(route, { input: (v) => ({ body: v }), lock, lockKey: (v) => ({ n: v.n }), proves: () => 'applied', page: 'programs' });
    if (plain) {
      const r2 = defineRoute({ method: 'POST', path: '/f3j/' + lock + '/plain', scope: 'agent', body: ['n'], idem: true });
      defineMutation<V>(r2, { input: (v) => ({ body: { n: v.n } }), lock, page: 'programs' });
    }
    async function legacy(o: { pending?: boolean; sending?: { tab: string; at: number } } = {}): Promise<string> {
      const vars = { n: 1, password: SECRET };
      expect((await m.run(vars)).outcome).toBe('pending');
      const digest = await varsDigest(vars);
      localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([olderOf(digest, o)]));
      return digest;
    }
    return { m, legacy };
  }
  async function quarantined(lock: string): Promise<{ m: ReturnType<typeof keyedOn>['m']; digest: string }> {
    const { m, legacy } = keyedOn(lock);
    const digest = await legacy();
    C.reloadChangesForTests();
    await spins();
    expect(raw().filter((x) => x.id.includes(Q)).length).toBe(1);
    return { m, digest };
  }

  it('a plain sender sharing the base exempts nothing: the keyed sender\'s older record is quarantined, and its press sends nothing', async () => {
    const { m, legacy } = keyedOn('f3j.mixed', true);
    const digest = await legacy();
    C.reloadChangesForTests();
    await spins();
    expect(rawStr()).not.toContain(digest);
    expect(raw().filter((x) => x.id.includes(Q) && x.pending).length).toBe(1);
    const before = posts();
    expect((await m.run({ n: 1, password: SECRET })).outcome).toBe('not_sent');
    expect(posts()).toBe(before);
  });
  it('an unheld older record under a base shared with a plain sender is removed', async () => {
    const { legacy } = keyedOn('f3j.mixed2', true);
    const digest = await legacy({ pending: false });
    C.reloadChangesForTests();
    await spins();
    expect(rawStr()).not.toContain(digest);
    expect(raw()).toEqual([]);
  });

  it('the query hook\'s settleHeld frees no quarantined hold; its dismissHeld does', async () => {
    const { m } = await quarantined('f3j.settle');
    let hook!: MutationHook<V, unknown>;
    function Probe() { hook = m.use(); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await spins(); });
    const rows = hook.held();
    expect(rows.length).toBe(1);
    let ok = true;
    await act(async () => { ok = await hook.settleHeld(rows[0]!); await spins(); });
    expect(ok).toBe(false);
    expect(raw().filter((x) => x.id.includes(Q)).length).toBe(1);
    const before = posts();
    expect((await m.run({ n: 1, password: SECRET })).outcome).toBe('not_sent');
    expect(posts()).toBe(before);
    await act(async () => { ok = await hook.dismissHeld(rows[0]!); await spins(); });
    expect(ok).toBe(true);
    expect(raw()).toEqual([]);
  });
  it('core release without dismiss, complete and discard refuse a quarantined hold; release with dismiss frees it', async () => {
    await quarantined('f3j.core');
    const [c] = C.pendingOf('lock:f3j.core');
    const hold = C.holdOfLock(c!.scope, c!.digest)!;
    expect(await C.release(c!.scope, c!.digest, hold)).toBe(false);
    expect(await C.complete(c!.scope, c!.digest, hold)).toBe(false);
    expect(await C.discard(c!.scope, c!.digest, hold)).toBe(false);
    await spins();
    expect(raw().filter((x) => x.id.includes(Q)).length).toBe(1);
    expect(await C.release(c!.scope, c!.digest, hold,{ warned: true })).toBe(true);
    await spins();
    expect(raw()).toEqual([]);
  });
  it('a source\'s settleHeld frees no quarantined hold; its dismissHeld does', async () => {
    const put = defineRoute<unknown, V>({ method: 'POST', path: '/f3j/src', scope: 'agent', body: ['n', 'password'], idem: true });
    const src = coreSource('f3j-src', { reads: {}, changes: { put: { route: put, lock: 'f3j.src', lockKey: (v: V): unknown => ({ n: v.n }), input: (v: V) => ({ body: v }) } } });
    let last!: UseMutationResult<SourceResult<unknown>, SourceError, V> & SourceMutation<unknown, V>;
    function Probe() { last = src.useMutation<unknown, V>('put') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    const vars = { n: 1, password: SECRET };
    await act(async () => { await last.mutateAsync(vars); await spins(); });
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([olderOf(await varsDigest(vars))]));
    C.reloadChangesForTests();
    await act(async () => { await spins(); });
    const rows = last.held();
    expect(rows.length).toBe(1);
    expect(await last.settleHeld(rows[0]!)).toBe(false);
    await act(async () => { await spins(); });
    expect(raw().filter((x) => x.id.includes(Q)).length).toBe(1);
    expect(await last.dismissHeld(rows[0]!)).toBe(true);
    await act(async () => { await spins(); });
    expect(raw()).toEqual([]);
  });
  it('a locked change\'s Dismiss frees its quarantined hold', async () => {
    const rename = defineRoute<unknown, { name: string; password: string }>({ method: 'PATCH', path: '/computers/:id', scope: 'realm', body: ['name', 'password'] });
    let last!: LockedChange<{ name: string; password: string }, unknown>;
    const send = (v: { name: string; password: string }) => api(rename, { params: { id: 'c1' }, body: v, ctx: capture() });
    function Probe() { last = useLockedChange(send, [], 'f3j.locked', { lock: 'f3j.locked', lockKey: (v: { name: string }) => ({ k: v.name }) }); return null; }
    render(<Probe />, { wrapper: wrap });
    const vars = { name: 'a', password: SECRET };
    await act(async () => { await last.run(vars); await spins(); });
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([olderOf(await varsDigest(vars))]));
    C.reloadChangesForTests();
    await act(async () => { await spins(); });
    expect(raw().filter((x) => x.id.includes(Q) && x.pending).length).toBe(1);
    await act(async () => { last.dismiss(); await spins(); });
    expect(raw()).toEqual([]);
  });

  it('a record this build admitted with no identity, under a lockKey base, is never taken for an older one', async () => {
    const route = defineRoute({ method: 'POST', path: '/f3j/cur', scope: 'agent', body: ['n', 'password'], idem: true });
    defineMutation<V>(route, { input: (v) => ({ body: v }), lock: 'f3j.cur', lockKey: (v) => ({ n: v.n }), page: 'programs' });
    const META = { base: 'lock:f3j.cur', target: null, realm: R1, by: 'q:plain@f3j.cur' };
    expect((await C.guarded('s', 'c2', async () => ({ outcome: 'pending' as const, idem: 'K' }), META) as { outcome: string }).outcome).toBe('pending');
    const id = raw()[0]!.id;
    expect('identity' in raw()[0]!.meta!).toBe(false);
    C.reloadChangesForTests();
    await spins();
    expect(raw().map((x) => x.id)).toEqual([id]);
  });

  it('a quarantine freed in another tab (no storage event) refuses no press: admission drops it from memory', async () => {
    const { m } = await quarantined('f3j.gone');
    expect(C.pendingOf('lock:f3j.gone').length).toBe(1);
    localStorage.setItem(CHANGE_STORE_KEY, '[]');
    const before = posts();
    expect((await m.run({ n: 2, password: SECRET })).outcome).toBe('pending');
    expect(posts()).toBe(before + 1);
    expect(C.pendingOf('lock:f3j.gone').filter((c) => C.quarantinedDigest(c.digest))).toEqual([]);
  });

  it('j5a: an older record another tab is sending (a live stamp) stays until that send ends, refusing the press BUSY; stale, it becomes an older change', async () => {
    const { m, legacy } = keyedOn('f3j.stamp');
    const digest = await legacy({ pending: false, sending: { tab: 'otherTab', at: Date.now() } });
    C.reloadChangesForTests();
    await spins();
    // That tab's heartbeat and answer still find its record.
    expect(rawStr()).toContain(digest);
    expect(C.pendingOf('lock:f3j.stamp')).toEqual([]);
    const before = posts();
    expect(await m.run({ n: 2, password: SECRET })).toMatchObject({ outcome: 'not_sent', error: { code: 'BUSY' } });
    expect(posts()).toBe(before);
    // Its tab died mid-send (the stamp went stale): outcome unknown, an older change.
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(raw().map((x) => (x.sending ? { ...x, sending: { tab: 'otherTab', at: Date.now() - SENDING_STALE_MS - 1 } } : x))));
    C.reloadChangesForTests();
    await spins();
    expect(rawStr()).not.toContain(digest);
    expect(raw().map((x) => [x.id.includes(Q), x.pending, x.key, !!x.sending])).toEqual([[true, true, null, false]]);
    expect((await m.run({ n: 2, password: SECRET })).outcome).toBe('not_sent');
    expect(posts()).toBe(before);
  });
  it('a source evaluates the lockKey once on its first press and stores that value as the identity', async () => {
    const put = defineRoute<unknown, { n: number }>({ method: 'POST', path: '/f3j/once', scope: 'agent', body: ['n'] });
    let n = 0;
    const src = coreSource('f3j-once', { reads: {}, changes: { put: { route: put, lock: 'f3j.once', lockKey: (): unknown => { n++; return { k: 'safe' }; }, input: (v: { n: number }) => ({ body: v }) } } });
    let last!: UseMutationResult<SourceResult<unknown>, SourceError, { n: number }> & SourceMutation<unknown, { n: number }>;
    function Probe() { last = src.useMutation<unknown, { n: number }>('put') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    let r!: SourceResult<unknown>;
    await act(async () => { r = await last.mutateAsync({ n: 1 }); await spins(); });
    expect(r.outcome).toBe('pending');
    expect(n).toBe(1);
    expect(raw()[0]!.meta!.identity).toEqual({ k: 'safe' });
  });
  it('an applied verdict frees no quarantined hold', async () => {
    await quarantined('f3j.applied');
    const [c] = C.pendingOf('lock:f3j.applied');
    expect(await freeByVerdict(c!.scope, c!.digest, C.holdOfLock(c!.scope, c!.digest), Infinity, 'applied')).toBe(false);
    await spins();
    expect(raw().filter((x) => x.id.includes(Q)).length).toBe(1);
  });
  it('locked without identity(): one lockKey evaluation per press, its value stored; after a Dismiss the next press evaluates it once and sends (a second evaluation would throw)', async () => {
    const rename = defineRoute<unknown, { name: string }>({ method: 'PATCH', path: '/computers/:id', scope: 'realm', body: ['name'] });
    let n = 0, throwAt = -1;
    let last!: LockedChange<{ name: string }, unknown>;
    const send = (v: { name: string }) => api(rename, { params: { id: 'c1' }, body: { name: v.name }, ctx: capture() });
    function Probe() { last = useLockedChange(send, [], 'f3j.locked2', { lock: 'f3j.locked2', lockKey: (v: { name: string }) => { n++; if (n === throwAt) throw new Error('flaky'); return { k: v.name }; } }); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await last.run({ name: 'a' }); await spins(); });
    expect(n).toBe(1);
    expect(posts()).toBe(1);
    expect(raw()[0]!.meta!.identity).toEqual({ k: 'a' });
    // The first press is dismissed, so the second reaches admission and builds its metadata.
    await act(async () => { last.dismiss(); await microFlush(); });
    expect(last.state).toBe('free');
    n = 0; throwAt = 2;
    let r!: { outcome: string };
    await act(async () => { r = await last.run({ name: 'a' }); await spins(); });
    expect(r.outcome).toBe('pending');
    expect(n).toBe(1);
    expect(posts()).toBe(2);
  });

  it('a press whose lockKey throws is INPUT_INVALID before admission, even while a quarantine bars its scope (run and hook)', async () => {
    const route = defineRoute({ method: 'POST', path: '/f3j/inv', scope: 'agent', body: ['n', 'password'], idem: true });
    let bad = false;
    const m = defineMutation<V>(route, { input: (v) => ({ body: v }), lock: 'f3j.inv', lockKey: (v) => { if (bad) throw new Error('page bug'); return { n: v.n }; }, page: 'programs' });
    const vars = { n: 1, password: SECRET };
    expect((await m.run(vars)).outcome).toBe('pending');
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([olderOf(await varsDigest(vars))]));
    C.reloadChangesForTests();
    await spins();
    const before = rawStr();
    bad = true;
    expect(await m.run({ n: 2, password: SECRET })).toMatchObject({ outcome: 'not_sent', error: { code: 'INPUT_INVALID' } });
    let hook!: MutationHook<V, unknown>;
    function Probe() { hook = m.use(); return null; }
    render(<Probe />, { wrapper: wrap });
    let r: unknown;
    await act(async () => { r = await hook.run({ n: 2, password: SECRET }); await spins(); });
    expect(r).toMatchObject({ outcome: 'not_sent', error: { code: 'INPUT_INVALID' } });
    expect(rawStr()).toBe(before);
  });
});

describe('older records, quarantined holds and lockKey presses', () => {
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: [] } } : { status: 502, body: {} })); });
  afterEach(() => { cleanup(); C.resetChanges(); vi.restoreAllMocks(); });
  const META = { base: 'lock:f3j.raw', target: null, realm: R1, by: 'q:f3j@f3j.raw' };
  const c2 = (): Rec[] => raw().filter((r) => r.id.endsWith('\u0000c2'));
  const announce = (): void => { window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY })); };
  async function storeLockHeld(): Promise<() => void> {
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    void navigator.locks.request('hub_changes', () => gate);
    await settle();
    return open;
  }
  for (const key of ['KB', null] as const) {
    it(`j7 (key ${key === null ? 'none' : 'kept'}): a send's answer queued behind the store lock never writes tab B's live send adopted meanwhile; a third press sends nothing`, async () => {
      let answer!: (v: { outcome: 'pending'; idem: string }) => void;
      const going = C.guarded('s', 'c2', () => new Promise<{ outcome: 'pending'; idem: string }>((r) => { answer = r; }), META);
      await settle();
      const r1 = c2()[0]!;
      const open = await storeLockHeld();
      answer({ outcome: 'pending', idem: 'K1' });
      await going;
      const b: Rec = { ...r1, inc: 'incB', nonce: 'nB', key, pending: false, sending: { tab: 'tabB', at: Date.now() }, t: r1.t + 5 };
      writeChanges([b]);
      announce();
      open();
      await spins();
      // B's record exactly as B wrote it: key, stamp, version and all.
      expect(c2()).toEqual([b]);
      C.reloadChangesForTests();
      let sent = 0;
      const third = await C.guarded('s', 'c2', async () => { sent++; return { outcome: 'pending' as const, idem: 'K3' }; }, META) as { outcome: string };
      expect(third.outcome).toBe('not_sent');
      expect(sent).toBe(0);
    });
  }
  it('a press whose lockKey throws takes no digest of its variables (query run, source)', async () => {
    const seen: string[] = [];
    const subtle = globalThis.crypto.subtle;
    const orig = subtle.digest.bind(subtle);
    vi.spyOn(subtle, 'digest').mockImplementation(((alg: AlgorithmIdentifier, data: BufferSource) => { seen.push(new TextDecoder().decode(data as ArrayBuffer)); return orig(alg, data); }) as typeof subtle.digest);
    const route = defineRoute({ method: 'POST', path: '/f3j/dig', scope: 'agent', body: ['n', 'password'], idem: true });
    const m = defineMutation<V>(route, { input: (v) => ({ body: v }), lock: 'f3j.dig', lockKey: () => { throw new Error('page bug'); }, page: 'programs' });
    expect(await m.run({ n: 1, password: SECRET })).toMatchObject({ outcome: 'not_sent', error: { code: 'INPUT_INVALID' } });
    const put = defineRoute<unknown, V>({ method: 'POST', path: '/f3j/dig2', scope: 'agent', body: ['n', 'password'], idem: true });
    const src = coreSource('f3j-dig', { reads: {}, changes: { put: { route: put, lock: 'f3j.dig2', lockKey: (): unknown => { throw new Error('page bug'); }, input: (v: V) => ({ body: v }) } } });
    let last!: UseMutationResult<SourceResult<unknown>, SourceError, V> & SourceMutation<unknown, V>;
    function Probe() { last = src.useMutation<unknown, V>('put') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    let r!: SourceResult<unknown>;
    await act(async () => { r = await last.mutateAsync({ n: 2, password: SECRET }); await spins(); });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'INPUT_INVALID' });
    expect(seen.filter((x) => x.includes(SECRET))).toEqual([]);
    expect(posts()).toBe(0);
  });
});
