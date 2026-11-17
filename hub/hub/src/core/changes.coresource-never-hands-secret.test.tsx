// While a change is out, and after it settles, the TanStack mutation cache holds
// none of its variables or input (they may hold a secret). coreSource keeps `variables` for routes that declare no
// secret; defineMutation hands TanStack only a number.
import { QueryClientProvider, type UseMutationResult } from '@tanstack/react-query';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineMutation, queryClient } from './query';
import { defineRoute } from './routes';
import { coreSource, type SourceError, type SourceMutation, type SourceResult } from './source';
import { boot, onFetch, R1, settle } from './test/env';

const SECRET = 'planted-secret-sec2-Zr8';
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }
const cached = (): string => JSON.stringify(queryClient.getMutationCache().getAll().map((x) => [x.state.variables, x.options.mutationKey]));
/** A reply that waits until `open()`: the send stays out meanwhile. */
function gate(): { open: () => void; wait: Promise<void> } {
  let open!: () => void;
  const wait = new Promise<void>((r) => { open = r; });
  return { open, wait };
}

describe('coreSource never hands a secret route\'s variables or input to TanStack', () => {
  let g: ReturnType<typeof gate>;
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); g = gate(); onFetch(async (c) => { if (c.method !== 'GET') await g.wait; return c.method === 'GET' ? { status: 200, body: { data: [] } } : { status: 200, body: { ok: true } }; }); });
  afterEach(() => { cleanup(); });
  type V = { name: string; token: string };
  const put = defineRoute<unknown, V>({ method: 'POST', path: '/sec2/src', scope: 'agent', body: ['name', 'token'], secret: ['token'] });
  const plain = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/sec2/plain', scope: 'agent', body: ['name'] });
  const src = coreSource('sec2-src', { reads: {}, changes: {
    put: { route: put, lock: 'sec2.put', lockKey: (v: V) => ({ name: v.name }), input: (v: V) => ({ body: v }) },
    plain: { route: plain, input: (v: { name: string }) => ({ body: v }) },
  } });
  it('while the send is out and after it settles, nothing of the secret is in the mutation cache; the result arrives', async () => {
    let last!: UseMutationResult<SourceResult<unknown>, SourceError, V> & SourceMutation<unknown, V>;
    function Probe() { last = src.useMutation<unknown, V>('put') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    let going!: Promise<SourceResult<unknown>>;
    await act(async () => { going = last.mutateAsync({ name: 'a', token: SECRET }); await flush(); });
    expect(last.isPending).toBe(true); // the send is out
    expect(cached()).not.toContain(SECRET);
    expect(last.variables).toBeUndefined();
    let r!: SourceResult<unknown>;
    await act(async () => { g.open(); r = await going; await flush(); });
    expect(r.outcome).toBe('done');
    expect(cached()).not.toContain(SECRET);
  });
  it('a route with no secret keeps `variables` for the page', async () => {
    let last!: UseMutationResult<SourceResult<unknown>, SourceError, { name: string }> & SourceMutation<unknown, { name: string }>;
    function Probe() { last = src.useMutation<unknown, { name: string }>('plain') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { last.mutate({ name: 'shown-name' }); await flush(); });
    expect(last.variables).toEqual({ name: 'shown-name' });
    await act(async () => { g.open(); await flush(); });
  });
});

describe('defineMutation never hands its press to TanStack, even while the send is out', () => {
  let g: ReturnType<typeof gate>;
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); g = gate(); onFetch(async () => { await g.wait; return { status: 200, body: { ok: true } }; }); });
  afterEach(() => { cleanup(); });
  const route = defineRoute<unknown, { password: string }>({ method: 'POST', path: '/sec2/pw', scope: 'base', body: ['password'], secret: true });
  const m = defineMutation<{ password: string }>(route, { input: (v) => ({ body: v }), lock: 'sec2.pw', lockKey: () => 'pw' });
  it('the run is out: the cache holds no secret; after it settles the answer is on the hook', async () => {
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    let going!: Promise<unknown>;
    await act(async () => { going = result.current.run({ password: SECRET }); await flush(); });
    expect(result.current.running).toBe(true); // the send is out
    expect(cached()).not.toContain(SECRET);
    await act(async () => { g.open(); await going; await flush(); });
    expect(result.current.outcome).toBe('done');
    expect(cached()).not.toContain(SECRET);
  });
});
