// A lock base filed both ways (realm-scoped, and across realms) across builds.
// Each test runs one or more module graphs on the same storage: a graph is a build of the page (a deploy, a
// rollback, or another tab of an older or newer build), its definition acrossRealms or not.
//  - either filing honours the other's hold, whichever sent first (both mixed-version orders);
//  - sendingChanges shows a realm-scoped send of an across base in every realm view;
//  - the hooks count a hold filed the other way as pending (a remount, before any press);
//  - holdOf names the pending hold that refuses a press, never a released record keeping its key;
//  - a hold of another lock base whose name looks like a realm-scoped id never refuses;
//  - a11/a12: a definition that is not across realms, and a released across hold, told apart.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, R1, R2 } from './test/env';
import type * as C from './changes';
import type * as Ctx from './ctx';
import type * as Q from './query';
import type * as Routes from './routes';
import type * as S from './source';
import type * as Env from './test/env';

type G = { C: typeof C; query: typeof Q; routes: typeof Routes; env: typeof Env; ctx: typeof Ctx; source: typeof S };
type Vars = { id: string };

/** A new build of the page on the same storage (a deploy, a rollback, another tab): its own module graph. */
async function graph(): Promise<G> {
  const saved: Array<[string, string]> = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; saved.push([k, localStorage.getItem(k)!]); }
  vi.resetModules();
  const env = await import('./test/env');
  env.boot({ realm: R1 });
  for (const [k, v] of saved) localStorage.setItem(k, v);
  const C2 = await import('./changes');
  C2.reloadChangesForTests();
  return { C: C2, query: await import('./query'), routes: await import('./routes'), env, ctx: await import('./ctx'), source: await import('./source') };
}
const deletes = (g: G): number => g.env.calls.filter((c) => c.method === 'DELETE').length;
/** The remove of a computer (a realm route), locked by its id, filed across realms or not. */
function removeOf(g: G, lock: string, across: boolean) {
  const rt = g.routes.defineRoute<unknown>({ method: 'DELETE', path: '/ar2/containers/:id', scope: 'realm' });
  return g.query.defineMutation<Vars>(rt, { input: (v) => ({ params: { id: v.id } }), lockKey: (v) => v.id, lock, ...(across ? { acrossRealms: true } : {}) });
}
/** The same on an agent route taking a key (only agent and kit routes do), so a released send keeps its key. */
function keyedOf(g: G, lock: string, across: boolean) {
  const rt = g.routes.defineRoute<unknown>({ method: 'DELETE', path: '/ar2/agent-c/:id', scope: 'agent', idem: true });
  return g.query.defineMutation<Vars>(rt, { input: (v) => ({ params: { id: v.id } }), lockKey: (v) => v.id, lock, ...(across ? { acrossRealms: true } : {}) });
}
const fail502 = (g: G): void => g.env.onFetch(() => ({ status: 502, body: {} }));
const wrapOf = (g: G) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={g.query.queryClient}>{children}</QueryClientProvider>;

beforeEach(() => { boot({ realm: R1 }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('either filing honours the other\'s hold, whichever sent first', () => {
  it('across first, then a realm-scoped build (rollback, or a tab of the build before the flag): refused, nothing sent', async () => {
    const g1 = await graph(); fail502(g1);
    expect((await removeOf(g1, 'ar2.h1', true).run({ id: 'c9' })).outcome).toBe('pending');
    const g2 = await graph(); fail502(g2);
    const old = removeOf(g2, 'ar2.h1', false);
    expect(await old.isPending({ id: 'c9' })).toBe(true);
    const res = await old.run({ id: 'c9' });
    expect(res).toMatchObject({ outcome: 'not_sent', error: { code: 'READ_BACK_FIRST' } });
    expect(deletes(g2)).toBe(0);
    // In another realm view of the realm-scoped build too: the unscoped hold is the same computer's change.
    g2.ctx.setRealm(R2);
    expect((await old.run({ id: 'c9' })).outcome).toBe('not_sent');
    expect(deletes(g2)).toBe(0);
  });
  it('across first, then a realm-scoped tab that never loaded it: refused under the store lock', async () => {
    const g1 = await graph(); fail502(g1);
    await removeOf(g1, 'ar2.h2', true).run({ id: 'c9' });
    const g2 = await graph(); fail502(g2);
    g2.C.resetChanges(); // only the stored record (read under the store lock) holds it
    const res = await removeOf(g2, 'ar2.h2', false).run({ id: 'c9' });
    expect(res).toMatchObject({ outcome: 'not_sent', error: { code: 'READ_BACK_FIRST' } });
    expect(deletes(g2)).toBe(0);
  });
  it('with the store unreadable, a hold filed the other way still answers READ_BACK_FIRST (the check before the store read)', async () => {
    const g1 = await graph(); fail502(g1);
    await removeOf(g1, 'ar2.h6', false).run({ id: 'c9' });
    const g2 = await graph(); fail502(g2);
    const read = localStorage.getItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation((k: string) => { if (k === 'hub.v3.changes') throw new Error('refused'); return read(k); });
    let res;
    try { res = await removeOf(g2, 'ar2.h6', true).run({ id: 'c9' }); } finally { spy.mockRestore(); }
    expect(res).toMatchObject({ outcome: 'not_sent', error: { code: 'READ_BACK_FIRST' } });
    expect(deletes(g2)).toBe(0);
  });
  it('realm-scoped first, then across still refuses', async () => {
    const g1 = await graph(); fail502(g1);
    await removeOf(g1, 'ar2.h3', false).run({ id: 'c9' });
    const g2 = await graph(); fail502(g2);
    expect((await removeOf(g2, 'ar2.h3', true).run({ id: 'c9' })).outcome).toBe('not_sent');
    expect(deletes(g2)).toBe(0);
  });
  it('an agent route: across first, then the realm-scoped build refuses the same action on the same computer', async () => {
    const g1 = await graph(); fail502(g1);
    const op = (g: G, across: boolean) => g.query.defineMutation<{ op: string }>(g.routes.defineRoute<unknown, { op: string }>({ method: 'POST', path: '/ar2/agent-op', scope: 'agent', body: ['op'], idem: true }), { input: (v) => ({ body: v }), lock: 'ar2.h4', ...(across ? { acrossRealms: true } : {}) });
    expect((await op(g1, true).run({ op: 'stop' })).outcome).toBe('pending');
    const g2 = await graph(); fail502(g2);
    expect((await op(g2, false).run({ op: 'stop' })).outcome).toBe('not_sent');
    expect(g2.env.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });
  it('coreSource: across first, then the realm-scoped build refuses', async () => {
    const tableOf = (g: G, across: boolean) => ({ changes: { remove: { route: g.routes.defineRoute<unknown>({ method: 'DELETE', path: '/ar2/containers/:id', scope: 'realm' }), lock: 'ar2.h5', ...(across ? { acrossRealms: true } : {}), input: (v: Vars) => ({ params: { id: v.id } }), lockKey: (v: Vars) => v.id } } });
    const pressIn = async (g: G, across: boolean): Promise<S.SourceResult<unknown>> => {
      const src = g.source.coreSource('ar2-h5', tableOf(g, across));
      let last!: { mutateAsync: (v: Vars) => Promise<S.SourceResult<unknown>> };
      function Probe() { last = src.useMutation<unknown, Vars>('remove') as never; return null; }
      render(<Probe />, { wrapper: wrapOf(g) });
      let r!: S.SourceResult<unknown>;
      await act(async () => { r = await last.mutateAsync({ id: 'c9' }); await g.env.settle(40); });
      cleanup();
      return r;
    };
    const g1 = await graph(); fail502(g1);
    expect((await pressIn(g1, true)).outcome).toBe('pending');
    const g2 = await graph(); fail502(g2);
    expect((await pressIn(g2, false)).outcome).toBe('not_sent');
    expect(deletes(g2)).toBe(0);
  });
  it('coreSource, under the store lock: realm-scoped first, then an across tab that never loaded it refuses', async () => {
    const tableOf = (g: G, across: boolean) => ({ changes: { remove: { route: g.routes.defineRoute<unknown>({ method: 'DELETE', path: '/ar2/containers/:id', scope: 'realm' }), lock: 'ar2.h7', ...(across ? { acrossRealms: true } : {}), input: (v: Vars) => ({ params: { id: v.id } }), lockKey: (v: Vars) => v.id } } });
    const pressIn = async (g: G, across: boolean): Promise<S.SourceResult<unknown>> => {
      const src = g.source.coreSource('ar2-h7', tableOf(g, across));
      let last!: { mutateAsync: (v: Vars) => Promise<S.SourceResult<unknown>> };
      function Probe() { last = src.useMutation<unknown, Vars>('remove') as never; return null; }
      render(<Probe />, { wrapper: wrapOf(g) });
      let r!: S.SourceResult<unknown>;
      await act(async () => { r = await last.mutateAsync({ id: 'c9' }); await g.env.settle(40); });
      cleanup();
      return r;
    };
    const g1 = await graph(); fail502(g1);
    expect((await pressIn(g1, false)).outcome).toBe('pending');
    const g2 = await graph(); fail502(g2);
    g2.C.resetChanges(); // only the stored record (read under the store lock) holds it
    expect((await pressIn(g2, true)).outcome).toBe('not_sent');
    expect(deletes(g2)).toBe(0);
  });
});

describe('sendingChanges shows a realm-scoped send of an across base in every realm view', () => {
  it('a send of this tab, still out, filed under R1: listed in R1, R2 and all', async () => {
    const g = await graph();
    g.env.onFetch(() => new Promise(() => {})); // never answers
    void removeOf(g, 'ar2.s1', false).run({ id: 'c9' });
    await g.env.settle(20);
    removeOf(g, 'ar2.s1', true); // a definition of the base files across realms (declares it)
    for (const realm of [R1, R2, 'all']) expect(g.C.sendingChanges('ar2.s1', { realm })).toHaveLength(1);
  });
  it('another tab\'s live send stamp, filed under R1: listed in R2 too', async () => {
    const g1 = await graph();
    g1.env.onFetch(() => new Promise(() => {}));
    void removeOf(g1, 'ar2.s2', false).run({ id: 'c9' });
    await g1.env.settle(20);
    const g2 = await graph();
    removeOf(g2, 'ar2.s2', true);
    g2.ctx.setRealm(R2);
    expect(g2.C.sendingChanges('ar2.s2', { realm: R2 })).toHaveLength(1);
    expect(g2.C.sendingChanges('ar2.s2', { realm: R1 })).toHaveLength(1);
  });
  it('an older build\'s send still out, filed under R1 (unattributed): listed in R2 too', async () => {
    const g1 = await graph();
    g1.env.onFetch(() => new Promise(() => {}));
    void removeOf(g1, 'ar2.s4', false).run({ id: 'c9' });
    await g1.env.settle(20);
    // The stored record as an older build writes it (no record format): never adopted, listed from olderOut.
    const recs = JSON.parse(localStorage.getItem('hub.v3.changes')!) as Array<Record<string, unknown>>;
    for (const r of recs) delete r.fmt;
    localStorage.setItem('hub.v3.changes', JSON.stringify(recs));
    const g2 = await graph();
    removeOf(g2, 'ar2.s4', true);
    g2.ctx.setRealm(R2);
    expect(g2.C.sendingChanges('ar2.s4', { realm: R2 })).toMatchObject([{ attributed: false, realm: R1 }]);
  });
  it('a base not filed across realms keeps the realm filter for an older build\'s send too', async () => {
    const g1 = await graph();
    g1.env.onFetch(() => new Promise(() => {}));
    void removeOf(g1, 'ar2.s5', false).run({ id: 'c9' });
    await g1.env.settle(20);
    const recs = JSON.parse(localStorage.getItem('hub.v3.changes')!) as Array<Record<string, unknown>>;
    for (const r of recs) delete r.fmt;
    localStorage.setItem('hub.v3.changes', JSON.stringify(recs));
    const g2 = await graph();
    expect(g2.C.sendingChanges('ar2.s5', { realm: R2 })).toEqual([]);
    expect(g2.C.sendingChanges('ar2.s5', { realm: R1 })).toHaveLength(1);
  });
  it('a base not filed across realms keeps the realm filter: R1\'s send is not listed in R2', async () => {
    const g = await graph();
    g.env.onFetch(() => new Promise(() => {}));
    void removeOf(g, 'ar2.s3', false).run({ id: 'c9' });
    await g.env.settle(20);
    expect(g.C.sendingChanges('ar2.s3', { realm: R2 })).toHaveLength(0);
    expect(g.C.sendingChanges('ar2.s3', { realm: R1 })).toHaveLength(1);
  });
});

describe('the hooks count a hold filed the other way, on a remount before any press', () => {
  it('defineMutation.use(): a realm-scoped hold reads pending in the across build', async () => {
    const g1 = await graph(); fail502(g1);
    await removeOf(g1, 'ar2.k1', false).run({ id: 'c9' });
    const g2 = await graph(); fail502(g2);
    const after = removeOf(g2, 'ar2.k1', true);
    const { result } = renderHook(() => after.use(), { wrapper: wrapOf(g2) });
    expect(result.current.outcome).toBe('pending');
  });
  it('defineMutation.use(): an unscoped hold reads pending in the realm-scoped build', async () => {
    const g1 = await graph(); fail502(g1);
    await removeOf(g1, 'ar2.k2', true).run({ id: 'c9' });
    const g2 = await graph(); fail502(g2);
    const old = removeOf(g2, 'ar2.k2', false);
    const { result } = renderHook(() => old.use(), { wrapper: wrapOf(g2) });
    expect(result.current.outcome).toBe('pending');
  });
  it('defineMutation.use(): another lock base\'s hold is not this one\'s pending', async () => {
    const g1 = await graph(); fail502(g1);
    await removeOf(g1, 'ar2.k3other', false).run({ id: 'c9' });
    const g2 = await graph(); fail502(g2);
    const after = removeOf(g2, 'ar2.k3', true);
    const { result } = renderHook(() => after.use(), { wrapper: wrapOf(g2) });
    expect(result.current.outcome).toBe('idle');
  });
  it('coreSource: a realm-scoped hold reads pending in the across build', async () => {
    const tableOf = (g: G, across: boolean) => ({ changes: { remove: { route: g.routes.defineRoute<unknown>({ method: 'DELETE', path: '/ar2/containers/:id', scope: 'realm' }), lock: 'ar2.k4', ...(across ? { acrossRealms: true } : {}), input: (v: Vars) => ({ params: { id: v.id } }), lockKey: (v: Vars) => v.id } } });
    const g1 = await graph(); fail502(g1);
    const src1 = g1.source.coreSource('ar2-k4', tableOf(g1, false));
    let m1!: { mutateAsync: (v: Vars) => Promise<S.SourceResult<unknown>> };
    function P1() { m1 = src1.useMutation<unknown, Vars>('remove') as never; return null; }
    render(<P1 />, { wrapper: wrapOf(g1) });
    await act(async () => { await m1.mutateAsync({ id: 'c9' }); await g1.env.settle(40); });
    cleanup();
    const g2 = await graph(); fail502(g2);
    const src2 = g2.source.coreSource('ar2-k4', tableOf(g2, true));
    let m2!: { pending: boolean };
    function P2() { m2 = src2.useMutation<unknown, Vars>('remove') as never; return null; }
    render(<P2 />, { wrapper: wrapOf(g2) });
    expect(m2.pending).toBe(true);
  });
});

describe('the hooks count a send filed the other way as running', () => {
  it('defineMutation.use(): another tab\'s live realm-scoped send reads running in the across build', async () => {
    const g1 = await graph();
    g1.env.onFetch(() => new Promise(() => {}));
    void removeOf(g1, 'ar2.r1', false).run({ id: 'c9' });
    await g1.env.settle(20);
    const g2 = await graph();
    const after = removeOf(g2, 'ar2.r1', true);
    const { result } = renderHook(() => after.use(), { wrapper: wrapOf(g2) });
    expect(result.current.running).toBe(true);
  });
  it('coreSource: another tab\'s live realm-scoped send reads as sending in the across build', async () => {
    const tableOf = (g: G, across: boolean) => ({ changes: { remove: { route: g.routes.defineRoute<unknown>({ method: 'DELETE', path: '/ar2/containers/:id', scope: 'realm' }), lock: 'ar2.r2', ...(across ? { acrossRealms: true } : {}), input: (v: Vars) => ({ params: { id: v.id } }), lockKey: (v: Vars) => v.id } } });
    const g1 = await graph();
    g1.env.onFetch(() => new Promise(() => {}));
    const src1 = g1.source.coreSource('ar2-r2', tableOf(g1, false));
    let m1!: { mutateAsync: (v: Vars) => Promise<S.SourceResult<unknown>> };
    function P1() { m1 = src1.useMutation<unknown, Vars>('remove') as never; return null; }
    render(<P1 />, { wrapper: wrapOf(g1) });
    await act(async () => { void m1.mutateAsync({ id: 'c9' }); await g1.env.settle(20); });
    cleanup();
    const g2 = await graph();
    const src2 = g2.source.coreSource('ar2-r2', tableOf(g2, true));
    let m2!: { isPending: boolean; pending: boolean };
    function P2() { m2 = src2.useMutation<unknown, Vars>('remove') as never; return null; }
    render(<P2 />, { wrapper: wrapOf(g2) });
    expect(m2.isPending).toBe(true);
    expect(m2.pending).toBe(false);
  });
});

describe('holdOf names the pending hold that refuses, never a released record keeping its key', () => {
  it('a released unscoped record keeping its key and a pending realm-scoped one: holdOf names the pending one, and its Dismiss frees it', async () => {
    const g1 = await graph(); fail502(g1);
    const a1 = keyedOf(g1, 'ar2.o1', true);
    const r1 = await a1.run({ id: 'c9' });
    expect(r1.outcome).toBe('pending');
    expect(await a1.settle({ id: 'c9' }, r1.hold!)).toBe(true); // released, its key kept
    expect(await a1.isPending({ id: 'c9' })).toBe(false);
    const g2 = await graph(); fail502(g2);
    const old = keyedOf(g2, 'ar2.o1', false);
    expect(await old.isPending({ id: 'c9' })).toBe(false); // a released record keeping its key holds nothing
    expect((await old.run({ id: 'c9' })).outcome).toBe('pending'); // the realm-scoped build sends it
    const g3 = await graph(); fail502(g3);
    const a3 = keyedOf(g3, 'ar2.o1', true);
    expect((await a3.run({ id: 'c9' })).error?.code).toBe('READ_BACK_FIRST');
    const held = g3.C.heldChanges('ar2.o1');
    expect(held).toHaveLength(1);
    const hold = await a3.holdOf({ id: 'c9' });
    expect(hold).toBe(held[0]!.hold);
    expect(await a3.dismiss({ id: 'c9' }, hold!)).toBe(true);
    expect(g3.C.heldChanges('ar2.o1')).toEqual([]);
  });
  it('coreSource: the same, holdOf names the pending realm-scoped hold', async () => {
    const tableOf = (g: G, across: boolean) => ({ changes: { remove: { route: g.routes.defineRoute<unknown>({ method: 'DELETE', path: '/ar2/agent-c/:id', scope: 'agent', idem: true }), lock: 'ar2.o2', ...(across ? { acrossRealms: true } : {}), input: (v: Vars) => ({ params: { id: v.id } }), lockKey: (v: Vars) => v.id } } });
    type M = { mutateAsync: (v: Vars) => Promise<S.SourceResult<unknown>>; settle: (v: Vars, h: string) => Promise<boolean>; holdOf: (v: Vars) => Promise<string | undefined> };
    const mount = (g: G, across: boolean): (() => M) => {
      const src = g.source.coreSource('ar2-o2', tableOf(g, across));
      let m!: M;
      function P() { m = src.useMutation<unknown, Vars>('remove') as never; return null; }
      render(<P />, { wrapper: wrapOf(g) });
      return () => m;
    };
    const g1 = await graph(); fail502(g1);
    const m1 = mount(g1, true);
    let r!: S.SourceResult<unknown>;
    await act(async () => { r = await m1().mutateAsync({ id: 'c9' }); await g1.env.settle(40); });
    expect(r.outcome).toBe('pending');
    await act(async () => { expect(await m1().settle({ id: 'c9' }, (r as { hold?: string }).hold!)).toBe(true); });
    cleanup();
    const g2 = await graph(); fail502(g2);
    const m2 = mount(g2, false);
    await act(async () => { r = await m2().mutateAsync({ id: 'c9' }); await g2.env.settle(40); });
    expect(r.outcome).toBe('pending');
    cleanup();
    const g3 = await graph(); fail502(g3);
    const m3 = mount(g3, true);
    const held = g3.C.heldChanges('ar2.o2');
    expect(held).toHaveLength(1);
    let hold: string | undefined;
    await act(async () => { hold = await m3().holdOf({ id: 'c9' }); });
    expect(hold).toBe(held[0]!.hold);
  });
});

describe('a record filed the other way that is released keeping its key holds nothing', () => {
  it('the across build: holdOf names nothing, nothing pending, the hook idle and not running', async () => {
    const g1 = await graph(); fail502(g1);
    const old = keyedOf(g1, 'ar2.x1', false);
    const r = await old.run({ id: 'c9' });
    expect(await old.settle({ id: 'c9' }, r.hold!)).toBe(true); // realm-scoped, released, key kept
    const g2 = await graph(); fail502(g2);
    const after = keyedOf(g2, 'ar2.x1', true);
    expect(await after.holdOf({ id: 'c9' })).toBeUndefined();
    expect(await after.isPending({ id: 'c9' })).toBe(false);
    const { result } = renderHook(() => after.use(), { wrapper: wrapOf(g2) });
    expect(result.current.outcome).toBe('idle');
    expect(result.current.running).toBe(false);
  });
});

describe('coreSource reads a refused press back in the held send\'s realm, filed the other way', () => {
  it('a realm-scoped hold from R1: a refused press of the across build in R1 reads it back there and the proof frees it', async () => {
    const absent = (identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined => {
      const shown = answers[0]?.[0] as string[] | undefined;
      return shown && !shown.includes(identity as string) ? 'applied' : undefined;
    };
    const tableOf = (g: G, across: boolean) => ({
      reads: { list: { route: g.routes.defineRoute<{ data: string[] }>({ method: 'GET', path: '/ar2/containers', scope: 'realm' }), select: (r: unknown) => (r as { data: string[] }).data } },
      changes: { remove: { route: g.routes.defineRoute<unknown>({ method: 'DELETE', path: '/ar2/containers/:id', scope: 'realm' }), lock: 'ar2.x2', ...(across ? { acrossRealms: true } : {}), input: (v: Vars) => ({ params: { id: v.id } }), lockKey: (v: Vars) => v.id, reads: ['list'], proves: absent } },
    });
    const press = async (g: G, across: boolean): Promise<S.SourceResult<unknown>> => {
      const src = g.source.coreSource('ar2-x2', tableOf(g, across));
      let m!: { mutateAsync: (v: Vars) => Promise<S.SourceResult<unknown>> };
      function P() { m = src.useMutation<unknown, Vars>('remove') as never; return null; }
      render(<P />, { wrapper: wrapOf(g) });
      let r!: S.SourceResult<unknown>;
      await act(async () => { r = await m.mutateAsync({ id: 'c9' }); await g.env.settle(60); });
      cleanup();
      return r;
    };
    const g1 = await graph();
    g1.env.onFetch((c) => (c.method === 'DELETE' ? { status: 502, body: {} } : { status: 200, body: { data: ['c9'] } }));
    expect((await press(g1, false)).outcome).toBe('pending');
    const g2 = await graph();
    g2.env.onFetch((c) => (c.method === 'DELETE' ? { status: 502, body: {} } : { status: 200, body: { data: [] } })); // gone: the remove went through
    expect((await press(g2, true)).outcome).toBe('not_sent');
    expect(g2.C.heldChanges('ar2.x2', { realm: null })).toEqual([]);
    expect(deletes(g2)).toBe(0);
  });
});

// A lock name holding '@' (or '#', NUL) can no longer be declared (changes.ts lockBase), so a base
// whose name reads like a realm-scoped id of another cannot exist; changes.lockname.test.tsx covers every declaration.
describe('a lock name that reads like a realm-scoped id of another base', () => {
  it('lock "ar2.b1@other" cannot be declared, across realms or not; lock "ar2.b1" still can', async () => {
    const g = await graph();
    expect(() => removeOf(g, 'ar2.b1@other', true)).toThrow(/no @, # or NUL/);
    expect(() => removeOf(g, 'ar2.b1@other', false)).toThrow(/no @, # or NUL/);
    expect(() => removeOf(g, 'ar2.b1', true)).not.toThrow();
  });
});

describe('two near cases told apart', () => {
  it('a11: a definition with an unscoped id that is not across realms is not refused by a realm-scoped hold of another route', async () => {
    const g1 = await graph(); fail502(g1);
    await removeOf(g1, 'ar2.l1', false).run({ id: 'c9' });
    const g2 = await graph(); fail502(g2);
    // A base route sharing the lock: its id is unscoped, and it never filed under a realm.
    const acct = g2.query.defineMutation<Vars>(g2.routes.defineRoute<unknown>({ method: 'DELETE', path: '/ar2/account-thing/:id', scope: 'base' }), { input: (v) => ({ params: { id: v.id } }), lockKey: (v) => v.id, lock: 'ar2.l1' });
    expect((await acct.run({ id: 'c9' })).outcome).toBe('pending');
    expect(deletes(g2)).toBe(1);
  });
  it('a12: an across hold released keeping its key is not pending, and nothing is held', async () => {
    const g = await graph(); fail502(g);
    const a = keyedOf(g, 'ar2.l2', true);
    const r = await a.run({ id: 'c9' });
    expect(await a.settle({ id: 'c9' }, r.hold!)).toBe(true);
    expect(await a.isPending({ id: 'c9' })).toBe(false);
    expect(g.C.heldChanges('ar2.l2')).toEqual([]);
  });
});
