// Secret-handling cases. A change that may carry a secret never puts
// its variables in TanStack's MutationCache, the press handed to a send never outlives it (a rejection before
// mutationFn, an offline browser), and a send on a lock shared with useLockedChange still clears a key kept for
// other bytes.
import { onlineManager, QueryClientProvider, type UseMutationResult } from '@tanstack/react-query';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from './api';
import { useLockedChange, type LockedChange } from './locked';
import { defineMutation, queryClient } from './query';
import { defineRoute, type Route } from './routes';
import { coreSource, type SourceError, type SourceMutation, type SourceResult } from './source';
import { boot, calls, onFetch, R1, settle, microFlush } from './test/env';

const SECRET = 'planted-secret-sec2s-Kd4';
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }
/** A press's answer, or 'hung' when it does not settle within a flush (a paused mutation never does). */
const within = <T,>(p: Promise<T>): Promise<T | 'hung'> => Promise.race([p, flush().then(() => 'hung' as const)]);
/** Everything TanStack keeps of each mutation that could carry variables. */
const cached = (): string => JSON.stringify(queryClient.getMutationCache().getAll().map((x) => [x.state.variables, x.state.context, x.options.mutationKey, x.meta]));
const posts = (): number => calls.filter((c) => c.method !== 'GET').length;
type Hook<V> = UseMutationResult<SourceResult<unknown>, SourceError, V> & SourceMutation<unknown, V>;

// The handoff maps (source.ts and query.ts `sends`) are private: every Map a number-keyed press entry ({p, ...})
// is put into is recorded, so a test reads how many presses are still held, and what they hold.
const tracked: Map<unknown, unknown>[] = [];
const realSet = Map.prototype.set;
function track(): void {
  tracked.length = 0;
  Map.prototype.set = function (this: Map<unknown, unknown>, k: unknown, v: unknown) {
    if (typeof k === 'number' && v !== null && typeof v === 'object' && 'p' in v && !tracked.includes(this)) tracked.push(this);
    return realSet.call(this, k, v) as Map<unknown, unknown>;
  } as typeof Map.prototype.set;
}
const held = (): number => tracked.reduce((a, m) => a + m.size, 0);
const defaults = queryClient.getDefaultOptions();

beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); track(); onlineManager.setOnline(true); });
afterEach(() => { cleanup(); Map.prototype.set = realSet; onlineManager.setOnline(true); queryClient.setDefaultOptions(defaults); });

const ok = (c: { method: string }) => (c.method === 'GET' ? { status: 200, body: { data: [] } } : { status: 200, body: { ok: true } });

describe('coreSource hands TanStack no variables of a change that may carry a secret', () => {
  it('s1a: a text-body route (secret false): the text is never in the cache or on `variables`, while out and after', async () => {
    const textRoute = ({ ...defineRoute({ method: 'PUT', path: '/s/text', scope: 'agent' }), bodyText: true }) as Route;
    expect(textRoute.secret).toBe(false);
    let open!: () => void;
    const wait = new Promise<void>((r) => { open = r; });
    onFetch(async (c) => { if (c.method !== 'GET') await wait; return ok(c); });
    const src = coreSource('s-text', { reads: {}, changes: { put: { route: textRoute, lock: 's.text', lockKey: () => 'raw', input: (v: string) => ({ body: v as never }) } } });
    let last!: Hook<string>;
    function Probe() { last = src.useMutation<unknown, string>('put') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    let going!: Promise<unknown>;
    await act(async () => { going = last.mutateAsync(SECRET).catch(() => undefined); await flush(); });
    expect(cached()).not.toContain(SECRET);
    expect(last.variables).toBeUndefined();
    await act(async () => { open(); await going; await flush(); });
    expect(cached()).not.toContain(SECRET);
    expect(last.variables).toBeUndefined();
  });
  it('s1b: a lockKey route that declares no secret: its variables are never in the cache, while out and after', async () => {
    const r = defineRoute<unknown, { code: string }>({ method: 'POST', path: '/s/code', scope: 'base', body: ['code'] });
    expect(r.secret).toBe(false);
    let open!: () => void;
    const wait = new Promise<void>((res) => { open = res; });
    onFetch(async (c) => { if (c.method !== 'GET') await wait; return ok(c); });
    const src = coreSource('s-code', { reads: {}, changes: { go: { route: r, lock: 's.code', lockKey: () => 'code', input: (v: { code: string }) => ({ body: v }) } } });
    let last!: Hook<{ code: string }>;
    function Probe() { last = src.useMutation<unknown, { code: string }>('go') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    let going!: Promise<unknown>;
    await act(async () => { going = last.mutateAsync({ code: SECRET }); await flush(); });
    expect(cached()).not.toContain(SECRET);
    await act(async () => { open(); await going; await flush(); });
    expect(cached()).not.toContain(SECRET);
    expect(last.variables).toBeUndefined();
  });
  it('s1c (control): a route with no lockKey, no secret and no text body keeps its `variables`, after it settles too', async () => {
    const r = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/s/plain', scope: 'agent', body: ['name'] });
    onFetch(async (c) => ok(c));
    const src = coreSource('s-plain', { reads: {}, changes: { go: { route: r, input: (v: { name: string }) => ({ body: v }) } } });
    let last!: Hook<{ name: string }>;
    function Probe() { last = src.useMutation<unknown, { name: string }>('go') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await last.mutateAsync({ name: 'n1' }); await flush(); });
    expect(last.variables).toEqual({ name: 'n1' });
    expect(last.status).toBe('success');
  });
});

describe('the press handed to a send never outlives it', () => {
  const r = defineRoute<unknown, { code: string }>({ method: 'POST', path: '/s/pre', scope: 'agent', body: ['code'], secret: ['code'] });
  const mk = (name: string) => coreSource(name, { reads: {}, changes: { go: { route: r, lock: name, lockKey: () => 'k', input: (v: { code: string }) => ({ body: v }) } } });
  const throwing = () => queryClient.setDefaultOptions({ ...defaults, mutations: { ...defaults.mutations, onMutate: () => { throw new Error('boom'); } } });

  it('s2a: coreSource, onMutate throws before mutationFn: nothing is sent and no press is held (mutateAsync and mutate)', async () => {
    onFetch(async (c) => ok(c));
    throwing();
    const src = mk('s-pre-src');
    let last!: Hook<{ code: string }>;
    function Probe() { last = src.useMutation<unknown, { code: string }>('go') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    let how = '';
    await act(async () => { how = await last.mutateAsync({ code: SECRET }).then(() => 'ok', () => 'rejected'); await flush(); });
    expect(how).toBe('rejected');
    expect(tracked.length).toBe(1);
    expect(held()).toBe(0);
    let seen: unknown;
    await act(async () => { last.mutate({ code: SECRET }, { onError: (e) => { seen = e; } }); await flush(); });
    expect(seen).toBeInstanceOf(Error);
    expect(posts()).toBe(0);
    expect(held()).toBe(0);
  });
  it('s2b: offline (TanStack would pause before mutationFn): a coreSource press is guarded at once, a second is refused BUSY, and no press outlives its send', async () => {
    let open!: () => void;
    const wait = new Promise<void>((res) => { open = res; });
    onFetch(async (c) => { if (c.method !== 'GET') await wait; return ok(c); });
    const src = mk('s-off-src');
    let last!: Hook<{ code: string }>;
    function Probe() { last = src.useMutation<unknown, { code: string }>('go') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    await flush();
    onlineManager.setOnline(false);
    let first!: Promise<SourceResult<unknown>>, second!: unknown;
    await act(async () => { first = last.mutateAsync({ code: SECRET }); await flush(); second = await within(last.mutateAsync({ code: SECRET })); });
    expect(queryClient.getMutationCache().getAll().filter((x) => x.state.isPaused)).toHaveLength(0);
    expect(posts()).toBe(1);
    expect(second).toMatchObject({ outcome: 'not_sent', code: 'BUSY' });
    expect(held()).toBe(1);
    await act(async () => { open(); await within(first); });
    expect(held()).toBe(0);
  });
  it('s2c: offline: defineMutation run() is guarded at once, a second press is refused BUSY, and both settle', async () => {
    let open!: () => void;
    const wait = new Promise<void>((res) => { open = res; });
    onFetch(async (c) => { if (c.method !== 'GET') await wait; return ok(c); });
    const m = defineMutation<{ code: string }>(r, { input: (v) => ({ body: v }), lock: 's-off-def', lockKey: () => 'k' });
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    onlineManager.setOnline(false);
    let first!: Promise<unknown>, second!: unknown;
    await act(async () => { first = result.current.run({ code: SECRET }); await flush(); second = await within(result.current.run({ code: SECRET })); });
    expect(posts()).toBe(1);
    expect(second).toMatchObject({ outcome: 'not_sent', error: { code: 'BUSY' } });
    let settled: unknown;
    await act(async () => { open(); settled = await within(first); });
    expect(settled).not.toBe('hung');
    expect(held()).toBe(0);
  });
});

describe('a send on a lock shared with useLockedChange clears a key kept for other bytes', () => {
  const rt = defineRoute<unknown, { code: string }>({ method: 'POST', path: '/s/redeem', scope: 'base', body: ['code'] });
  let status = 502;
  beforeEach(() => { status = 502; onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: [] } } : { status, body: {} })); });
  function home(lock: string): () => LockedChange<{ code: string }, unknown> {
    let ch!: LockedChange<{ code: string }, unknown>;
    function Probe() { ch = useLockedChange((v, _i, ctx) => api(rt, { body: v, ctx }), [], 'home.redeem.' + lock, { lock, lockKey: () => 'invite', route: rt, page: 'home' }); return null; }
    render(<Probe />, { wrapper: wrap });
    return () => ch;
  }
  async function keptKey(cur: () => LockedChange<{ code: string }, unknown>): Promise<void> {
    expect(rt.idem).toBeFalsy();
    let r1!: { outcome: string };
    await act(async () => { r1 = await cur().run({ code: 'AAAA' }); await flush(); });
    expect(r1.outcome).toBe('pending');
    await act(async () => { cur().dismiss(); await microFlush(); });
    expect(cur().state).toBe('free');
    status = 400;
  }
  it('s3a: defineMutation on a non-idempotent route: a definite 400 for other variables is failed, never pending', async () => {
    const lock = 's.redeem.def';
    const cur = home(lock);
    const m = defineMutation<{ code: string }>(rt, { input: (v) => ({ body: v }), lock, lockKey: () => 'invite', page: 'computers' });
    await keptKey(cur);
    let r2!: { outcome: string };
    await act(async () => { r2 = await m.run({ code: 'BBBB' }); await flush(); });
    expect(r2.outcome).toBe('failed');
    expect(cur().state).toBe('free');
  });
  it('s3b: coreSource on a non-idempotent route: the same', async () => {
    const lock = 's.redeem.src';
    const cur = home(lock);
    const src = coreSource('s-redeem-src', { reads: {}, changes: { go: { route: rt, lock, lockKey: () => 'invite', input: (v: { code: string }) => ({ body: v }) } } });
    let last!: Hook<{ code: string }>;
    function Probe() { last = src.useMutation<unknown, { code: string }>('go') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    await keptKey(cur);
    let r2!: SourceResult<unknown>;
    await act(async () => { r2 = await last.mutateAsync({ code: 'BBBB' }); await flush(); });
    expect(r2.outcome).toBe('failed');
    expect(cur().state).toBe('free');
  });
});
