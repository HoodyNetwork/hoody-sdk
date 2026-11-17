// Two C9 gaps of acrossRealms locks:
// (1) a refused repeat press reads back in the realm the held send was made in, never the press's realm: a remove
//     whose proof is "the computer is absent" must not be proved by a realm view that never listed it;
// (2) a hold filed under the old realm-scoped id (sent before the definition turned acrossRealms) still holds
//     after the switch: never sent again, never freed without fresh proof.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './changes';
import { setRealm } from './ctx';
import { defineMutation, defineQuery, queryClient } from './query';
import { defineRoute } from './routes';
import { coreSource, type SourceResult } from './source';
import { boot, calls, onFetch, R1, R2, settle } from './test/env';
import type * as Q from './query';
import type * as Routes from './routes';
import type * as Env from './test/env';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const list = defineRoute<{ data: string[] }>({ method: 'GET', path: '/ar-gap/containers', scope: 'realm' });
const remove = defineRoute<unknown>({ method: 'DELETE', path: '/ar-gap/containers/:id', scope: 'realm' });
const containers = defineQuery(list, { select: (r) => r.data });
/** The remove went through when the computer (the lockKey value) is no longer listed; still listed proves nothing. */
const absent = (identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined => {
  const id = identity as string;
  const shown = answers[0]?.[0] as string[] | undefined;
  return shown && !shown.includes(id) ? 'applied' : undefined;
};
const deletes = (): number => calls.filter((c) => c.method === 'DELETE').length;
const gets = (): number => calls.filter((c) => c.method === 'GET').length;

// c9 is listed in R1 only: R2's view never shows it, so R2's list proves nothing about it.
function serve(): void {
  onFetch((c) => {
    if (c.method === 'DELETE') return { status: 502, body: {} };
    return { status: 200, body: { data: c.url.includes(R1) ? ['c9'] : [] } };
  });
}
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }

beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); serve(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('acrossRealms gap 1: a refused press reads back in the held send\'s realm', () => {
  it('defineMutation: a remove pending from R1, pressed again in R2, stays held (R2\'s list never showed it)', async () => {
    const m = defineMutation<{ id: string }>(remove, { input: (v) => ({ params: { id: v.id } }), lockKey: (v) => v.id, reads: [containers], proves: absent, lock: 'ar-gap.q', acrossRealms: true });
    // The definition's run(): a refused press re-reads (query.ts run).
    expect((await m.run({ id: 'c9' })).outcome).toBe('pending');
    setRealm(R2);
    await flush();
    const read = gets();
    const again = await m.run({ id: 'c9' });
    await flush();
    expect(again.outcome).toBe('not_sent');
    expect(again.error?.code).toBe('READ_BACK_FIRST');
    // Not read back in R2 (the read-back is the held send's realm, R1, which is not shown).
    expect(gets()).toBe(read);
    expect(C.heldChanges('ar-gap.q')).toHaveLength(1);
    expect(deletes()).toBe(1);
  });
  it('defineMutation: back in R1 the same refused press reads back there and the absent proof frees it', async () => {
    const m = defineMutation<{ id: string }>(remove, { input: (v) => ({ params: { id: v.id } }), lockKey: (v) => v.id, reads: [containers], proves: absent, lock: 'ar-gap.q2', acrossRealms: true });
    let listed = true;
    onFetch((c) => (c.method === 'DELETE' ? { status: 502, body: {} } : { status: 200, body: { data: c.url.includes(R1) && listed ? ['c9'] : [] } }));
    await m.run({ id: 'c9' });
    listed = false; // the remove went through
    expect((await m.run({ id: 'c9' })).error?.code).toBe('READ_BACK_FIRST');
    await flush();
    expect(C.heldChanges('ar-gap.q2')).toEqual([]);
    expect(deletes()).toBe(1);
  });
  it('coreSource: a remove pending from R1, pressed again in R2, stays held', async () => {
    const table = { reads: { list: { route: list, select: (r: unknown) => (r as { data: string[] }).data } }, changes: { remove: { route: remove, lock: 'ar-gap.s', acrossRealms: true, input: (v: { id: string }) => ({ params: { id: v.id } }), lockKey: (v: { id: string }) => v.id, reads: ['list'], proves: absent } } };
    const src = coreSource('ar-gap-src', table);
    let last!: { mutateAsync: (v: { id: string }) => Promise<SourceResult<unknown>> };
    function Probe() { last = src.useMutation<unknown, { id: string }>('remove') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    let r!: SourceResult<unknown>;
    await act(async () => { r = await last.mutateAsync({ id: 'c9' }); await flush(); });
    expect(r.outcome).toBe('pending');
    await act(async () => { setRealm(R2); });
    await act(async () => { await flush(); });
    const read = gets();
    await act(async () => { r = await last.mutateAsync({ id: 'c9' }); await flush(); });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(gets()).toBe(read);
    expect(C.heldChanges('ar-gap.s')).toHaveLength(1);
    expect(deletes()).toBe(1);
  });
});

// A deploy: the page reloads with the definition turned acrossRealms. Another module graph on the same storage.
async function afterDeploy(): Promise<{ C: typeof C; query: typeof Q; routes: typeof Routes; env: typeof Env }> {
  const saved: Array<[string, string]> = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; saved.push([k, localStorage.getItem(k)!]); }
  vi.resetModules();
  const env = await import('./test/env');
  env.boot({ realm: R1 });
  for (const [k, v] of saved) localStorage.setItem(k, v);
  const C2 = await import('./changes');
  C2.reloadChangesForTests();
  return { C: C2, query: await import('./query'), routes: await import('./routes'), env };
}

describe('acrossRealms gap 2: a hold filed under the old realm-scoped id still holds after the switch', () => {
  it('a remove pending before the deploy is refused after it (never sent twice) and shown as held', async () => {
    const before = defineMutation<{ id: string }>(remove, { input: (v) => ({ params: { id: v.id } }), lockKey: (v) => v.id, lock: 'ar-gap.legacy' });
    const { result } = renderHook(() => before.use(), { wrapper: wrap });
    await act(async () => { expect((await result.current.run({ id: 'c9' })).outcome).toBe('pending'); });
    cleanup();
    const { C: C2, query, routes, env } = await afterDeploy();
    env.onFetch((c) => (c.method === 'DELETE' ? { status: 502, body: {} } : { status: 200, body: { data: ['c9'] } }));
    const remove2 = routes.defineRoute<unknown>({ method: 'DELETE', path: '/ar-gap/containers/:id', scope: 'realm' });
    const after = query.defineMutation<{ id: string }>(remove2, { input: (v) => ({ params: { id: v.id } }), lockKey: (v) => v.id, lock: 'ar-gap.legacy', acrossRealms: true });
    const res = await after.run({ id: 'c9' });
    expect(res.outcome).toBe('not_sent');
    expect(env.calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
    expect(await after.isPending({ id: 'c9' })).toBe(true);
    expect(C2.heldChanges('ar-gap.legacy')).toHaveLength(1);
    // holdOf names the legacy hold (the token a warned Dismiss needs).
    expect(await after.holdOf({ id: 'c9' })).toBeTruthy();
  });
  it('a legacy hold another tab stored after this one loaded is still refused, under the store lock', async () => {
    const before = defineMutation<{ id: string }>(remove, { input: (v) => ({ params: { id: v.id } }), lockKey: (v) => v.id, lock: 'ar-gap.legacy3' });
    await before.run({ id: 'c9' });
    const { C: C2, query, routes, env } = await afterDeploy();
    env.onFetch((c) => (c.method === 'DELETE' ? { status: 502, body: {} } : { status: 200, body: { data: ['c9'] } }));
    C2.resetChanges(); // the registry never saw it: only the stored record (read under the lock) holds it
    const remove2 = routes.defineRoute<unknown>({ method: 'DELETE', path: '/ar-gap/containers/:id', scope: 'realm' });
    const after = query.defineMutation<{ id: string }>(remove2, { input: (v) => ({ params: { id: v.id } }), lockKey: (v) => v.id, lock: 'ar-gap.legacy3', acrossRealms: true });
    const res = await after.run({ id: 'c9' });
    expect(res).toMatchObject({ outcome: 'not_sent', error: { code: 'READ_BACK_FIRST' } });
    expect(env.calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
  });
  it('an agent route: the hold filed under <base>@<realm>#<computer> holds after the switch, in another realm view too', async () => {
    const act1 = defineRoute<unknown, { op: string }>({ method: 'POST', path: '/ar-gap/agent-op', scope: 'agent', body: ['op'], idem: true });
    const before = defineMutation<{ op: string }>(act1, { input: (v) => ({ body: v }), lock: 'ar-gap.agent' });
    onFetch(() => ({ status: 502, body: {} }));
    expect((await before.run({ op: 'stop' })).outcome).toBe('pending');
    const { C: C2, query, routes, env } = await afterDeploy();
    env.onFetch(() => ({ status: 502, body: {} }));
    const act2 = routes.defineRoute<unknown, { op: string }>({ method: 'POST', path: '/ar-gap/agent-op', scope: 'agent', body: ['op'], idem: true });
    const after = query.defineMutation<{ op: string }>(act2, { input: (v) => ({ body: v }), lock: 'ar-gap.agent', acrossRealms: true });
    const ctx = await import('./ctx');
    ctx.setRealm(R2);
    const res = await after.run({ op: 'stop' });
    expect(res.outcome).toBe('not_sent');
    expect(env.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    expect(C2.heldChanges('ar-gap.agent', { realm: null })).toHaveLength(1);
    // Shown in R2's view too: the definition declared its base across realms.
    expect(C2.heldChanges('ar-gap.agent', { realm: R2 })).toHaveLength(1);
  });
  it('a read-back with no proof keeps the legacy hold; one that proves it frees it', async () => {
    const before = defineMutation<{ id: string }>(remove, { input: (v) => ({ params: { id: v.id } }), lockKey: (v) => v.id, lock: 'ar-gap.legacy2' });
    const { result } = renderHook(() => before.use(), { wrapper: wrap });
    await act(async () => { await result.current.run({ id: 'c9' }); });
    cleanup();
    const { C: C2, query, routes, env } = await afterDeploy();
    let listed = true;
    env.onFetch((c) => (c.method === 'DELETE' ? { status: 502, body: {} } : { status: 200, body: { data: listed ? ['c9'] : [] } }));
    const list2 = routes.defineRoute<{ data: string[] }>({ method: 'GET', path: '/ar-gap/containers', scope: 'realm' });
    const remove2 = routes.defineRoute<unknown>({ method: 'DELETE', path: '/ar-gap/containers/:id', scope: 'realm' });
    const q2 = query.defineQuery(list2, { select: (r) => r.data });
    const after = query.defineMutation<{ id: string }>(remove2, { input: (v) => ({ params: { id: v.id } }), lockKey: (v) => v.id, lock: 'ar-gap.legacy2', acrossRealms: true, reads: [q2], proves: absent });
    expect(await after.readBack({ id: 'c9' })).toBe(false);
    expect(C2.heldChanges('ar-gap.legacy2')).toHaveLength(1);
    listed = false;
    expect(await after.readBack({ id: 'c9' })).toBe(true);
    expect(C2.heldChanges('ar-gap.legacy2')).toEqual([]);
  });
  it('a refused press after the deploy reads the legacy hold back in its own realm, and a proof frees it', async () => {
    const before = defineMutation<{ id: string }>(remove, { input: (v) => ({ params: { id: v.id } }), lockKey: (v) => v.id, lock: 'ar-gap.legacy4' });
    await before.run({ id: 'c9' });
    const { C: C2, query, routes, env } = await afterDeploy();
    let listed = true;
    env.onFetch((c) => (c.method === 'DELETE' ? { status: 502, body: {} } : { status: 200, body: { data: c.url.includes(R1) && listed ? ['c9'] : [] } }));
    const list2 = routes.defineRoute<{ data: string[] }>({ method: 'GET', path: '/ar-gap/containers', scope: 'realm' });
    const remove2 = routes.defineRoute<unknown>({ method: 'DELETE', path: '/ar-gap/containers/:id', scope: 'realm' });
    const q2 = query.defineQuery(list2, { select: (r) => r.data });
    const after = query.defineMutation<{ id: string }>(remove2, { input: (v) => ({ params: { id: v.id } }), lockKey: (v) => v.id, lock: 'ar-gap.legacy4', acrossRealms: true, reads: [q2], proves: absent });
    const ctx = await import('./ctx');
    ctx.setRealm(R2); // R2 never listed c9: a refused press here reads nothing
    await after.run({ id: 'c9' });
    await env.settle(60);
    expect(C2.heldChanges('ar-gap.legacy4', { realm: null })).toHaveLength(1);
    ctx.setRealm(R1);
    listed = false;
    expect((await after.run({ id: 'c9' })).error?.code).toBe('READ_BACK_FIRST');
    await env.settle(60);
    expect(C2.heldChanges('ar-gap.legacy4', { realm: null })).toEqual([]);
    expect(env.calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
  });
  it('another identity of the same lock is not held by the legacy hold: it is sent', async () => {
    const before = defineMutation<{ id: string }>(remove, { input: (v) => ({ params: { id: v.id } }), lockKey: (v) => v.id, lock: 'ar-gap.legacy5' });
    await before.run({ id: 'c9' });
    const { query, routes, env } = await afterDeploy();
    env.onFetch((c) => (c.method === 'DELETE' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    const remove2 = routes.defineRoute<unknown>({ method: 'DELETE', path: '/ar-gap/containers/:id', scope: 'realm' });
    const after = query.defineMutation<{ id: string }>(remove2, { input: (v) => ({ params: { id: v.id } }), lockKey: (v) => v.id, lock: 'ar-gap.legacy5', acrossRealms: true });
    expect((await after.run({ id: 'c8' })).outcome).toBe('pending');
    expect(env.calls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual([expect.stringContaining('/ar-gap/containers/c8')]);
  });
  it('coreSource: a legacy hold is refused after the deploy too (never sent twice)', async () => {
    const tableOf = (rm: typeof remove, across: boolean) => ({ changes: { remove: { route: rm, lock: 'ar-gap.legacy-src', ...(across ? { acrossRealms: true } : {}), input: (v: { id: string }) => ({ params: { id: v.id } }), lockKey: (v: { id: string }) => v.id } } });
    const src = coreSource('ar-gap-legacy-src', tableOf(remove, false));
    let last!: { mutateAsync: (v: { id: string }) => Promise<SourceResult<unknown>> };
    function Probe() { last = src.useMutation<unknown, { id: string }>('remove') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    let r!: SourceResult<unknown>;
    await act(async () => { r = await last.mutateAsync({ id: 'c9' }); await flush(); });
    expect(r.outcome).toBe('pending');
    cleanup();
    const { routes, env } = await afterDeploy();
    env.onFetch(() => ({ status: 502, body: {} }));
    const S2 = await import('./source');
    const Q2 = await import('./query');
    const remove2 = routes.defineRoute<unknown>({ method: 'DELETE', path: '/ar-gap/containers/:id', scope: 'realm' });
    const src2 = S2.coreSource('ar-gap-legacy-src', tableOf(remove2 as typeof remove, true));
    let last2!: { mutateAsync: (v: { id: string }) => Promise<SourceResult<unknown>> };
    function Probe2() { last2 = src2.useMutation<unknown, { id: string }>('remove') as never; return null; }
    const wrap2 = ({ children }: { children: ReactNode }) => <QueryClientProvider client={Q2.queryClient}>{children}</QueryClientProvider>;
    render(<Probe2 />, { wrapper: wrap2 });
    await act(async () => { r = await last2.mutateAsync({ id: 'c9' }); await env.settle(40); });
    expect(r.outcome).toBe('not_sent');
    expect(env.calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
  });
});
