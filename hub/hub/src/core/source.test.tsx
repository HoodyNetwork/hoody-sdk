// source.test.tsx: coreSource, the live page data source with fixtureSource's surface.
import { QueryClientProvider, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { bootFixtureCore } from './fixture-boot';
import { bump, setRealm, setTarget, snapshot } from './ctx';
import { defineMutation, queryClient } from './query';
import { defineRoute } from './routes';
import { coreSource, type FallbackSource, type SourceError, type SourceResult } from './source';
import { heldChanges } from './changes';
import { setupLocks } from './setup';
import { useLockedChange, type LockedChange, type LockedResult } from './locked';
import { api } from './api';
import { aliasLock, aliasRoutes } from './aliases';
import { boot, calls, onFetch, R1, R2, settle } from './test/env';

const list = defineRoute<{ data?: { computers?: { id: string; name: string }[] } }>({ method: 'GET', path: '/computers', scope: 'realm', query: ['limit'] });
const rename = defineRoute<unknown, { name: string }>({ method: 'PATCH', path: '/computers/:id', scope: 'realm', body: ['name'] });
// A read-back that proves the change did not apply: frees it with its key kept (a plain read frees nothing).
const notApplied = () => 'not_applied' as const;
const table = {
  reads: {
    computers: { route: list, input: (p: { limit: number }) => ({ query: { limit: p.limit } }), select: (r: unknown) => ((r as { data: { computers: { name: string }[] } }).data.computers).map((c) => c.name) },
  },
  changes: {
    rename: { route: rename, input: (v: { id: string; name: string }) => ({ params: { id: v.id }, body: { name: v.name } }), reads: ['computers'], proves: notApplied },
  },
};
const snapshotTarget = () => snapshot().target;
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }

function harness<T>(use: () => T): { current: () => T } {
  let last!: T;
  function Probe() { last = use(); return null; }
  render(<Probe />, { wrapper: wrap });
  return { current: () => last };
}

describe('coreSource on a live page', () => {
  it('reads through the declared route and selects the page shape', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch(() => ({ status: 200, body: { data: { computers: [{ id: 'c1', name: 'atlas' }] } } }));
    const src = coreSource('computers', table);
    const h = harness(() => src.useQuery<string[], { limit: number }>('computers', { limit: 50 }));
    await act(flush);
    expect(h.current().data).toEqual(['atlas']);
    expect(calls[0]!.url).toContain('/computers?limit=50');
  });
  it('a key the table does not name fails with not_wired: never fixture data on a live page', async () => {
    boot();
    queryClient.clear();
    const src = coreSource('computers', table, { useQuery: () => { throw new Error('fallback used'); }, useMutation: () => { throw new Error('fallback used'); } } as unknown as FallbackSource);
    const h = harness(() => src.useQuery<unknown>('servers'));
    await act(flush);
    expect((h.current().error as SourceError | null)?.kind).toBe('not_wired');
    expect(calls).toHaveLength(0);
  });
  it('errors carry kind, code and status', async () => {
    boot();
    queryClient.clear();
    onFetch(() => ({ status: 404, body: { error: 'NOT_FOUND' } }));
    const src = coreSource('computers', table);
    const h = harness(() => src.useQuery<string[], { limit: number }>('computers', { limit: 1 }));
    await act(flush);
    expect(h.current().error).toMatchObject({ kind: 'not_found', code: 'NOT_FOUND', status: 404 });
  });
  it('a done change re-reads its reads; outcome and data come back', async () => {
    boot();
    queryClient.clear();
    let names = ['atlas'];
    onFetch((c) => (c.method === 'PATCH' ? (names = [c.body.name], { status: 200, body: { ok: 1 } }) : { status: 200, body: { data: { computers: names.map((n) => ({ id: 'c1', name: n })) } } }));
    const src = coreSource('computers', table);
    let q!: UseQueryResult<string[], SourceError>, m!: UseMutationResult<SourceResult<unknown>, SourceError, { id: string; name: string }>;
    harness(() => { q = src.useQuery<string[], { limit: number }>('computers', { limit: 5 }); m = src.useMutation<unknown, { id: string; name: string }>('rename'); return null; });
    await act(flush);
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ id: 'c1', name: 'borealis' }); await flush(); });
    expect(r).toEqual({ outcome: 'done', data: { ok: 1 } });
    expect(q.data).toEqual(['borealis']);
    expect(calls.find((c) => c.method === 'PATCH')!.url).toContain('/computers/c1');
  });
  it('settles: a 2xx whose body does not show the change ran is pending (held, read back, never sent again); a throw too', async () => {
    boot();
    queryClient.clear();
    const make = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/issues', scope: 'realm', body: ['name'] });
    const issues = defineRoute({ method: 'GET', path: '/issues', scope: 'realm' });
    let answer: unknown = { ran: false };
    onFetch((c) => (c.method === 'POST' ? { status: 200, body: answer } : { status: 200, body: [] }));
    const tS = { reads: { issues: { route: issues } }, changes: {
      make: { route: make, input: (v: { name: string }) => ({ body: v }), reads: ['issues'], select: () => 'chosen', settles: (raw: unknown) => { if ((raw as { ran?: unknown }).ran === 'boom') throw new Error('x'); return (raw as { ran?: unknown }).ran === true; } },
    } };
    const src = coreSource('computersS', tS);
    let m!: ReturnType<typeof src.useMutation<unknown, { name: string }>>;
    harness(() => { m = src.useMutation<unknown, { name: string }>('make'); src.useQuery('issues'); return null; });
    await act(flush);
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
    expect(r.outcome).toBe('pending');
    expect(m.pending).toBe(true);
    await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    answer = { ran: 'boom' };
    await act(async () => { r = await m.mutateAsync({ name: 'b' }); await flush(); });
    expect(r.outcome).toBe('pending');
    answer = { ran: true };
    await act(async () => { r = await m.mutateAsync({ name: 'c' }); await flush(); });
    expect(r).toEqual({ outcome: 'done', data: 'chosen' });
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(3);
  });
  it('settles: a rejected 2xx is a lost answer in full (false and throw alike): read back at once, its key kept and held across a remount, refused, freed only by a proving read-back', async () => {
    for (const mode of ['false', 'throw'] as const) {
      boot({ realm: R1 });
      queryClient.clear();
      const change = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['name'], idem: true });
      const sessions = defineRoute({ method: 'GET', path: '/sessions', scope: 'agent' });
      let made = false;
      onFetch((c) => (c.method === 'POST' ? { status: 200, body: { ran: false } } : { status: 200, body: { data: made ? [{ name: 'a' }] : [] } }));
      const lock = 'test.settles.' + mode;
      const tS = { reads: { sessions: { route: sessions } }, changes: { mk: {
        route: change, input: (v: { name: string }) => ({ body: v }), reads: ['sessions'], lock, lockKey: (v: { name: string }) => ({ name: v.name }), select: () => 'chosen',
        settles: (raw: unknown) => { if (mode === 'throw') throw new Error('x'); return (raw as { ran?: unknown }).ran === true; },
        proves: (_i: unknown, answers: readonly (readonly unknown[])[]) => ((answers[0] ?? []).some((x) => ((x as { data?: unknown[] }).data ?? []).length > 0) ? 'applied' as const : undefined),
      } } };
      const src = coreSource('computersS2' + mode, tS);
      let m!: ReturnType<typeof src.useMutation<unknown, { name: string }>>;
      function Probe() { m = src.useMutation<unknown, { name: string }>('mk'); src.useQuery('sessions'); return null; }
      const first = render(<Probe />, { wrapper: wrap });
      await act(flush);
      const getsBefore = calls.filter((c) => c.method === 'GET').length;
      let r!: SourceResult<unknown>;
      await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
      // Pending, like a lost answer: no selected data, no code or status (none came), its key kept.
      expect(r.outcome).toBe('pending');
      expect(r.data).toBeUndefined();
      expect(r.code).toBeUndefined();
      expect(r.status).toBeUndefined();
      expect(typeof r.idem).toBe('string');
      const key = (h: Record<string, string>) => Object.entries(h).find(([k]) => k.includes('idempotency'))?.[1];
      const posts = () => calls.filter((c) => c.method === 'POST');
      expect(key(posts()[0]!.headers)).toBe(r.idem);
      expect(heldChanges(lock).map((h) => h.key)).toEqual([r.idem]);
      // Read back at once (a GET after the send), and a read that proves nothing keeps it.
      expect(calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(getsBefore);
      expect(m.pending).toBe(true);
      // A remount keeps it held, with the same key; the same press is refused and nothing is sent.
      first.unmount();
      render(<Probe />, { wrapper: wrap });
      await act(flush);
      expect(m.pending).toBe(true);
      expect(heldChanges(lock).map((h) => h.key)).toEqual([r.idem]);
      let r2!: SourceResult<unknown>;
      await act(async () => { r2 = await m.mutateAsync({ name: 'a' }); await flush(); });
      expect(r2).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
      expect(posts()).toHaveLength(1);
      // A read-back that proves it frees it.
      made = true;
      let ok = false;
      await act(async () => { ok = await m.readBack(); await flush(); });
      expect(ok).toBe(true);
      expect(m.pending).toBe(false);
      expect(heldChanges(lock)).toEqual([]);
      expect(posts()).toHaveLength(1);
      cleanup();
    }
  });
  it('a pending change reads back at once and is not sent again before that read finished', async () => {
    boot();
    queryClient.clear();
    let release!: () => void;
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : new Promise((res) => { release = () => res({ status: 200, body: { data: { computers: [] } } }); })));
    const src = coreSource('computers', table);
    let m!: UseMutationResult<SourceResult<unknown>, SourceError, { id: string; name: string }>;
    harness(() => { m = src.useMutation<unknown, { id: string; name: string }>('rename'); src.useQuery('computers', { limit: 5 }); return null; });
    await act(flush);
    release();
    await act(flush);
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ id: 'c1', name: 'x' }); });
    expect(r.outcome).toBe('pending');
    await act(async () => { r = await m.mutateAsync({ id: 'c1', name: 'x' }); });
    expect(r).toEqual({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    release();
    await act(flush);
    await act(async () => { r = await m.mutateAsync({ id: 'c1', name: 'x' }); });
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(2);
  });
  it('a failed read-back keeps the change refused; the retry after a good one reuses the key', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    let readFails = false;
    const create = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['name'], idem: true });
    const sessions = defineRoute({ method: 'GET', path: '/sessions', scope: 'agent' });
    const t2 = { reads: { sessions: { route: sessions } }, changes: { create: { route: create, input: (v: { name: string }) => ({ body: v }), reads: ['sessions'], proves: notApplied } } };
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : readFails ? { status: 503, body: {} } : { status: 200, body: { data: [] } }));
    const src = coreSource('computers2', t2);
    let m!: UseMutationResult<SourceResult<unknown>, SourceError, { name: string }>;
    harness(() => { m = src.useMutation<unknown, { name: string }>('create'); src.useQuery('sessions'); return null; });
    await act(flush);
    readFails = true;
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
    expect(r).toEqual({ outcome: 'pending', idem: expect.any(String), hold: expect.any(String), route: 'POST /sessions' });
    await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
    expect(r).toEqual({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    readFails = false;
    await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
    expect(r.code).toBe('READ_BACK_FIRST');
    await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(2);
    const key = (h: Record<string, string>) => Object.entries(h).find(([k]) => k.includes('idempotency'))?.[1];
    expect(key(posts[0]!.headers)).toBeTruthy();
    expect(key(posts[1]!.headers)).toBe(key(posts[0]!.headers));
  });
  it('a replay that fails keeps the original key; a disabled read does not wedge the read-back', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    let n = 0;
    const create = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['name'], idem: true });
    const sessions = defineRoute({ method: 'GET', path: '/sessions', scope: 'agent' });
    const versions = defineRoute({ method: 'GET', path: '/versions', scope: 'agent' });
    const t3 = { reads: { sessions: { route: sessions }, versions: { route: versions } }, changes: { create: { route: create, input: (v: { name: string }) => ({ body: v }), reads: ['sessions', 'versions'], proves: notApplied } } };
    onFetch((c) => (c.method === 'POST' ? (++n === 1 ? { status: 502, body: {} } : { status: 429, body: { error: 'RATE_LIMITED' } }) : { status: 200, body: { data: [] } }));
    const src = coreSource('computers3', t3);
    let m!: UseMutationResult<SourceResult<unknown>, SourceError, { name: string }>;
    harness(() => { m = src.useMutation<unknown, { name: string }>('create'); src.useQuery('sessions'); src.useQuery('versions', undefined, { enabled: false }); return null; });
    await act(flush);
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
    expect(r).toEqual({ outcome: 'pending', idem: expect.any(String), hold: expect.any(String), route: 'POST /sessions' });
    // The read-back ran on the enabled read only and unlocked: the replay goes out (and is refused, 429). A
    // refused replay proves nothing about the first send: pending again under the same key.
    await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
    expect(r.outcome).toBe('pending');
    await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(3);
    const key = (h: Record<string, string>) => Object.entries(h).find(([k]) => k.includes('idempotency'))?.[1];
    expect(key(posts[1]!.headers)).toBe(key(posts[0]!.headers));
    expect(key(posts[2]!.headers)).toBe(key(posts[0]!.headers));
  });
  it('a pending change keeps a digest of its variables, never the variables (a password)', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest');
    const change = defineRoute<unknown, { password: string }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['password'], idem: true });
    const sessions = defineRoute({ method: 'GET', path: '/sessions', scope: 'agent' });
    const t4 = { reads: { sessions: { route: sessions } }, changes: { pw: { route: change, input: (v: { password: string }) => ({ body: v }), reads: ['sessions'] } } };
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    const src = coreSource('computers4', t4);
    let m!: UseMutationResult<SourceResult<unknown>, SourceError, { password: string }>;
    harness(() => { m = src.useMutation<unknown, { password: string }>('pw'); src.useQuery('sessions'); return null; });
    await act(flush);
    try {
      await act(async () => { await m.mutateAsync({ password: 'hunter2-secret' }); await flush(); });
      const seen = digest.mock.calls.map((c) => new TextDecoder().decode(c[1] as ArrayBuffer));
      expect(seen.some((t) => t.includes('hunter2-secret'))).toBe(true);
    } finally { digest.mockRestore(); }
  });
  it('bots-useQueries: one read per params item, each with its own target; invalidate re-reads them all', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const bots = defineRoute({ method: 'GET', path: '/bots', scope: 'agent' });
    const T2 = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } };
    const T1 = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
    const t5 = { reads: { bots: { route: bots, input: (p: { t: typeof T1 }) => ({ target: p.t }), select: (r: unknown) => (r as { items: string[] }).items } } };
    onFetch((c) => ({ status: 200, body: { items: [c.url.includes('c2') ? 'b2' : 'b1'] } }));
    const src = coreSource('bots5', t5);
    const h = harness(() => src.useQueries<string[], { t: typeof T1 }>('bots', [{ t: T1 }, { t: T2 }]));
    await act(flush);
    expect(h.current().map((r) => r.data)).toEqual([['b1'], ['b2']]);
    const n = calls.length;
    expect(n).toBe(2);
    await act(async () => { await src.invalidate(['bots']); await flush(); });
    expect(calls.length).toBe(n + 2);
  });
  it('a pending change survives a remount; pending and readBack() come from the hook; a failed read keeps it', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const change = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['name'], idem: true });
    const sessions = defineRoute({ method: 'GET', path: '/sessions', scope: 'agent' });
    const t6 = { reads: { sessions: { route: sessions } }, changes: { mk: { route: change, input: (v: { name: string }) => ({ body: v }), reads: ['sessions'], proves: notApplied } } };
    let readOk = true;
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : readOk ? { status: 200, body: { data: [] } } : { status: 500, body: {} }));
    const src = coreSource('computers6', t6);
    type M = ReturnType<typeof src.useMutation<unknown, { name: string }>>;
    let m!: M;
    function Probe() { m = src.useMutation<unknown, { name: string }>('mk'); src.useQuery('sessions'); return null; }
    const first = render(<Probe />, { wrapper: wrap });
    await act(flush);
    readOk = false;
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
    expect(r.outcome).toBe('pending');
    first.unmount();
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    expect(m.pending).toBe(true);
    await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
    expect(r).toEqual({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    let ok = true;
    await act(async () => { ok = await m.readBack(); await flush(); });
    expect(ok).toBe(false);
    expect(m.pending).toBe(true);
    readOk = true;
    await act(async () => { ok = await m.readBack(); await flush(); });
    expect(ok).toBe(true);
    expect(m.pending).toBe(false);
    await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(2);
    const key = (h: Record<string, string>) => Object.entries(h).find(([k]) => k.includes('idempotency'))?.[1];
    expect(key(posts[1]!.headers)).toBe(key(posts[0]!.headers));
  });
  it('realm rule: a realm-scoped change stays its realm\'s across a switch; an account-wide one stays held everywhere', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const prefs = defineRoute<unknown, { v: number }>({ method: 'PATCH', path: '/users/me/prefs', scope: 'base', body: ['v'] });
    const t7 = { reads: {}, changes: { ren: { route: rename, input: (v: { name: string }) => ({ params: { id: 'c1' }, body: v }) }, pref: { route: prefs, input: (v: { v: number }) => ({ body: v }) } } };
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: {} }));
    const src = coreSource('computers7', t7);
    let ren!: ReturnType<typeof src.useMutation<unknown, { name: string }>>;
    let pref!: ReturnType<typeof src.useMutation<unknown, { v: number }>>;
    function Probe() { ren = src.useMutation<unknown, { name: string }>('ren'); pref = src.useMutation<unknown, { v: number }>('pref'); return null; }
    render(<Probe />, { wrapper: wrap });
    let r!: SourceResult<unknown>;
    await act(async () => { await ren.mutateAsync({ name: 'a' }); await pref.mutateAsync({ v: 1 }); await flush(); });
    expect(ren.pending && pref.pending).toBe(true);
    await act(async () => { setRealm('bbbbbbbbbbbbbbbbbbbbbbb2'); bump('switch'); await flush(); });
    expect(pref.pending).toBe(true);
    expect(ren.pending).toBe(false);
    await act(async () => { r = await pref.mutateAsync({ v: 1 }); await flush(); });
    expect(r).toEqual({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    await act(async () => { setRealm(R1); bump('switch'); await flush(); });
    expect(ren.pending).toBe(true);
    await act(async () => { r = await ren.mutateAsync({ name: 'a' }); await flush(); });
    expect(r).toEqual({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(2);
  });
  it('Check again re-reads a change on the computer it went to (another computer\'s read never releases it); discard() without its own change drops nothing', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const change = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['name'], idem: true });
    const sessions = defineRoute({ method: 'GET', path: '/sessions', scope: 'agent' });
    const t8 = { reads: { sessions: { route: sessions } }, changes: { mk: { route: change, input: (v: { name: string }) => ({ body: v }), reads: ['sessions'] } } };
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    const src = coreSource('computers8', t8);
    let m!: ReturnType<typeof src.useMutation<unknown, { name: string }>>;
    function Probe() { m = src.useMutation<unknown, { name: string }>('mk'); src.useQuery('sessions'); return null; }
    const first = render(<Probe />, { wrapper: wrap });
    await act(flush);
    let r!: SourceResult<unknown>;
    // The read-back after the pending answer fails (POST 502 → pending; reads 500 now).
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 500, body: {} }));
    await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
    expect(r.outcome).toBe('pending');
    first.unmount();
    // Computer c1's reads fail now; computer c9's answer. Check again on c9 re-reads c1 for c1's change.
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : c.url.includes('p1-c1') ? { status: 500, body: {} } : { status: 200, body: { data: [] } }));
    const home = { project: { id: 'p9' }, container: { id: 'c9', server_name: 's9' } };
    const before = snapshotTarget();
    setTarget(home);
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    expect(m.pending).toBe(false);
    await act(async () => { await m.readBack(); await m.discard(); await flush(); });
    setTarget(before);
    await act(flush);
    expect(m.pending).toBe(true);
    await act(async () => { await m.discard(); r = await m.mutateAsync({ name: 'a' }); await flush(); });
    expect(r).toEqual({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
  });
  it('one shared lock for the same change sent from two pages (defineMutation and a source change)', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const restart = defineRoute<unknown, { port: number }>({ method: 'POST', path: '/programs/:id/restart', scope: 'agent', body: ['port'], idem: true });
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: {} }));
    const progs = defineMutation<{ id: string; port: number; why: string }>(restart, { input: (v) => ({ params: { id: v.id }, body: { port: v.port } }), lock: 'test.restart', lockKey: (v) => ({ id: v.id, port: v.port }) });
    expect((await progs.run({ id: 'web', port: 80, why: 'a' })).outcome).toBe('pending');
    const t9 = { reads: {}, changes: { restart: { route: restart, input: (v: { name: string; port: number }) => ({ params: { id: v.name }, body: { port: v.port } }), lock: 'test.restart', lockKey: (v: { name: string; port: number }) => ({ id: v.name, port: v.port }) } } };
    const src = coreSource('computers9', t9);
    let m!: ReturnType<typeof src.useMutation<unknown, { name: string; port: number }>>;
    harness(() => { m = src.useMutation<unknown, { name: string; port: number }>('restart'); return null; });
    await act(flush);
    expect(m.pending).toBe(true);
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ name: 'web', port: 80 }); await flush(); });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'HELD_BY_OTHER' }); // another sender's hold is named, not read back
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });
  it('a read-back in realm B never releases realm A\'s pending change (Check again and settle())', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const t10 = { reads: { computers: { route: list } }, changes: { ren: { route: rename, input: (v: { name: string }) => ({ params: { id: 'c1' }, body: v }), reads: ['computers'] } } };
    let readsOk = false;
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : readsOk ? { status: 200, body: { data: { computers: [] } } } : { status: 500, body: {} }));
    const src = coreSource('computers10', t10);
    let m!: ReturnType<typeof src.useMutation<unknown, { name: string }>>;
    let r!: SourceResult<unknown>;
    function Probe() { m = src.useMutation<unknown, { name: string }>('ren'); return null; }
    const first = render(<Probe />, { wrapper: wrap });
    await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
    expect(r.outcome).toBe('pending');
    first.unmount();
    readsOk = true;
    await act(async () => { setRealm('bbbbbbbbbbbbbbbbbbbbbbb2'); bump('switch'); await flush(); });
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await m.readBack(); await m.settle(); await flush(); });
    readsOk = false;
    await act(async () => { setRealm(R1); bump('switch'); await flush(); });
    expect(m.pending).toBe(true);
    await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
    expect(r).toEqual({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
  });
  it('a pending change on c1 still shows pending on the same mount after the top bar moves to c9', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const change = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['name'], idem: true });
    const t11 = { reads: {}, changes: { mk: { route: change, input: (v: { name: string }) => ({ body: v }) } } };
    onFetch(() => ({ status: 502, body: {} }));
    const src = coreSource('computers11', t11);
    let m!: ReturnType<typeof src.useMutation<unknown, { name: string }>>;
    harness(() => { m = src.useMutation<unknown, { name: string }>('mk'); return null; });
    await act(async () => { await m.mutateAsync({ name: 'a' }); await flush(); });
    expect(m.pending).toBe(true);
    await act(async () => { setTarget({ project: { id: 'p9' }, container: { id: 'c9', server_name: 's9' } }); await flush(); });
    expect(m.pending).toBe(true);
  });
  it('a source change is pressed when mutate is called: a switch right after never moves it', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const change = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['name'], idem: true });
    const t12 = { reads: {}, changes: { mk: { route: change, input: (v: { name: string }) => ({ body: v }) } } };
    onFetch(() => ({ status: 200, body: {} }));
    const src = coreSource('computers12', t12);
    let m!: ReturnType<typeof src.useMutation<unknown, { name: string }>>;
    harness(() => { m = src.useMutation<unknown, { name: string }>('mk'); return null; });
    await act(flush);
    const before = snapshotTarget();
    await act(async () => {
      const p = m.mutateAsync({ name: 'a' });
      setTarget({ project: { id: 'p9' }, container: { id: 'c9', server_name: 's9' } });
      await p;
      await flush();
    });
    const post = calls.filter((c) => c.method === 'POST');
    expect(post).toHaveLength(1);
    expect(post[0]!.url).toContain(before!.project.id + '-' + before!.container.id);
  });
  it('one shared kit lock across pages (other variable shapes, same identity); after release other bytes get a new key', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const restart = defineRoute<unknown, { port: number }>({ method: 'POST', path: '/api/v1/daemon/programs/:id/restart', scope: 'kit', kit: 'daemon', index: 1, body: ['port', 'all', 'wait'], idem: true });
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: {} }));
    const progs = defineMutation<{ id: string; port: number | null; all?: boolean }>(restart, { input: (v) => ({ params: { id: v.id }, body: v.port === null ? {} : { port: v.port } }), lock: 'test.kit.restart', lockKey: (v) => ({ id: v.id, port: v.port ?? null, all: !!v.all }) });
    expect((await progs.run({ id: 'web', port: null })).outcome).toBe('pending');
    const t13 = { reads: {}, changes: { restart: { route: restart, input: (v: { program: string; port?: number }) => ({ params: { id: v.program }, body: { wait: true } }), lock: 'test.kit.restart', lockKey: (v: { program: string; port?: number }) => ({ id: v.program, port: v.port ?? null, all: false }) } } };
    const src = coreSource('computers13', t13);
    let m!: ReturnType<typeof src.useMutation<unknown, { program: string; port?: number }>>;
    harness(() => { m = src.useMutation<unknown, { program: string; port?: number }>('restart'); return null; });
    await act(flush);
    expect(m.pending).toBe(true);
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ program: 'web' }); await flush(); });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'HELD_BY_OTHER' }); // another sender's hold is named, not read back
    await act(async () => { await progs.settle({ id: 'web', port: null }, (await progs.holdOf({ id: 'web', port: null }))!); await flush(); });
    await act(async () => { r = await m.mutateAsync({ program: 'web' }); await flush(); });
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(2);
    const key = (h: Record<string, string>) => Object.entries(h).find(([k]) => k.includes('idempotency'))?.[1];
    expect(key(posts[1]!.headers)).toBeTruthy();
    expect(key(posts[1]!.headers)).not.toBe(key(posts[0]!.headers));
  });
  it('heldChanges: a page that did not send a shared-lock change reads its key and identity, and cannot dismiss it; its sender can', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const restart = defineRoute<unknown, { port: number }>({ method: 'POST', path: '/api/v1/daemon/programs/:id/restart', scope: 'kit', kit: 'daemon', index: 1, body: ['port', 'all', 'wait'], idem: true });
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: {} }));
    const progs = defineMutation<{ id: string; port: number | null; secret?: string }>(restart, { input: (v) => ({ params: { id: v.id }, body: {} }), lock: 'test.held.restart', lockKey: (v) => ({ id: v.id, port: v.port ?? null, all: false }) });
    expect(heldChanges('test.held.restart')).toEqual([]);
    const r0 = await progs.run({ id: 'web', port: null, secret: 'hunter2' });
    expect(r0.outcome).toBe('pending');
    const held = heldChanges('test.held.restart');
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ key: r0.idem, identity: { id: 'web', port: null, all: false } });
    expect(held[0]!.target).toMatchObject({ container: { id: 'c1' } });
    expect(typeof held[0]!.at).toBe('number');
    expect(JSON.stringify(held)).not.toContain('hunter2');
    expect(Object.isFrozen(held[0]!.identity)).toBe(true);
    const t14 = { reads: {}, changes: { restart: { route: restart, input: (v: { program: string }) => ({ params: { id: v.program }, body: {} }), lock: 'test.held.restart', lockKey: (v: { program: string }) => ({ id: v.program, port: null, all: false }) } } };
    const src = coreSource('computers14', t14);
    let m!: ReturnType<typeof src.useMutation<unknown, { program: string }>>;
    harness(() => { m = src.useMutation<unknown, { program: string }>('restart'); return null; });
    await act(flush);
    expect(m.pending).toBe(true);
    // Dismiss frees only the change this page sent: another page's change under the shared lock stays held.
    await act(async () => { await m.settle({ program: (held[0]!.identity as { id: string }).id }, (await m.holdOf({ program: (held[0]!.identity as { id: string }).id }))!); await m.dismiss(); await flush(); });
    expect(m.pending).toBe(true);
    await act(async () => { await progs.dismiss({ id: 'web', port: null }, (await progs.holdOf({ id: 'web', port: null }))!); await flush(); });
    expect(m.pending).toBe(false);
    expect(heldChanges('test.held.restart')).toEqual([]);
  });
  it('a refused send keeps its HTTP status on the result, also when the code is blank', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const change = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['name'] });
    let st = 429;
    onFetch(() => ({ status: st, body: {} }));
    const src = coreSource('computersF9', { reads: {}, changes: { mk: { route: change, input: (v: { name: string }) => ({ body: v }) } } });
    let m!: ReturnType<typeof src.useMutation<unknown, { name: string }>>;
    harness(() => { m = src.useMutation<unknown, { name: string }>('mk'); return null; });
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
    expect(r).toMatchObject({ outcome: 'failed', status: 429 });
    st = 409;
    onFetch(() => ({ status: st, body: { error: 'CONFLICT' } }));
    await act(async () => { r = await m.mutateAsync({ name: 'b' }); await flush(); });
    expect(r).toMatchObject({ outcome: 'failed', status: 409, code: 'CONFLICT' });
  });
  it('no release without proves: a fresh read-back keeps a source change held; dismiss() frees it, key kept; identity is what proves sees', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const change = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['name'], idem: true });
    const sessions = defineRoute({ method: 'GET', path: '/sessions', scope: 'agent' });
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    const tH = { reads: { sessions: { route: sessions } }, changes: {
      bare: { route: change, input: (v: { name: string }) => ({ body: v }), reads: ['sessions'] },
      named: { route: change, input: (v: { name: string; label: string }) => ({ body: { name: v.name } }), reads: ['sessions'], lock: 'test.src.named', lockKey: (v: { name: string; label: string }) => ({ name: v.name }), identity: (v: { name: string; label: string }) => ({ name: v.name, label: v.label }) },
    } };
    const src = coreSource('computersH', tH);
    let m!: ReturnType<typeof src.useMutation<unknown, { name: string }>>;
    harness(() => { m = src.useMutation<unknown, { name: string }>('bare'); src.useQuery('sessions'); return null; });
    await act(flush);
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
    expect(r.outcome).toBe('pending');
    let ok = true;
    await act(async () => { ok = await m.readBack(); await flush(); });
    expect(ok).toBe(false);
    expect(m.pending).toBe(true);
    await act(async () => { await m.dismiss(); await flush(); });
    expect(m.pending).toBe(false);
    await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(2);
    const key = (h: Record<string, string>) => Object.entries(h).find(([k]) => k.includes('idempotency'))?.[1];
    expect(key(posts[1]!.headers)).toBe(key(posts[0]!.headers));
    let n!: ReturnType<typeof src.useMutation<unknown, { name: string; label: string }>>;
    harness(() => { n = src.useMutation<unknown, { name: string; label: string }>('named'); return null; });
    await act(async () => { await n.mutateAsync({ name: 'x', label: 'Shown' }); await flush(); });
    expect(heldChanges('test.src.named')[0]!.identity).toEqual({ name: 'x', label: 'Shown' });
  });
  it('useLockedChange {lock} shares the lock with a coreSource change of the same name (setup retry on Home and Computers)', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const retry = defineRoute<unknown, Record<string, never>>({ method: 'POST', path: '/users/me/retry-setup', scope: 'base', body: [] });
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: {} }));
    let home!: LockedChange<void, unknown>;
    const t15 = { reads: {}, changes: { retrySetup: { route: retry, input: () => ({ body: {} }), lock: 'test.setup.retry', lockKey: () => ({}) } } };
    const src = coreSource('computers15', t15);
    let m!: ReturnType<typeof src.useMutation<unknown, void>>;
    harness(() => {
      home = useLockedChange<void, unknown>((_v, _idem, ctx) => api(retry, { body: {}, ctx }), [], 'home.retrySetup', { lock: 'test.setup.retry', lockKey: () => ({}) });
      m = src.useMutation<unknown, void>('retrySetup');
      return null;
    });
    await act(flush);
    let lr!: LockedResult<unknown>;
    await act(async () => { lr = await home.run(); await flush(); });
    expect(lr.outcome).toBe('pending');
    expect(m.pending).toBe(true);
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync(); await flush(); });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'HELD_BY_OTHER' }); // another sender's hold is named, not read back
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });
  it('setupLocks: Home (useLockedChange) and Computers (coreSource) share redeem and retry, one per account, the code never kept', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const redeem = defineRoute<unknown, { code: string }>({ method: 'POST', path: '/users/me/redeem-invite', scope: 'base', body: ['code'] });
    const retry = defineRoute<unknown, Record<string, never>>({ method: 'POST', path: '/users/me/retry-setup', scope: 'base', body: [] });
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: {} }));
    const t16 = { reads: {}, changes: {
      redeem: { route: redeem, input: (v: { code: string }) => ({ body: { code: v.code } }), ...setupLocks.redeem },
      retrySetup: { route: retry, input: () => ({ body: {} }), ...setupLocks.retry },
    } };
    const src = coreSource('computers16', t16);
    let homeRedeem!: LockedChange<{ code: string }, unknown>;
    let homeRetry!: LockedChange<void, unknown>;
    let red!: ReturnType<typeof src.useMutation<unknown, { code: string }>>;
    let ret!: ReturnType<typeof src.useMutation<unknown, void>>;
    harness(() => {
      homeRedeem = useLockedChange<{ code: string }, unknown>((v, _i, ctx) => api(redeem, { body: { code: v.code }, ctx }), [], 'home.redeem', { ...setupLocks.redeem });
      homeRetry = useLockedChange<void, unknown>((_v, _i, ctx) => api(retry, { body: {}, ctx }), [], 'home.retry', { ...setupLocks.retry });
      red = src.useMutation<unknown, { code: string }>('redeem');
      ret = src.useMutation<unknown, void>('retrySetup');
      return null;
    });
    await act(flush);
    await act(async () => { await homeRedeem.run({ code: 'AAAA' }); await homeRetry.run(); await flush(); });
    let r!: SourceResult<unknown>;
    await act(async () => { r = await red.mutateAsync({ code: 'AAAA' }); await flush(); });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'HELD_BY_OTHER' }); // another sender's hold is named, not read back
    await act(async () => { r = await ret.mutateAsync(); await flush(); });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'HELD_BY_OTHER' }); // another sender's hold
    await act(async () => { r = await red.mutateAsync({ code: 'BBBB' }); await flush(); });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'HELD_BY_OTHER' }); // another sender's hold
    expect(JSON.stringify(heldChanges('invite.redeem'))).not.toContain('AAAA');
  });
  it('Check again re-reads and releases every pending change of the key, not only the last (two rows in flight)', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const renew = defineRoute<unknown, { auto_renew: boolean }>({ method: 'PUT', path: '/subserver-subscriptions/:id/auto-renew', scope: 'realm', body: ['auto_renew'] });
    let readsOk = false;
    onFetch((c) => (c.method === 'PUT' ? { status: 502, body: {} } : readsOk ? { status: 200, body: { data: { computers: [] } } } : { status: 500, body: {} }));
    const t17 = { reads: { computers: { route: list } }, changes: { renew: { route: renew, input: (v: { id: string; on: boolean }) => ({ params: { id: v.id }, body: { auto_renew: v.on } }), reads: ['computers'], proves: notApplied } } };
    const src = coreSource('billing17', t17);
    let m!: ReturnType<typeof src.useMutation<unknown, { id: string; on: boolean }>>;
    harness(() => { m = src.useMutation<unknown, { id: string; on: boolean }>('renew'); src.useQuery('computers'); return null; });
    await act(async () => { await m.mutateAsync({ id: 'a', on: true }); await m.mutateAsync({ id: 'b', on: true }); await flush(); });
    readsOk = true;
    let ok = false;
    await act(async () => { ok = await m.readBack(); await flush(); });
    expect(ok).toBe(true);
    let r!: SourceResult<unknown>;
    readsOk = false;
    await act(async () => { r = await m.mutateAsync({ id: 'a', on: true }); await flush(); });
    expect(r.outcome).toBe('pending');
  });
  it('a pending source change returns its key (the receipt is read with it), the same key heldChanges shows', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const restart = defineRoute<unknown, { port: number }>({ method: 'POST', path: '/api/v1/daemon/programs/:id/restart', scope: 'kit', kit: 'daemon', index: 1, body: ['port', 'all', 'wait'], idem: true });
    let status = 502;
    onFetch((c) => (c.method === 'POST' ? { status, body: {} } : { status: 200, body: {} }));
    const t20 = { reads: {}, changes: { restart: { route: restart, input: (v: { program: string }) => ({ params: { id: v.program }, body: { wait: true } }), lock: 'test.r5.idem', lockKey: (v: { program: string }) => ({ id: v.program }) } } };
    const src = coreSource('computers20', t20);
    let m!: ReturnType<typeof src.useMutation<unknown, { program: string }>>;
    harness(() => { m = src.useMutation<unknown, { program: string }>('restart'); return null; });
    await act(flush);
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ program: 'web' }); await flush(); });
    expect(r.outcome).toBe('pending');
    expect(typeof r.idem).toBe('string');
    expect(heldChanges('test.r5.idem').map((h) => h.key)).toEqual([r.idem]);
    // The receipt reads completed, so the change is completed: the next restart is a new one.
    await act(async () => { await m.complete({ program: 'web' }, (await m.holdOf({ program: 'web' }))!); await flush(); });
    expect(heldChanges('test.r5.idem')).toEqual([]);
    expect(m.pending).toBe(false);
    status = 200;
    let r2!: SourceResult<unknown>;
    await act(async () => { r2 = await m.mutateAsync({ program: 'web' }); await flush(); });
    expect(r2.outcome).toBe('done');
    const key = (h: Record<string, string>) => Object.entries(h).find(([k]) => k.includes('idempotency'))?.[1];
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(key(posts[1]!.headers)).toBe(r2.idem);
    expect(r2.idem).not.toBe(r.idem);
  });
  it('a source change with proves is freed only by a verdict; any other fresh read keeps it pending', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const progList = defineRoute<unknown>({ method: 'GET', path: '/r6s-programs', scope: 'agent' });
    const progStart = defineRoute<unknown, Record<string, never>>({ method: 'POST', path: '/r6s-programs/:id/start', scope: 'agent', body: [], idem: true });
    let state = 'stopped';
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: { data: [{ id: 'web', state }] } }));
    type Row = { id: string; state: string };
    const t21 = {
      reads: { programs: { route: progList, select: (r: unknown) => (r as { data: Row[] }).data } },
      changes: { start: {
        route: progStart, input: (v: { id: string }) => ({ params: { id: v.id }, body: {} }), reads: ['programs'], lock: 'test.r6.start', lockKey: (v: { id: string }) => ({ id: v.id }),
        proves: (id: unknown, answers: readonly (readonly unknown[])[]) => (answers[0]!.some((rows) => (rows as Row[]).some((p) => p.id === (id as { id: string }).id && p.state === 'running')) ? 'applied' as const : undefined),
      } },
    };
    const src = coreSource('computers21', t21);
    let m!: ReturnType<typeof src.useMutation<unknown, { id: string }>>;
    harness(() => { src.useQuery<Row[]>('programs'); m = src.useMutation<unknown, { id: string }>('start'); return null; });
    await act(flush);
    await act(async () => { await m.mutateAsync({ id: 'web' }); await flush(); });
    expect(m.pending).toBe(true);
    let ok = true;
    await act(async () => { ok = await m.readBack(); await flush(); });
    expect(ok).toBe(false);
    expect(m.pending).toBe(true);
    state = 'running';
    await act(async () => { ok = await m.readBack(); await flush(); });
    expect(ok).toBe(true);
    expect(m.pending).toBe(false);
    expect(heldChanges('test.r6.start')).toEqual([]);
  });
  it('settle(vars) in All realms settles the change in the realm it was sent in, never the shown realm\'s', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: { computers: [] } } }));
    const t22 = { reads: {}, changes: { ssh: { route: rename, input: (v: { id: string; name: string }) => ({ params: { id: v.id }, body: { name: v.name } }), lock: 'test.r5.ssh', lockKey: (v: { id: string }) => ({ computer: v.id }) } } };
    const src = coreSource('computers22', t22);
    let m!: ReturnType<typeof src.useMutation<unknown, { id: string; name: string }>>;
    harness(() => { m = src.useMutation<unknown, { id: string; name: string }>('ssh'); return null; });
    await act(flush);
    await act(async () => { await m.mutateAsync({ id: 'c1', name: 'k' }); await flush(); });
    expect(heldChanges('test.r5.ssh')).toHaveLength(1);
    await act(async () => { setRealm('bbbbbbbbbbbbbbbbbbbbbbb2'); bump('switch'); await flush(); });
    await act(async () => { await m.settle({ id: 'c1', name: 'k' }, (await m.holdOf({ id: 'c1', name: 'k' }))!); await flush(); });
    expect(heldChanges('test.r5.ssh')).toHaveLength(1);
    await act(async () => { setRealm('all'); bump('switch'); await flush(); });
    // In All realms the page passes the hold it showed (HeldChange.hold).
    const shown = heldChanges('test.r5.ssh')[0]!.hold!;
    await act(async () => { await m.settle({ id: 'c1', name: 'k' }, shown); await flush(); });
    expect(heldChanges('test.r5.ssh')).toEqual([]);
  });
  it('a Computers read-back on the shared ssh lock never frees the Keys change (no reads) it did not send', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: { computers: [] } } }));
    const keysSsh = defineMutation<{ id: string; key: string | null }>(rename, { input: (v) => ({ params: { id: v.id }, body: { name: v.key ?? '' } }), lock: 'test.r5b.ssh', lockKey: (v) => ({ computer: v.id }) });
    expect((await keysSsh.run({ id: 'c1', key: null })).outcome).toBe('pending');
    const t23 = { reads: { computers: { route: list } }, changes: { ssh: { route: rename, input: (v: { id: string; key: string }) => ({ params: { id: v.id }, body: { name: v.key } }), reads: ['computers'], lock: 'test.r5b.ssh', lockKey: (v: { id: string }) => ({ computer: v.id }) } } };
    const src = coreSource('computers23', t23);
    let m!: ReturnType<typeof src.useMutation<unknown, { id: string; key: string }>>;
    harness(() => { src.useQuery('computers'); m = src.useMutation<unknown, { id: string; key: string }>('ssh'); return null; });
    await act(flush);
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ id: 'c1', key: '' }); await flush(); });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'HELD_BY_OTHER' }); // another sender's hold is named, not read back
    let ok = true;
    await act(async () => { ok = await m.readBack(); await flush(); });
    expect(ok).toBe(false);
    expect(heldChanges('test.r5b.ssh')).toHaveLength(1);
    await act(async () => { r = await m.mutateAsync({ id: 'c1', key: '' }); await flush(); });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'HELD_BY_OTHER' }); // another sender's hold
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    // Its own sender (Keys) proves it: then the lock is free.
    await keysSsh.settle({ id: 'c1', key: null }, (await keysSsh.holdOf({ id: 'c1', key: null }))!);
    expect(heldChanges('test.r5b.ssh')).toEqual([]);
  });
  it('settle() with no variables never frees another sender\'s change that now holds this mount\'s last lock', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    let status = 200;
    onFetch((c) => (c.method === 'PATCH' ? { status, body: {} } : { status: 200, body: { data: { computers: [] } } }));
    const keysSsh = defineMutation<{ id: string; key: string | null }>(rename, { input: (v) => ({ params: { id: v.id }, body: { name: v.key ?? '' } }), lock: 'test.np3.ssh', lockKey: (v) => ({ computer: v.id }) });
    const tnp = { reads: { computers: { route: list } }, changes: { ssh: { route: rename, input: (v: { id: string; key: string }) => ({ params: { id: v.id }, body: { name: v.key } }), reads: ['computers'], lock: 'test.np3.ssh', lockKey: (v: { id: string }) => ({ computer: v.id }) } } };
    const src = coreSource('computersnp3', tnp);
    let m!: ReturnType<typeof src.useMutation<unknown, { id: string; key: string }>>;
    harness(() => { src.useQuery('computers'); m = src.useMutation<unknown, { id: string; key: string }>('ssh'); return null; });
    await act(flush);
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ id: 'c1', key: 'a' }); await flush(); });
    expect(r.outcome).toBe('done');
    status = 502;
    expect((await keysSsh.run({ id: 'c1', key: null })).outcome).toBe('pending');
    await act(async () => { await m.settle(); await flush(); });
    expect(heldChanges('test.np3.ssh')).toHaveLength(1);
    await keysSsh.settle({ id: 'c1', key: null }, (await keysSsh.holdOf({ id: 'c1', key: null }))!);
    expect(heldChanges('test.np3.ssh')).toEqual([]);
  });
  it('heldChanges hands out deep-frozen copies (identity and target), and a cyclic identity never throws', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const restart = defineRoute<unknown, { port: number }>({ method: 'POST', path: '/api/v1/daemon/programs/:id/restart', scope: 'kit', kit: 'daemon', index: 1, body: ['port', 'all', 'wait'], idem: true });
    onFetch(() => ({ status: 502, body: {} }));
    const ident: Record<string, unknown> = { id: 'web', tags: ['a'] };
    const m = defineMutation<{ id: string }>(restart, { input: (v) => ({ params: { id: v.id }, body: {} }), lock: 'test.r5b.copy', lockKey: () => ident });
    expect((await m.run({ id: 'web' })).outcome).toBe('pending');
    // The page's own object moving later never moves the registry's identity.
    (ident.tags as string[]).push('b');
    const h = heldChanges('test.r5b.copy')[0]!;
    expect(h.identity).toEqual({ id: 'web', tags: ['a'] });
    expect(Object.isFrozen(h.target)).toBe(true);
    expect(Object.isFrozen((h.target as { container: object }).container)).toBe(true);
    expect(() => { ((h.target as { container: { id: string } }).container).id = 'evil'; }).toThrow();
    expect(heldChanges('test.r5b.copy')[0]!.target).toMatchObject({ container: { id: 'c1' } });
    const cyc: Record<string, unknown> = { id: 'loop' };
    cyc.self = cyc;
    const m2 = defineMutation<{ id: string }>(restart, { input: (v) => ({ params: { id: v.id }, body: {} }), lock: 'test.r5b.cyc', lockKey: () => cyc });
    expect((await m2.run({ id: 'loop' })).outcome).toBe('pending');
    expect(() => heldChanges('test.r5b.cyc')).not.toThrow();
    expect(heldChanges('test.r5b.cyc')[0]!.identity).toEqual({ id: 'loop', self: null });
  });
  it('a kit defineMutation and a useLockedChange sharing a {lock} (with its route) hold each other', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const restart = defineRoute<unknown, { port: number }>({ method: 'POST', path: '/api/v1/daemon/programs/:id/restart', scope: 'kit', kit: 'daemon', index: 1, body: ['port', 'all', 'wait'], idem: true });
    onFetch(() => ({ status: 502, body: {} }));
    const m = defineMutation<{ id: string }>(restart, { input: (v) => ({ params: { id: v.id }, body: {} }), lock: 'test.r5b.scope', lockKey: (v) => ({ id: v.id }) });
    expect((await m.run({ id: 'web' })).outcome).toBe('pending');
    let sent = 0;
    let ch!: LockedChange<{ id: string }, unknown>;
    harness(() => { ch = useLockedChange((_v: { id: string }) => { sent++; return Promise.resolve(null); }, [], 'test.r5b.scope.locked', { lock: 'test.r5b.scope', lockKey: (v) => ({ id: v.id }), route: restart }); return null; });
    await act(flush);
    expect(ch.state).toBe('pending');
    let r!: LockedResult<unknown>;
    await act(async () => { r = await ch.run({ id: 'web' }); await flush(); });
    expect(r.code).toBe('HELD_BY_OTHER'); // another sender's hold
    expect(sent).toBe(0);
  });
  it('an unknown change is not_sent', async () => {
    boot();
    const src = coreSource('computers', table);
    let m!: UseMutationResult<SourceResult<unknown>, SourceError, void>;
    harness(() => { m = src.useMutation<unknown>('nope'); return null; });
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync(); });
    expect(r).toEqual({ outcome: 'not_sent', code: 'NOT_WIRED' });
  });
});

describe('coreSource under fixtures', () => {
  it('with a fallback, the fallback answers; nothing goes to core routes', async () => {
    bootFixtureCore();
    queryClient.clear();
    const fb = { useQuery: () => ({ data: ['from-fixture'] }), useMutation: () => ({}) } as unknown as FallbackSource;
    const src = coreSource('computers', table, fb);
    const h = harness(() => src.useQuery<string[]>('computers'));
    expect(h.current().data).toEqual(['from-fixture']);
  });
  it("without a fallback, core's fixture rules answer the table's routes", async () => {
    const t = bootFixtureCore();
    queryClient.clear();
    t.setRules([{ route: list, answer: { body: { data: { computers: [{ id: 'c', name: 'cedar' }] } } } } as never]);
    const src = coreSource('computers', table);
    const h = harness(() => src.useQuery<string[], { limit: number }>('computers', { limit: 2 }));
    await act(flush);
    expect(h.current().data).toEqual(['cedar']);
  });
});

describe('readTarget: the predicate of a source read, without the key layout', () => {
  it('matches only this page and these keys; a computer filter keeps reads that name no computer', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch(() => ({ status: 200, body: { data: { computers: [] } } }));
    const sessions = defineRoute({ method: 'GET', path: '/sessions', scope: 'agent' });
    const pa = coreSource('rt-a', { reads: { computers: table.reads.computers, sessions: { route: sessions } } });
    const pb = coreSource('rt-b', table);
    harness(() => { pa.useQuery('computers', { limit: 1 }); pa.useQuery('sessions'); pb.useQuery('computers', { limit: 1 }); return null; });
    await act(flush);
    const count = (p: (k: readonly unknown[]) => boolean) => queryClient.getQueryCache().findAll({ predicate: (q) => p(q.queryKey) }).length;
    const here = snapshotTarget()!.container.id;
    expect(count(pa.readTarget('computers'))).toBe(1);
    expect(count(pa.readTarget(['computers', 'sessions']))).toBe(2);
    expect(count(pa.readTarget())).toBe(2);
    expect(count(pa.readTarget('sessions', { computer: here }))).toBe(1);
    expect(count(pa.readTarget('sessions', { computer: 'another' }))).toBe(0);
    expect(count(pa.readTarget(['computers', 'sessions'], { computer: 'another' }))).toBe(1);
    expect(count(pb.readTarget())).toBe(1);
  });
});

describe('a source change settled (key kept) and then proven applied gets a new key', () => {
  it('settle(vars) then complete(vars): the next press sends a fresh key', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const restart = defineRoute<unknown, { port: number }>({ method: 'POST', path: '/api/v1/daemon/programs/:id/restart', scope: 'kit', kit: 'daemon', index: 1, body: ['port', 'all', 'wait'], idem: true });
    let status = 502;
    onFetch((c) => (c.method === 'POST' ? { status, body: {} } : { status: 200, body: {} }));
    const t = { reads: {}, changes: { restart: { route: restart, input: (v: { program: string }) => ({ params: { id: v.program }, body: { wait: true } }), lock: 'test.r5c6', lockKey: (v: { program: string }) => ({ id: v.program }) } } };
    const src = coreSource('r5c6', t);
    let m!: ReturnType<typeof src.useMutation<unknown, { program: string }>>;
    harness(() => { m = src.useMutation<unknown, { program: string }>('restart'); return null; });
    await act(flush);
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ program: 'web' }); await flush(); });
    expect(r.outcome).toBe('pending');
    await act(async () => { await m.settle({ program: 'web' }, (await m.holdOf({ program: 'web' }))!); await flush(); });
    expect(m.pending).toBe(false);
    await act(async () => { await m.complete({ program: 'web' }, (await m.holdOf({ program: 'web' }))!); await flush(); });
    status = 200;
    let r2!: SourceResult<unknown>;
    await act(async () => { r2 = await m.mutateAsync({ program: 'web' }); await flush(); });
    expect(r2.outcome).toBe('done');
    const key = (h: Record<string, string>) => Object.entries(h).find(([k]) => k.includes('idempotency'))?.[1];
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(key(posts[1]!.headers)).not.toBe(key(posts[0]!.headers));
  });
});

describe('a source change acts only on what its own key sent', () => {
  const restart = defineRoute<unknown, { port: number }>({ method: 'POST', path: '/api/v1/daemon/programs/:id/core2', scope: 'kit', kit: 'daemon', index: 1, body: ['port'], idem: true });
  const progsRead = defineRoute({ method: 'GET', path: '/api/v1/daemon/core2-programs', scope: 'kit', kit: 'daemon', index: 1 });
  const lockKey = (v: { id: string }) => ({ id: v.id });
  it('dismiss() after this key\'s last change is done never frees the same change another page has pending', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    let status = 200;
    onFetch((c) => (c.method === 'POST' ? { status, body: {} } : { status: 200, body: {} }));
    const other = defineMutation<{ id: string }>(restart, { input: (v) => ({ params: { id: v.id }, body: {} }), lock: 'core2.src.last', lockKey });
    const src = coreSource('core2a', { reads: {}, changes: { restart: { route: restart, input: (v: { id: string }) => ({ params: { id: v.id }, body: {} }), lock: 'core2.src.last', lockKey } } });
    let m!: ReturnType<typeof src.useMutation<unknown, { id: string }>>;
    harness(() => { m = src.useMutation<unknown, { id: string }>('restart'); return null; });
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ id: 'web' }); await flush(); });
    expect(r.outcome).toBe('done');
    status = 502;
    expect((await other.run({ id: 'web' })).outcome).toBe('pending');
    await act(async () => { await m.dismiss(); await flush(); });
    expect(await other.isPending({ id: 'web' })).toBe(true);
  });
  it('Check again on a source change never proves another page\'s change under the shared lock', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    const other = defineMutation<{ id: string }>(restart, { input: (v) => ({ params: { id: v.id }, body: {} }), lock: 'core2.src.rb', lockKey });
    const src = coreSource('core2b', { reads: { progs: { route: progsRead } }, changes: { restart: { route: restart, input: (v: { id: string }) => ({ params: { id: v.id }, body: {} }), reads: ['progs'], lock: 'core2.src.rb', lockKey, proves: () => 'applied' as const } } });
    let m!: ReturnType<typeof src.useMutation<unknown, { id: string }>>;
    harness(() => { m = src.useMutation<unknown, { id: string }>('restart'); src.useQuery('progs'); return null; });
    await act(flush);
    expect((await other.run({ id: 'web' })).outcome).toBe('pending');
    let ok = true;
    await act(async () => { ok = await m.readBack(); await flush(); });
    expect(ok).toBe(false);
    expect(await other.isPending({ id: 'web' })).toBe(true);
  });
  it('dismiss() frees every pending change this mount sent, not only the last', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: {} }));
    const src = coreSource('core2c', { reads: {}, changes: { restart: { route: restart, input: (v: { id: string }) => ({ params: { id: v.id }, body: {} }) } } });
    let m!: ReturnType<typeof src.useMutation<unknown, { id: string }>>;
    harness(() => { m = src.useMutation<unknown, { id: string }>('restart'); return null; });
    await act(async () => { await m.mutateAsync({ id: 'a' }); await m.mutateAsync({ id: 'b' }); await flush(); });
    expect(m.pending).toBe(true);
    await act(async () => { await m.dismiss(); await flush(); });
    expect(m.pending).toBe(false);
  });
});

describe('under the shared alias lock each change key judges only its own locks', () => {
  it('Scripts remove\'s Check again never retires a pending Scripts or Computers create as applied', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: { data: [{ id: 'al1', alias: 'x' }] } }));
    const rows = (a: readonly (readonly unknown[])[]) => (a[0] || []).flatMap((d) => ((d as { data?: { id: string }[] })?.data || []));
    const reads = { aliases: { route: aliasRoutes.list } };
    const scripts = coreSource('core2scripts', { reads, changes: {
      create: { route: aliasRoutes.create, input: (v: { compId: string; target: string }) => ({ body: { computer_id: v.compId, program: 'exec', target_path: v.target } }), reads: ['aliases'], lock: aliasLock.lock, lockKey: (v: { compId: string; target: string }) => ({ compId: v.compId, target: v.target }), proves: () => undefined },
      remove: { route: aliasRoutes.remove, input: (v: { alias: string }) => ({ params: { id: v.alias } }), reads: ['aliases'], lock: aliasLock.lock, lockKey: (v: { alias: string }) => aliasLock.key(v.alias),
        // The unguarded shape: no identity guard, any non-empty list without that id reads as removed.
        proves: (id: unknown, a: readonly (readonly unknown[])[]) => (rows(a).length > 0 && !rows(a).some((x) => x.id === (id as { alias?: string }).alias) ? 'applied' as const : undefined) },
    } });
    const computers = coreSource('core2computers', { reads, changes: {
      create: { route: aliasRoutes.create, input: (v: { compId: string; port: number }) => ({ body: { computer_id: v.compId, program: 'web', port: v.port } }), reads: ['aliases'], lock: aliasLock.lock, lockKey: (v: { compId: string; port: number }) => ({ computer: v.compId, port: v.port }) },
    } });
    let sc!: ReturnType<typeof scripts.useMutation<unknown, { compId: string; target: string }>>;
    let sr!: ReturnType<typeof scripts.useMutation<unknown, { alias: string }>>;
    let cc!: ReturnType<typeof computers.useMutation<unknown, { compId: string; port: number }>>;
    harness(() => {
      sc = scripts.useMutation<unknown, { compId: string; target: string }>('create');
      sr = scripts.useMutation<unknown, { alias: string }>('remove');
      cc = computers.useMutation<unknown, { compId: string; port: number }>('create');
      scripts.useQuery('aliases');
      return null;
    });
    await act(flush);
    await act(async () => { await sc.mutateAsync({ compId: 'c1', target: '/s.sh' }); await cc.mutateAsync({ compId: 'c1', port: 80 }); await flush(); });
    expect(heldChanges(aliasLock.lock)).toHaveLength(2);
    let ok = true;
    await act(async () => { ok = await sr.readBack(); await flush(); });
    expect(ok).toBe(false);
    expect(heldChanges(aliasLock.lock)).toHaveLength(2);
    expect(sc.pending).toBe(true);
  });
  it('heldChanges(lock, {realm}) lists the given realm\'s holds and realm-less ones; none or all lists every one', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch(() => ({ status: 502, body: {} }));
    const m = defineMutation<{ alias: string }>(aliasRoutes.remove, { input: (v) => ({ params: { id: v.alias } }), lock: aliasLock.lock, lockKey: (v) => aliasLock.key(v.alias) });
    expect((await m.run({ alias: 'al1' })).outcome).toBe('pending');
    expect(heldChanges(aliasLock.lock, { realm: R1 })).toHaveLength(1);
    expect(heldChanges(aliasLock.lock, { realm: 'bbbbbbbbbbbbbbbbbbbbbbb2' })).toHaveLength(0);
    expect(heldChanges(aliasLock.lock, { realm: 'all' })).toHaveLength(1);
    expect(heldChanges(aliasLock.lock)).toHaveLength(1);
  });

});

describe('a source change\'s complete() and discard() act only on this key\'s changes; answers are judged in the realm they were read', () => {
  const restart = defineRoute<unknown, { port: number }>({ method: 'POST', path: '/api/v1/daemon/programs/:id/core2sol', scope: 'kit', kit: 'daemon', index: 1, body: ['port'], idem: true });
  const lockKey = (v: { id: string }) => ({ id: v.id });
  const input = (v: { id: string }) => ({ params: { id: v.id }, body: {} });
  it('complete() on a mount that sent nothing never frees another page\'s pending change under the shared lock', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch(() => ({ status: 502, body: {} }));
    const other = defineMutation<{ id: string }>(restart, { input, lock: 'core2.sol.src.c', lockKey });
    const src = coreSource('core2sol1', { reads: {}, changes: { restart: { route: restart, input, lock: 'core2.sol.src.c', lockKey } } });
    let m!: ReturnType<typeof src.useMutation<unknown, { id: string }>>;
    harness(() => { m = src.useMutation<unknown, { id: string }>('restart'); return null; });
    expect((await other.run({ id: 'web' })).outcome).toBe('pending');
    await act(async () => { await m.complete(); await flush(); });
    expect(await other.isPending({ id: 'web' })).toBe(true);
  });
  it('complete() after this key\'s change is done never frees the same change another page has pending now', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    let status = 200;
    onFetch((c) => (c.method === 'POST' ? { status, body: {} } : { status: 200, body: {} }));
    const other = defineMutation<{ id: string }>(restart, { input, lock: 'core2.sol.src.d', lockKey });
    const src = coreSource('core2sol2', { reads: {}, changes: { restart: { route: restart, input, lock: 'core2.sol.src.d', lockKey } } });
    let m!: ReturnType<typeof src.useMutation<unknown, { id: string }>>;
    harness(() => { m = src.useMutation<unknown, { id: string }>('restart'); return null; });
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ id: 'web' }); await flush(); });
    expect(r.outcome).toBe('done');
    status = 502;
    expect((await other.run({ id: 'web' })).outcome).toBe('pending');
    await act(async () => { await m.complete(); await flush(); });
    expect(await other.isPending({ id: 'web' })).toBe(true);
  });
  it('discard() after this key\'s change is done never frees the same change another page has pending now', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    let status = 200;
    onFetch((c) => (c.method === 'POST' ? { status, body: {} } : { status: 200, body: {} }));
    const other = defineMutation<{ id: string }>(restart, { input, lock: 'core2.sol.src.d2', lockKey });
    const src = coreSource('core2sol2b', { reads: {}, changes: { restart: { route: restart, input, lock: 'core2.sol.src.d2', lockKey } } });
    let m!: ReturnType<typeof src.useMutation<unknown, { id: string }>>;
    harness(() => { m = src.useMutation<unknown, { id: string }>('restart'); return null; });
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ id: 'web' }); await flush(); });
    expect(r.outcome).toBe('done');
    status = 502;
    expect((await other.run({ id: 'web' })).outcome).toBe('pending');
    await act(async () => { await m.discard(); await flush(); });
    expect(await other.isPending({ id: 'web' })).toBe(true);
  });
  it('complete() frees every pending change this mount sent, not only the last', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch(() => ({ status: 502, body: {} }));
    const src = coreSource('core2sol3', { reads: {}, changes: { restart: { route: restart, input } } });
    let m!: ReturnType<typeof src.useMutation<unknown, { id: string }>>;
    harness(() => { m = src.useMutation<unknown, { id: string }>('restart'); return null; });
    await act(async () => { await m.mutateAsync({ id: 'a' }); await m.mutateAsync({ id: 'b' }); await flush(); });
    expect(m.pending).toBe(true);
    await act(async () => { await m.complete(); await flush(); });
    expect(m.pending).toBe(false);
  });
  it('a source read that asks another realm explicitly never proves a change of the shown realm; one of its own realm does', async () => {
    for (const [realm, proved] of [[R2, false], [R1, true]] as const) {
      // A route per run: the first run's change stays held (unproven), and is the same lock under one route.
      const list = defineRoute({ method: 'GET', path: '/core2-sol-src-' + realm, scope: 'agent' });
      const make = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/core2-sol-src-' + realm, scope: 'agent', body: ['x'], idem: true });
      boot({ realm: R1 });
      queryClient.clear();
      // The read fails while the change is sent (its own read-back proves nothing), then answers for Check again.
      let readOk = true;
      onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : readOk ? { status: 200, body: { data: ['done'] } } : { status: 500, body: {} }));
      const src = coreSource('core2sol4' + realm, { reads: { rows: { route: list, input: () => ({ realm }) } }, changes: {
        make: { route: make, input: (v: { x: number }) => ({ body: v }), reads: ['rows'], proves: (_id: unknown, a: readonly (readonly unknown[])[]) => ((a[0] || []).length ? 'applied' as const : undefined) },
      } });
      let m!: ReturnType<typeof src.useMutation<unknown, { x: number }>>;
      harness(() => { m = src.useMutation<unknown, { x: number }>('make'); src.useQuery('rows'); return null; });
      await act(flush);
      readOk = false;
      await act(async () => { await m.mutateAsync({ x: 1 }); await flush(); });
      expect(m.pending).toBe(true);
      readOk = true;
      let ok = !proved;
      await act(async () => { ok = await m.readBack(); await flush(); });
      expect(ok).toBe(proved);
      expect(m.pending).toBe(!proved);
    }
  });
});

describe('heldBy per definition: a source tells its own held change from another page\'s', () => {
  it('src.heldBy(key, h) is self for its own change key and other for a change another page sent under the lock', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch(() => ({ status: 502, body: {} }));
    const route = defineRoute<unknown, { port: number }>({ method: 'POST', path: '/api/v1/daemon/programs/:id/core2held', scope: 'kit', kit: 'daemon', index: 1, body: ['port'], idem: true });
    const input = (v: { id: string }) => ({ params: { id: v.id }, body: {} });
    const lockKey = (v: { id: string }) => ({ id: v.id });
    const keys = coreSource('core2heldkeys', { reads: {}, changes: { add: { route, input, lock: 'core2.src.heldby', lockKey } } });
    const computers = defineMutation<{ id: string }>(route, { input, lock: 'core2.src.heldby', lockKey });
    let m!: ReturnType<typeof keys.useMutation<unknown, { id: string }>>;
    harness(() => { m = keys.useMutation<unknown, { id: string }>('add'); return null; });
    await act(async () => { await m.mutateAsync({ id: 'a' }); await flush(); });
    expect((await computers.run({ id: 'b' })).outcome).toBe('pending');
    const held = heldChanges('core2.src.heldby');
    expect(held).toHaveLength(2);
    const by = (id: string) => held.find((h) => (h.identity as { id: string }).id === id)!;
    expect(keys.heldBy('add', by('a'))).toBe('self');
    expect(keys.heldBy('add', by('b'))).toBe('other');
    expect(computers.heldBy(by('a'))).toBe('other');
    expect(computers.heldBy(by('b'))).toBe('self');
  });
});

describe('a source names another page\'s hold; the scripts editor call shapes; off-page reads', () => {
  const write = defineRoute<unknown, { port: number }>({ method: 'POST', path: '/api/v1/daemon/programs/:id/core2fix2w', scope: 'kit', kit: 'daemon', index: 1, body: ['port'], idem: true });
  const restore = defineRoute<unknown, { port: number }>({ method: 'POST', path: '/api/v1/daemon/programs/:id/core2fix2r', scope: 'kit', kit: 'daemon', index: 1, body: ['port'], idem: true });
  const input = (v: { id: string }) => ({ params: { id: v.id }, body: {} });
  it('shared locks (b): a press under another page\'s hold answers HELD_BY_OTHER with that page (its pageId)', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch(() => ({ status: 502, body: {} }));
    const lockKey = (v: { id: string }) => ({ id: v.id });
    const computers = coreSource('computers', { reads: {}, changes: { w: { route: write, input, lock: 'core2.fix2.src', lockKey } } });
    const keys = defineMutation<{ id: string }>(write, { input, lock: 'core2.fix2.src', lockKey, page: 'keys' });
    let m!: ReturnType<typeof computers.useMutation<unknown, { id: string }>>;
    harness(() => { m = computers.useMutation<unknown, { id: string }>('w'); return null; });
    await act(async () => { await m.mutateAsync({ id: 'a' }); await flush(); });
    const r = await keys.run({ id: 'a' });
    expect(r.error?.code).toBe('HELD_BY_OTHER');
    expect(r.heldFrom).toEqual({ page: 'computers', path: '/computers' });
    expect(heldChanges('core2.fix2.src')[0]!.from).toEqual({ page: 'computers', path: '/computers' });
    expect((await keys.run({ id: 'b' })).outcome).toBe('pending');
    let back!: SourceResult<unknown>;
    await act(async () => { back = await m.mutateAsync({ id: 'b' }); await flush(); });
    expect(back).toMatchObject({ outcome: 'not_sent', code: 'HELD_BY_OTHER', heldFrom: { page: 'keys', path: '/keys' } });
  });
  it('scripts useEditor.ts:85 / NewScript.tsx:232 shape: write.complete() and restore.complete() on an editor that sent no restore never free another editor\'s restore', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    let status = 502;
    onFetch(() => ({ status, body: {} }));
    const src = coreSource('core2fix2ed', { reads: {}, changes: { write: { route: write, input }, restore: { route: restore, input } } });
    let aW!: ReturnType<typeof src.useMutation<unknown, { id: string }>>, aR!: typeof aW, bW!: typeof aW, bR!: typeof aW;
    harness(() => { aW = src.useMutation<unknown, { id: string }>('write'); aR = src.useMutation<unknown, { id: string }>('restore'); return null; });
    harness(() => { bW = src.useMutation<unknown, { id: string }>('write'); bR = src.useMutation<unknown, { id: string }>('restore'); return null; });
    await act(async () => { await aR.mutateAsync({ id: 'f1' }); await flush(); });
    status = 200;
    await act(async () => { await bW.mutateAsync({ id: 'f2' }); await flush(); });
    // Editor B's check: its op settled, so it completes its write and restore (lastRef unset on restore).
    await act(async () => { await bW.complete(); await bR.complete(); await flush(); });
    expect(aR.pending).toBe(true);
    expect(heldChanges('x').length).toBe(0);
    // Editor A's own check frees its restore.
    await act(async () => { await aR.complete(); await aW.complete(); await flush(); });
    expect(aR.pending).toBe(false);
  });
  it('off-page: a source read no page holds is read once for Check again, so its proof can free the change', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const list = defineRoute({ method: 'GET', path: '/core2-fix2-src-off', scope: 'agent' });
    const make = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/core2-fix2-src-off', scope: 'agent', body: ['x'], idem: true });
    let gets = 0;
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : (gets++, { status: 200, body: { data: ['done'] } })));
    const src = coreSource('core2fix2off', { reads: { ended: { route: list } }, changes: {
      make: { route: make, input: (v: { x: number }) => ({ body: v }), reads: ['ended'], proves: (_id: unknown, a: readonly (readonly unknown[])[]) => ((a[0] || []).length ? 'applied' as const : undefined) },
    } });
    let m!: ReturnType<typeof src.useMutation<unknown, { x: number }>>;
    harness(() => { m = src.useMutation<unknown, { x: number }>('make'); return null; });
    await act(async () => { await m.mutateAsync({ x: 1 }); await flush(); });
    let ok = false;
    await act(async () => { ok = await m.readBack(); await flush(); });
    expect(gets).toBeGreaterThan(0);
    expect(ok).toBe(true);
    expect(m.pending).toBe(false);
  });
});

describe('a source\'s explicit-variable frees refuse another page\'s hold', () => {
  const w = defineRoute<unknown, { port: number }>({ method: 'POST', path: '/api/v1/daemon/programs/:id/core2fix2v', scope: 'kit', kit: 'daemon', index: 1, body: ['port'], idem: true });
  const input = (v: { id: string }) => ({ params: { id: v.id }, body: {} });
  it('complete/discard/settle(vars) on another page\'s change free nothing, its key kept; heldByOther names the page', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch(() => ({ status: 502, body: {} }));
    const lockKey = (v: { id: string }) => ({ id: v.id });
    const programs = defineMutation<{ id: string }>(w, { input, lock: 'core2.fix2.srcvars', lockKey, page: 'programs' });
    const computers = coreSource('computers', { reads: {}, changes: { w: { route: w, input, lock: 'core2.fix2.srcvars', lockKey } } });
    let m!: ReturnType<typeof computers.useMutation<unknown, { id: string }>>;
    harness(() => { m = computers.useMutation<unknown, { id: string }>('w'); return null; });
    const first = await programs.run({ id: 'a' });
    expect(first.outcome).toBe('pending');
    const held = { outcome: 'not_sent', code: 'HELD_BY_OTHER', heldFrom: { page: 'programs', path: '/programs' } };
    let got: unknown[] = [];
    await act(async () => { await m.complete({ id: 'a' }, (await m.holdOf({ id: 'a' }))!); await m.discard({ id: 'a' }, (await m.holdOf({ id: 'a' }))!); await m.settle({ id: 'a' }, (await m.holdOf({ id: 'a' }))!); got = [await m.heldByOther({ id: 'a' })]; await flush(); });
    expect(got).toEqual([held]);
    expect(await programs.isPending({ id: 'a' })).toBe(true);
    await programs.settle({ id: 'a' }, (await programs.holdOf({ id: 'a' }))!);
    await act(async () => { await m.discard({ id: 'a' }, (await m.holdOf({ id: 'a' }))!); got = [await m.heldByOther({ id: 'a' })]; await flush(); });
    expect(got).toEqual([held]);
    expect((await programs.run({ id: 'a' })).idem).toBe(first.idem);
  });
});

describe('an off-page read that does not answer is skipped, never a failed read-back', () => {
  it('a mounted read proves the change; a second declared read no page holds answers 502: Check again still frees it', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const status = defineRoute({ method: 'GET', path: '/core2-fix2-offfail-status', scope: 'agent' });
    const ended = defineRoute({ method: 'GET', path: '/core2-fix2-offfail-ended', scope: 'agent' });
    const make = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/core2-fix2-offfail', scope: 'agent', body: ['x'], idem: true });
    let endedGets = 0;
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : c.url.includes('offfail-ended') ? (endedGets++, { status: 502, body: {} }) : { status: 200, body: { data: ['off'] } }));
    const src = coreSource('core2fix2offfail', { reads: { status: { route: status }, ended: { route: ended } }, changes: {
      make: { route: make, input: (v: { x: number }) => ({ body: v }), reads: ['status', 'ended'], proves: (_id: unknown, a: readonly (readonly unknown[])[]) => ((a[0] || []).length ? 'applied' as const : undefined) },
    } });
    let m!: ReturnType<typeof src.useMutation<unknown, { x: number }>>;
    harness(() => { src.useQuery('status'); m = src.useMutation<unknown, { x: number }>('make'); return null; });
    await act(async () => { await flush(); });
    await act(async () => { await m.mutateAsync({ x: 1 }); await flush(); });
    let ok = false;
    await act(async () => { ok = await m.readBack(); await flush(); });
    expect(endedGets).toBeGreaterThan(0);
    expect(ok).toBe(true);
    expect(m.pending).toBe(false);
  });
});
