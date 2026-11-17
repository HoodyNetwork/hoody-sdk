// A defineMutation hook's readBack and useLockedChange's readBack
// take the send a band shows ({ hold }) and read back, prove and release only that one; and a read-back re-reads only
// the reads that can show the change's realm (keyReadsRealm, the rule answersFor judges by), never another realm's.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import * as C from './changes';
import { setRealm, type Ctx } from './ctx';
import { useLockedChange, type LockedChange } from './locked';
import { defineMutation, defineQuery, queryClient, type MutationHook, type QueryDef } from './query';
import { defineRoute } from './routes';
import { coreSource, type SourceMutation } from './source';
import { boot, calls, deferred, onFetch, R1, R2, settle } from './test/env';

type Vars = { realm: string };
type Item = { id: string };
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
/** Applied when a fresh answer the read-back may judge says on. */
const on = (_identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined =>
  (answers[0] ?? []).some((a) => (a as { on?: boolean } | undefined)?.on === true) ? 'applied' : undefined;
const realmOf = (url: string): string | null => new URL(url).searchParams.get('realm');
const gets = () => calls.filter((c) => c.method === 'GET');
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }
const holdsOf = (lock: string) => C.heldChanges(lock, { realm: null });

let applied = false;
beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  applied = false;
  onFetch((c) => (c.method === 'GET' ? { status: 200, body: { on: applied } } : { status: 502, body: {} }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// defineMutation: an agent change that names its realm, proved by a status read that names its realm.
let n = 0;
function hookDef() {
  const id = ++n;
  const status = defineRoute<{ on: boolean }>({ method: 'GET', path: `/rr2/${id}/status`, scope: 'agent' });
  const flip = defineRoute<unknown, { on: boolean }>({ method: 'POST', path: `/rr2/${id}/flip`, scope: 'agent', body: ['on'], idem: true });
  const read = defineQuery<{ on: boolean }, { on: boolean }, { realm?: string } | undefined>(status, { input: (p) => (p?.realm ? { realm: p.realm } : {}) });
  const lock = `rr2.q${id}`;
  const m = defineMutation<Vars>(flip, { input: (v) => ({ realm: v.realm, body: { on: true } }), lockKey: (v) => ({ realm: v.realm }), reads: [read], proves: on, lock });
  return { read, m, lock };
}
function mountHook(read: QueryDef<{ realm?: string } | undefined, { on: boolean }>, m: ReturnType<typeof hookDef>['m'], reads: Array<{ realm?: string } | undefined>): () => MutationHook<Vars, unknown> {
  let last!: MutationHook<Vars, unknown>;
  function Read({ p }: { p: { realm?: string } | undefined }) { read.use(p); return null; }
  function Probe() { last = m.use(); return <>{reads.map((p, i) => <Read key={i} p={p} />)}</>; }
  render(<Probe />, { wrapper: wrap });
  return () => last;
}

describe('defineMutation hook: readBack({ hold }) reads back only the shown send', () => {
  it('under All realms, two holds: only the named one is proved and released; the other realm is never asked', async () => {
    const { read, m, lock } = hookDef();
    await act(async () => { setRealm('all'); });
    const hook = mountHook(read, m, [{ realm: R1 }, { realm: R2 }]);
    await act(async () => { await flush(); });
    for (const realm of [R1, R2]) await act(async () => { expect((await hook().run({ realm })).outcome).toBe('pending'); await flush(); });
    const r1 = holdsOf(lock).find((h) => (h.identity as Vars).realm === R1)!;
    expect(r1.hold).toBeTruthy();
    applied = true;
    const before = gets().length;
    let ok!: boolean;
    await act(async () => { ok = await hook().readBack({ hold: r1.hold! }); await flush(); });
    expect(ok).toBe(true);
    expect(holdsOf(lock).map((h) => (h.identity as Vars).realm), 'readBack of one hold released the other').toEqual([R2]);
    expect(gets().slice(before).map((c) => realmOf(c.url)), 'readBack of an R1 hold asked R2').toEqual([R1]);
    expect(hook().outcome).toBe('pending');
  });
  it('a token no change of this sender holds: false, nothing read, nothing released', async () => {
    const { read, m, lock } = hookDef();
    const hook = mountHook(read, m, [{ realm: R1 }]);
    await act(async () => { await flush(); });
    await act(async () => { await hook().run({ realm: R1 }); await flush(); });
    applied = true;
    const before = calls.length;
    let ok!: boolean;
    await act(async () => { ok = await hook().readBack({ hold: 'not-a-hold' }); await flush(); });
    expect(ok).toBe(false);
    expect(calls.length).toBe(before);
    expect(holdsOf(lock)).toHaveLength(1);
  });
  it('a bare readBack() still reads back every own change (an event handed in is a bare read-back too)', async () => {
    const { read, m, lock } = hookDef();
    await act(async () => { setRealm('all'); });
    const hook = mountHook(read, m, [{ realm: R1 }, { realm: R2 }]);
    await act(async () => { await flush(); });
    for (const realm of [R1, R2]) await act(async () => { await hook().run({ realm }); await flush(); });
    applied = true;
    await act(async () => { await (hook().readBack as (e?: unknown) => Promise<boolean>)({ type: 'press' }); await flush(); });
    expect(holdsOf(lock)).toEqual([]);
  });
});

describe('coreSource readBack: only a string hold limits it', () => {
  /** Two holds under All realms, then readBack(arg): true when it read both back (a bare read-back). */
  async function bareWith(arg: unknown): Promise<void> {
    const id = ++n;
    const status = defineRoute<{ on: boolean }>({ method: 'GET', path: `/rr2s/${id}/status`, scope: 'agent' });
    const flip = defineRoute<unknown, { on: boolean }>({ method: 'POST', path: `/rr2s/${id}/flip`, scope: 'agent', body: ['on'], idem: true });
    const lock = `rr2.s${id}`;
    const src = coreSource('rr2s-' + id, {
      reads: { status: { route: status, input: (p: { realm?: string } | undefined) => (p?.realm ? { realm: p.realm } : {}) } },
      changes: { flip: { route: flip, lock, input: (v: Vars) => ({ realm: v.realm, body: { on: true } }), lockKey: (v: Vars) => ({ realm: v.realm }), reads: ['status'], proves: on } },
    });
    let last!: SourceMutation<unknown, Vars>;
    function Probe() { src.useQueries('status', [{ realm: R1 }, { realm: R2 }]); last = src.useMutation<unknown, Vars>('flip'); return null; }
    await act(async () => { setRealm('all'); });
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await flush(); });
    for (const realm of [R1, R2]) await act(async () => { await last.mutateAsync({ realm }); await flush(); });
    expect(holdsOf(lock)).toHaveLength(2);
    applied = true;
    await act(async () => { await (last.readBack as (e?: unknown) => Promise<boolean>)(arg); await flush(); });
    expect(holdsOf(lock), 'a non-string argument limited the read-back').toEqual([]);
  }
  it('an event handed in by a bare handler is a bare read-back: every own change is read back', async () => { await bareWith({ type: 'press' }); });
  it('a hold that is not a string is a bare read-back too', async () => { await bareWith({ hold: 7 }); });
});

describe('defineQuery read-back re-reads only the reads that can show the change\'s realm', () => {
  it('a read kept from R2\'s view (no realm of its own) is not re-read for an R1 change', async () => {
    const { read, m, lock } = hookDef();
    await act(async () => { setRealm(R2); });
    const hook = mountHook(read, m, [undefined]);
    await act(async () => { await flush(); });
    await act(async () => { setRealm(R1); await flush(); });
    await act(async () => { expect((await hook().run({ realm: R1 })).outcome).toBe('pending'); await flush(); });
    applied = true;
    const before = gets().length;
    await act(async () => { await hook().readBack(); await flush(); });
    expect(holdsOf(lock), 'the read-back did not prove it').toEqual([]);
    expect(gets().slice(before).map((c) => realmOf(c.url)), 'an R2 read was re-read for an R1 change').toEqual([R1]);
  });
  it('MutationDef.readBack(vars): under All realms only the change\'s realm is asked, and it proves', async () => {
    const { read, m, lock } = hookDef();
    await act(async () => { setRealm('all'); });
    const hook = mountHook(read, m, [{ realm: R1 }, { realm: R2 }]);
    await act(async () => { await flush(); });
    await act(async () => { await hook().run({ realm: R2 }); await flush(); });
    applied = true;
    const before = gets().length;
    let ok!: boolean;
    await act(async () => { ok = await m.readBack({ realm: R2 }); await flush(); });
    expect(ok).toBe(true);
    expect(holdsOf(lock)).toEqual([]);
    expect(gets().slice(before).map((c) => realmOf(c.url))).toEqual([R2]);
  });
  it('a read naming no realm under one realm (its key\'s shown realm) is still re-read and proves', async () => {
    const { read, m, lock } = hookDef();
    const hook = mountHook(read, m, [undefined]);
    await act(async () => { await flush(); });
    await act(async () => { await hook().run({ realm: R1 }); await flush(); });
    applied = true;
    const before = gets().length;
    await act(async () => { await hook().readBack(); await flush(); });
    expect(holdsOf(lock)).toEqual([]);
    expect(gets().slice(before).map((c) => realmOf(c.url))).toEqual([R1]);
  });
});

// Off-page fallback (a read no page holds, read once without params): a read a page holds only in another realm's
// view is skipped (the existence check is unfiltered), and an off-page key that cannot show the change's realm is
// never sent (keyReadsRealm). The status read's default realm (no params) is R2 here, so an off-page read is an R2 one.
describe('off-page fallback never reads another realm than the change\'s', () => {
  const NONE: Array<{ realm?: string } | undefined> = [];
  /** A defineMutation whose status read defaults to `dflt` without params. */
  function offDef(dflt: string) {
    const id = ++n;
    const status = defineRoute<{ on: boolean }>({ method: 'GET', path: `/rr2o/${id}/status`, scope: 'agent' });
    const flip = defineRoute<unknown, { on: boolean }>({ method: 'POST', path: `/rr2o/${id}/flip`, scope: 'agent', body: ['on'], idem: true });
    const read = defineQuery<{ on: boolean }, { on: boolean }, { realm?: string } | undefined>(status, { input: (p) => ({ realm: p?.realm ?? dflt }) });
    const lock = `rr2.o${id}`;
    const m = defineMutation<Vars>(flip, { input: (v) => ({ realm: v.realm, body: { on: true } }), lockKey: (v) => ({ realm: v.realm }), reads: [read], proves: on, lock });
    return { read, m, lock };
  }
  /** A coreSource change whose status read defaults to `dflt` without params, its reads mounted for `mounted`. */
  async function offSource(dflt: string, mounted: Array<{ realm?: string } | undefined>) {
    const id = ++n;
    const status = defineRoute<{ on: boolean }>({ method: 'GET', path: `/rr2os/${id}/status`, scope: 'agent' });
    const flip = defineRoute<unknown, { on: boolean }>({ method: 'POST', path: `/rr2os/${id}/flip`, scope: 'agent', body: ['on'], idem: true });
    const lock = `rr2.os${id}`;
    const src = coreSource('rr2os-' + id, {
      reads: { status: { route: status, input: (p: { realm?: string } | undefined) => ({ realm: p?.realm ?? dflt }) } },
      changes: { flip: { route: flip, lock, input: (v: Vars) => ({ realm: v.realm, body: { on: true } }), lockKey: (v: Vars) => ({ realm: v.realm }), reads: ['status'], proves: on } },
    });
    let last!: SourceMutation<unknown, Vars>;
    function Probe() { src.useQueries('status', mounted); last = src.useMutation<unknown, Vars>('flip'); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await flush(); });
    return { mutation: () => last, lock };
  }
  /** Sends an R1 change, then a bare read-back: the GET realms it asked and whether the change is still held. */
  async function readBackR1(run: () => Promise<unknown>, readBack: () => Promise<unknown>, lock: string): Promise<{ asked: Array<string | null>; held: number }> {
    await act(async () => { await run(); await flush(); });
    expect(holdsOf(lock)).toHaveLength(1);
    applied = true;
    const before = gets().length;
    await act(async () => { await readBack(); await flush(); });
    return { asked: gets().slice(before).map((c) => realmOf(c.url)), held: holdsOf(lock).length };
  }
  const label = (v: string) => (v === 'all' ? 'All realms' : 'R2');

  for (const view of [R2, 'all'] as const) {
    it(`defineQuery: the read mounted only for R2, default ${label(view)}: no request, still held`, async () => {
      const { read, m, lock } = offDef(R2);
      await act(async () => { setRealm(view); });
      const hook = mountHook(read, m, [{ realm: R2 }]);
      await act(async () => { await flush(); });
      expect(await readBackR1(() => hook().run({ realm: R1 }), () => hook().readBack(), lock), 'a read held only in R2 was read off-page').toEqual({ asked: [], held: 1 });
    });
    it(`coreSource: the read mounted only for R2, default ${label(view)}: no request, still held`, async () => {
      await act(async () => { setRealm(view); });
      const { mutation, lock } = await offSource(R2, [{ realm: R2 }]);
      expect(await readBackR1(() => mutation().mutateAsync({ realm: R1 }), () => mutation().readBack(), lock), 'a read held only in R2 was read off-page').toEqual({ asked: [], held: 1 });
    });
  }
  it('a read mounted only for R2 is not read off-page even when its off-page key would read R1 (defineQuery and coreSource)', async () => {
    await act(async () => { setRealm('all'); });
    const { read, m, lock } = offDef(R1);
    const hook = mountHook(read, m, [{ realm: R2 }]);
    await act(async () => { await flush(); });
    expect(await readBackR1(() => hook().run({ realm: R1 }), () => hook().readBack(), lock), 'defineQuery: a read held in R2 was read off-page').toEqual({ asked: [], held: 1 });
    cleanup();
    applied = false;
    const src = await offSource(R1, [{ realm: R2 }]);
    expect(await readBackR1(() => src.mutation().mutateAsync({ realm: R1 }), () => src.mutation().readBack(), src.lock), 'coreSource: a read held in R2 was read off-page').toEqual({ asked: [], held: 1 });
  });
  it('defineQuery: no read mounted, its off-page key reads R2: never sent for an R1 change; one reading R1 is, and proves', async () => {
    await act(async () => { setRealm('all'); });
    const a = offDef(R2);
    const ha = mountHook(a.read, a.m, NONE);
    await act(async () => { await flush(); });
    expect(await readBackR1(() => ha().run({ realm: R1 }), () => ha().readBack(), a.lock), 'an off-page R2 read was sent for an R1 change').toEqual({ asked: [], held: 1 });
    cleanup();
    applied = false;
    const b = offDef(R1);
    const hb = mountHook(b.read, b.m, NONE);
    await act(async () => { await flush(); });
    expect(await readBackR1(() => hb().run({ realm: R1 }), () => hb().readBack(), b.lock)).toEqual({ asked: [R1], held: 0 });
  });
  it('coreSource: no read mounted, its off-page key reads R2: never sent for an R1 change; one reading R1 is, and proves', async () => {
    await act(async () => { setRealm('all'); });
    const a = await offSource(R2, NONE);
    expect(await readBackR1(() => a.mutation().mutateAsync({ realm: R1 }), () => a.mutation().readBack(), a.lock), 'an off-page R2 read was sent for an R1 change').toEqual({ asked: [], held: 1 });
    cleanup();
    applied = false;
    const b = await offSource(R1, NONE);
    expect(await readBackR1(() => b.mutation().mutateAsync({ realm: R1 }), () => b.mutation().readBack(), b.lock)).toEqual({ asked: [R1], held: 0 });
  });
});

// useLockedChange: a realm lock (its scope holds one realm), two identities held in it.
describe('useLockedChange: readBack({ hold }) judges and frees only the shown send; the re-read stays in its realm', () => {
  let m = 0;
  function lockedSetup() {
    const id = ++m;
    const list = defineRoute<{ items: Item[]; on: boolean }>({ method: 'GET', path: `/rr2l/${id}/items`, scope: 'realm' });
    const put = defineRoute<unknown, { on: boolean }>({ method: 'PUT', path: `/rr2l/${id}/items/:id`, scope: 'realm', body: ['on'] });
    const read = defineQuery(list);
    const run = (v: Item, _idem: string, ctx: Ctx) => api(put, { params: { id: v.id }, body: { on: true }, ctx });
    let last!: LockedChange<Item, unknown>;
    function Probe() { read.use(undefined); last = useLockedChange(run, [read], `rr2l.${id}`, { realm: true, lockKey: (v) => ({ id: v.id }), proves: on }); return null; }
    return { mount: () => { render(<Probe />, { wrapper: wrap }); return () => last; }, base: `l:rr2l.${id}` };
  }
  const pendingIds = (base: string) => C.pendingOf(base).map((c) => (C.identityOfLock(c.scope, c.digest) as Item).id).sort();

  it('two holds in one realm scope: readBack({ hold }) of one frees it only', async () => {
    const { mount, base } = lockedSetup();
    const lc = mount();
    await act(async () => { await flush(); });
    for (const id of ['a', 'b']) await act(async () => { expect((await lc().run({ id })).outcome).toBe('pending'); await flush(); });
    expect(pendingIds(base)).toEqual(['a', 'b']);
    const a = C.pendingOf(base).find((c) => (C.identityOfLock(c.scope, c.digest) as Item).id === 'a')!;
    applied = true;
    let ok!: boolean;
    await act(async () => { ok = await lc().readBack({ hold: C.holdOfLock(a.scope, a.digest)! }); await flush(); });
    expect(ok).toBe(true);
    expect(pendingIds(base), 'readBack of one hold freed the other').toEqual(['b']);
  });
  it('a token this id does not hold: false, nothing read', async () => {
    const { mount, base } = lockedSetup();
    const lc = mount();
    await act(async () => { await flush(); });
    await act(async () => { await lc().run({ id: 'a' }); await flush(); });
    applied = true;
    const before = calls.length;
    let ok!: boolean;
    await act(async () => { ok = await lc().readBack({ hold: 'not-a-hold' }); await flush(); });
    expect(ok).toBe(false);
    expect(calls.length).toBe(before);
    expect(pendingIds(base)).toEqual(['a']);
  });
  it('the shown hold goes while its read is out (dropped elsewhere): false, and the other hold stays', async () => {
    const { mount, base } = lockedSetup();
    const lc = mount();
    await act(async () => { await flush(); });
    for (const id of ['a', 'b']) await act(async () => { await lc().run({ id }); await flush(); });
    const a = C.pendingOf(base).find((c) => (C.identityOfLock(c.scope, c.digest) as Item).id === 'a')!;
    const hold = C.holdOfLock(a.scope, a.digest)!;
    applied = true;
    const gate = deferred();
    let asked = false;
    onFetch(async (c) => { if (c.method !== 'GET') return { status: 502, body: {} }; asked = true; await gate.p; return { status: 200, body: { on: true } }; });
    let ok: boolean | undefined;
    let done!: Promise<void>;
    await act(async () => { done = lc().readBack({ hold }).then((v) => { ok = v; }); for (let i = 0; i < 20 && !asked; i++) await settle(); });
    expect(asked).toBe(true);
    await act(async () => { expect(await C.discard(a.scope, a.digest, hold)).toBe(true); await flush(); });
    await act(async () => { gate.res(); await done; await flush(); });
    expect(ok, 'a read-back whose hold went while it read reported proved').toBe(false);
    expect(pendingIds(base)).toEqual(['b']);
  });
  it('the shown hold is replaced (released and sent again) while its read is out: false, the new send stays', async () => {
    const { mount, base } = lockedSetup();
    const lc = mount();
    await act(async () => { await flush(); });
    for (const id of ['a', 'b']) await act(async () => { await lc().run({ id }); await flush(); });
    const a = C.pendingOf(base).find((c) => (C.identityOfLock(c.scope, c.digest) as Item).id === 'a')!;
    const hold = C.holdOfLock(a.scope, a.digest)!;
    applied = true;
    const gate = deferred();
    let asked = false;
    // Only the delayed read answers on: any other read meanwhile proves nothing.
    onFetch(async (c) => { if (c.method !== 'GET') return { status: 502, body: {} }; if (asked) return { status: 200, body: { on: false } }; asked = true; await gate.p; return { status: 200, body: { on: true } }; });
    let ok: boolean | undefined;
    let done!: Promise<void>;
    await act(async () => { done = lc().readBack({ hold }).then((v) => { ok = v; }); for (let i = 0; i < 20 && !asked; i++) await settle(); });
    expect(asked).toBe(true);
    // Replaced: released, then sent again (its key replayed), a new send with its own hold.
    await act(async () => { expect(await C.release(a.scope, a.digest, hold)).toBe(true); await lc().run({ id: 'a' }); await flush(); });
    const now = C.holdOfLock(a.scope, a.digest);
    expect(now, 'the second send did not replace the hold').toBeTruthy();
    expect(now).not.toBe(hold);
    await act(async () => { gate.res(); await done; await flush(); });
    expect(ok, 'a read-back whose hold was replaced while it read reported proved').toBe(false);
    expect(pendingIds(base)).toEqual(['a', 'b']);
  });
  it('a read kept from R2\'s view is not re-read for an R1 hold; the R1 read proves it', async () => {
    const { mount, base } = lockedSetup();
    await act(async () => { setRealm(R2); });
    const lc = mount();
    await act(async () => { await flush(); });
    await act(async () => { setRealm(R1); await flush(); });
    await act(async () => { await lc().run({ id: 'a' }); await flush(); });
    applied = true;
    const before = gets().length;
    let ok!: boolean;
    await act(async () => { ok = await lc().readBack(); await flush(); });
    expect(ok).toBe(true);
    expect(pendingIds(base)).toEqual([]);
    const hosts = gets().slice(before).map((c) => c.url);
    expect(hosts.length).toBe(1);
    expect(hosts[0], 'an R2 read was re-read for an R1 hold').toContain(R1);
  });
});
