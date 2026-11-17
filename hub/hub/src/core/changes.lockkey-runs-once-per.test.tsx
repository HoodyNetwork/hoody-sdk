// The lockKey runs once per press and its value is what the
// press is hashed, admitted and shown under; admission whose reservation the registry replaced is stale; an older
// build's record filed under a digest of the full variables of a lockKey change is migrated on read and on write
// (removed, or quarantined while held: it bars its scope until its sender's warned Dismiss); a release reconciles
// its own re-adopted idle lock. Harness from changes.release-never-writes-another.test.tsx.
import { QueryClientProvider, type UseMutationResult } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from './api';
import * as C from './changes';
import { CHANGE_STORE_KEY, writeChanges, type StoredChange } from './change-store';
import { bump, capture, setIdentity, snapshot } from './ctx';
import { useLockedChange, type LockedChange } from './locked';
import { defineMutation, freeByVerdict, queryClient, varsDigest, type MutationHook } from './query';
import { defineRoute } from './routes';
import { coreSource, type SourceError, type SourceMutation, type SourceResult } from './source';
import { boot, calls, onFetch, R1, settle } from './test/env';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const spins = async (n = 20): Promise<void> => { for (let i = 0; i < n; i++) await settle(); };
type Rec = StoredChange & { t: number };
const raw = (): Rec[] => JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Rec[];
const rawStr = (): string => localStorage.getItem(CHANGE_STORE_KEY) ?? '';
const posts = (): number => calls.filter((c) => c.method !== 'GET').length;
const as = (id: string): void => { setIdentity({ id, banned: false }); bump('account'); };
const uid = (): string => String(snapshot().account);
const Q = '\u0000q~';
async function storeLockHeld(): Promise<() => void> {
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  void navigator.locks.request('hub_changes', () => gate);
  await settle();
  return open;
}
const META = { base: 'lock:f3i.raw', target: null, realm: R1, by: 'q:f3i@f3i.raw' };
const c2 = (): Rec[] => raw().filter((r) => r.id.endsWith('\u0000c2'));
async function pressOnce(idem = 'N'): Promise<{ outcome: string; code?: string; sent: number; keys: (string | undefined)[] }> {
  const keys: (string | undefined)[] = [];
  const res = await C.guarded('s', 'c2', async (k?: string) => { keys.push(k); return { outcome: 'pending' as const, idem }; }, META) as { outcome: string; code?: string };
  return { outcome: res.outcome, code: res.code, sent: keys.length, keys };
}

describe('the lockKey runs once per press; its value is hashed, admitted and shown', () => {
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: [] } } : { status: 502, body: {} })); });
  afterEach(() => { cleanup(); C.resetChanges(); });
  it('i1a query: a lockKey that would throw on a second evaluation never sends the held change again', async () => {
    const route = defineRoute({ method: 'POST', path: '/f3i/q', scope: 'agent', body: ['n'] });
    let n = 0, throwAt = -1;
    const m = defineMutation<{ n: number }>(route, { input: (v) => ({ body: { n: v.n } }), lock: 'f3i.q', lockKey: () => { n++; if (n === throwAt) throw new Error('flaky'); return { k: 'safe' }; }, page: 'programs' });
    expect((await m.run({ n: 1 })).outcome).toBe('pending');
    expect(n).toBe(1);
    n = 0; throwAt = 2;
    const r2 = await m.run({ n: 1 });
    expect(r2.outcome).toBe('not_sent');
    expect(n).toBe(1);
    expect(posts()).toBe(1);
    expect(raw().filter((r) => r.pending).length).toBe(1);
  });
  it('i1b query: a lockKey that throws on the press refuses it (INPUT_INVALID), and identity() falling back keeps the lockKey value', async () => {
    const route = defineRoute({ method: 'POST', path: '/f3i/q2', scope: 'agent', body: ['n'] });
    let bad = true;
    const m = defineMutation<{ n: number }>(route, { input: (v) => ({ body: { n: v.n } }), lock: 'f3i.q2', lockKey: (v) => { if (bad) throw new Error('page bug'); return { n: v.n }; }, identity: () => { throw new Error('shown bug'); }, page: 'programs' });
    expect(await m.run({ n: 1 })).toMatchObject({ outcome: 'not_sent', error: { code: 'INPUT_INVALID' } });
    expect(posts()).toBe(0);
    bad = false;
    expect((await m.run({ n: 1 })).outcome).toBe('pending');
    expect(raw()[0]!.meta!.identity).toEqual({ n: 1 });
  });
  it('i1e query hook: a lockKey that would throw on a second evaluation never sends the held change again', async () => {
    const route = defineRoute({ method: 'POST', path: '/f3i/qh', scope: 'agent', body: ['n'] });
    let n = 0, throwAt = -1;
    const m = defineMutation<{ n: number }>(route, { input: (v) => ({ body: { n: v.n } }), lock: 'f3i.qh', lockKey: () => { n++; if (n === throwAt) throw new Error('flaky'); return { k: 'safe' }; }, page: 'programs' });
    let hook!: MutationHook<{ n: number }, unknown>;
    function Probe() { hook = m.use(); return null; }
    render(<Probe />, { wrapper: wrap });
    let r!: { outcome: string };
    await act(async () => { r = await hook.run({ n: 1 }); await spins(); });
    expect(r.outcome).toBe('pending');
    n = 0; throwAt = 2;
    await act(async () => { r = await hook.run({ n: 1 }); await spins(); });
    expect(r.outcome).toBe('not_sent');
    expect(posts()).toBe(1);
  });
  it('i1c source: a lockKey that would throw on a second evaluation never sends the held change again', async () => {
    const put = defineRoute<unknown, { n: number }>({ method: 'POST', path: '/f3i/s', scope: 'agent', body: ['n'] });
    let n = 0, throwAt = -1;
    const table = { reads: {}, changes: { put: { route: put, lock: 'f3i.s', lockKey: (): unknown => { n++; if (n === throwAt) throw new Error('flaky'); return { k: 'safe' }; }, input: (v: { n: number }) => ({ body: v }) } } };
    const src = coreSource('f3i-src', table);
    let last!: UseMutationResult<SourceResult<unknown>, SourceError, { n: number }> & SourceMutation<unknown, { n: number }>;
    function Probe() { last = src.useMutation<unknown, { n: number }>('put') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    let r!: SourceResult<unknown>;
    await act(async () => { r = await last.mutateAsync({ n: 1 }); await spins(); });
    expect(r.outcome).toBe('pending');
    n = 0; throwAt = 2;
    await act(async () => { r = await last.mutateAsync({ n: 1 }); await spins(); });
    expect(r.outcome).toBe('not_sent');
    expect(posts()).toBe(1);
    expect(raw().filter((x) => x.pending).length).toBe(1);
  });
  it('i1d locked: one lockKey evaluation per press; a throwing identity() shows the lockKey value', async () => {
    const rename = defineRoute<unknown, { name: string }>({ method: 'PATCH', path: '/computers/:id', scope: 'realm', body: ['name'] });
    let n = 0;
    let last!: LockedChange<{ name: string }, unknown>;
    const send = (v: { name: string }) => api(rename, { params: { id: 'c1' }, body: { name: v.name }, ctx: capture() });
    function Probe() { last = useLockedChange(send, [], 'f3i.locked', { lock: 'f3i.locked', lockKey: (v: { name: string }) => { n++; return { k: v.name }; }, identity: () => { throw new Error('shown bug'); } }); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await last.run({ name: 'a' }); await spins(); });
    expect(n).toBe(1);
    expect(posts()).toBe(1);
    expect(raw()[0]!.meta!.identity).toEqual({ k: 'a' });
  });
});

describe('admission whose reservation the registry replaced is stale and touches nothing', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  it('an account round trip while admission waits, tab B\'s live send stored ahead: A sends nothing, B\'s record stays', async () => {
    const ME = uid();
    expect((await pressOnce('K0')).outcome).toBe('pending');
    expect(await C.release('s', 'c2', C.holdOfLock('s', 'c2')!)).toBe(true);
    await spins(3);
    const open = await storeLockHeld();
    const keys: (string | undefined)[] = [];
    const going = C.guarded('s', 'c2', async (k?: string) => { keys.push(k); return { outcome: 'pending' as const, idem: 'K-A' }; }, META, undefined, undefined, C.changeOwner());
    await settle();
    as('someone-else'); await spins(3); as(ME); await spins(3);
    const r1 = c2()[0]!;
    writeChanges([{ ...r1, inc: 'incB', nonce: 'nB', key: 'KB', pending: false, sending: { tab: 'tabB', at: Date.now() }, t: r1.t + 5 }]);
    open();
    expect(await going).toEqual({ outcome: 'stale' });
    expect(keys.length).toBe(0);
    expect(c2().map((r) => [r.inc, !!r.sending])).toEqual([['incB', true]]);
    C.reloadChangesForTests();
    expect(await pressOnce('N3')).toMatchObject({ outcome: 'not_sent', sent: 0 });
  });
});

describe('an older build\'s record under a digest of the full variables is migrated', () => {
  const SECRET = 'planted-secret-f3i-Lm7';
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: [] } } : { status: 502, body: {} })); });
  afterEach(() => { cleanup(); C.resetChanges(); });
  const route = defineRoute({ method: 'POST', path: '/f3i/leg', scope: 'agent', body: ['n', 'password'], idem: true });
  const m = defineMutation<{ n: number; password: string }>(route, { input: (v) => ({ body: v }), lock: 'f3i.leg', lockKey: (v) => ({ n: v.n }), proves: () => 'not_applied', page: 'programs' });
  /** What an older build stored for `vars` (no lockKey then): the full variables' digest as the id, no identity, no format marker. */
  async function legacy(o: { pending?: boolean; n?: number; inc?: string } = {}): Promise<{ digest: string; rec: Rec }> {
    const vars = { n: o.n ?? 1, password: SECRET };
    if (raw().length === 0) expect((await m.run({ n: 1, password: SECRET })).outcome).toBe('pending');
    const digest = await varsDigest(vars);
    const list = raw();
    const { fmt: _f, ...base } = list[0]!;
    const { identity: _i, ...meta } = base.meta!;
    void _i; void _f;
    const rec: Rec = { ...base, id: base.id.slice(0, base.id.lastIndexOf('\u0000') + 1) + digest, meta, pending: o.pending ?? true, ...(o.inc ? { inc: o.inc } : {}) };
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(o.n === undefined ? [rec] : [...list, rec]));
    return { digest, rec };
  }
  it('i3a: held, at load: an older change (no digest stored, no key or identity; a fresh random id and token, its state and time kept); it bars every press of its scope; no read proves it', async () => {
    const { digest, rec } = await legacy();
    expect(rawStr()).toContain(digest);
    C.reloadChangesForTests();
    await spins();
    expect(rawStr()).not.toContain(digest);
    expect(rawStr()).not.toContain(SECRET);
    const back = raw();
    expect(back.map((x) => [x.id.includes(Q), x.id.includes(rec.inc!), x.pending, x.key, !!x.inc && x.inc !== rec.inc, !!x.nonce && x.nonce !== rec.nonce, x.t, x.meta?.by, 'identity' in x.meta!, x.keyBytes, x.fmt])).toEqual([[true, false, true, null, true, true, rec.t, rec.meta!.by, false, undefined, 1]]);
    const before = posts();
    expect((await m.run({ n: 1, password: SECRET })).outcome).toBe('not_sent');
    expect((await m.run({ n: 2, password: SECRET })).outcome).toBe('not_sent');
    expect(posts()).toBe(before);
    const [c] = C.pendingOf('lock:f3i.leg');
    expect(C.quarantinedDigest(c!.digest)).toBe(true);
    expect(await freeByVerdict(c!.scope, c!.digest, C.holdOfLock(c!.scope, c!.digest), Infinity, 'not_applied')).toBe(false);
    expect(await freeByVerdict(c!.scope, c!.digest, C.holdOfLock(c!.scope, c!.digest), Infinity, null)).toBe(false);
    expect(raw().length).toBe(1);
  });
  it('i3b: its sender\'s warned Dismiss frees it (the record goes, no key kept); then the change sends again', async () => {
    await legacy();
    C.reloadChangesForTests();
    await spins();
    let hook!: MutationHook<{ n: number; password: string }, unknown>;
    function Probe() { hook = m.use(); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await spins(); });
    const rows = hook.held();
    expect(rows.length).toBe(1);
    let ok = false;
    await act(async () => { ok = await hook.dismissHeld(rows[0]!); await spins(); });
    expect(ok).toBe(true);
    expect(raw()).toEqual([]);
    const before = posts();
    expect((await m.run({ n: 1, password: SECRET })).outcome).toBe('pending');
    expect(posts()).toBe(before + 1);
  });
  it('i3c: released (key kept), at load: removed', async () => {
    const { digest } = await legacy({ pending: false });
    C.reloadChangesForTests();
    await spins();
    expect(rawStr()).not.toContain(digest);
    expect(raw()).toEqual([]);
  });
  it('i3d: written by another tab after load (no storage event): the next press of the scope migrates it and is refused unsent', async () => {
    const { digest } = await legacy({ n: 2, inc: 'incOld' });
    const before = posts();
    expect((await m.run({ n: 3, password: SECRET })).outcome).toBe('not_sent');
    expect(posts()).toBe(before);
    expect(rawStr()).not.toContain(digest);
    expect(raw().some((x) => x.id.includes(Q) && !x.id.includes('incOld') && x.pending)).toBe(true);
  });
  it('i3f: an older record under a base no definition names converts at load too (every older record does)', async () => {
    const { digest } = await legacy();
    const list = raw().map((x) => ({ ...x, meta: { ...x.meta!, base: 'lock:f3i.late' }, id: x.id.replace('lock:f3i.leg', 'lock:f3i.late') }));
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list));
    C.reloadChangesForTests();
    await spins();
    expect(rawStr()).not.toContain(digest);
    expect(raw().filter((x) => x.id.includes(Q)).length).toBe(1);
  });
  it('i3g (control): this build\'s own record (format marker) keeps its id through a reload, whatever definitions share its base', async () => {
    const r3 = defineRoute({ method: 'POST', path: '/f3i/mixed', scope: 'agent', body: ['n'] });
    const plain = defineMutation<{ n: number }>(r3, { input: (v) => ({ body: v }), lock: 'f3i.mixed', page: 'programs' });
    defineMutation<{ n: number }>(r3, { input: (v) => ({ body: v }), lock: 'f3i.mixed', lockKey: (v) => ({ n: v.n }), name: 'keyed', page: 'programs' });
    expect((await plain.run({ n: 1 })).outcome).toBe('pending');
    const id = raw()[0]!.id;
    C.reloadChangesForTests();
    await spins();
    expect(raw().map((x) => x.id)).toEqual([id]);
  });
  it('i3e (control): a lockKey whose value is empty stores identity null; its own record (format marker) is never converted', async () => {
    const r2 = defineRoute({ method: 'POST', path: '/f3i/empty', scope: 'agent', body: ['n'] });
    const e = defineMutation<{ n: number }>(r2, { input: (v) => ({ body: v }), lock: 'f3i.empty', lockKey: () => undefined, page: 'programs' });
    expect((await e.run({ n: 1 })).outcome).toBe('pending');
    const id = raw()[0]!.id;
    expect(raw()[0]!.meta!.identity).toBeNull();
    C.reloadChangesForTests();
    await spins();
    expect(raw().map((x) => x.id)).toEqual([id]);
  });
});

describe('a queued release reconciles its own re-adopted idle lock', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  // The release waits for its store-lock turn, and the account round trip meanwhile moves the context, so it
  // frees nothing (false); the re-adopted record stays pending until a release at rest, which keeps the key.
  it('i4: release queued, then X->Y->X re-adopts the pending record: the release frees nothing; one at rest replays the kept key', async () => {
    const ME = uid();
    expect((await pressOnce('K1')).outcome).toBe('pending');
    const hold = C.holdOfLock('s', 'c2')!;
    const open = await storeLockHeld();
    const going = C.release('s', 'c2', hold);
    as('someone-else'); await spins(3); as(ME); await spins(3);
    expect(C.isPending('s', 'c2')).toBe(true);
    open();
    expect(await going).toBe(false);
    await spins();
    expect(c2()[0]!.pending).toBe(true);
    expect(C.isPending('s', 'c2')).toBe(true);
    expect(await pressOnce('N')).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST', sent: 0 });
    expect(await C.release('s', 'c2', C.holdOfLock('s', 'c2')!)).toBe(true);
    expect(c2()[0]!.pending).toBe(false);
    expect(await pressOnce('N')).toMatchObject({ outcome: 'pending', sent: 1, keys: ['K1'] });
  });
});
