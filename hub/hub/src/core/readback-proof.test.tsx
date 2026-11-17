// A hold-scoped read-back (`readBack({ hold })`) answers true
// only when this read stored an 'applied' free for exactly that hold, on all three implementations (the defineMutation
// hook, coreSource, useLockedChange). A hold dismissed or replaced while the read is out, a capture that is not the
// requested send, an answer that does not show the change, a 'not_applied' verdict and a free that is not stored all
// answer false; "nothing is pending" never answers true on that path. A bare read-back keeps its meaning.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from './api';
import { CHANGE_STORE_KEY } from './change-store';
import * as C from './changes';
import type { Ctx } from './ctx';
import { useLockedChange, type LockedChange } from './locked';
import { defineMutation, defineQuery, proveByVerdict, queryClient, type MutationHook } from './query';
import { defineRoute } from './routes';
import { coreSource, type SourceMutation } from './source';
import { boot, deferred, onFetch, R1, settle } from './test/env';

type Vars = { id: string };
type State = Record<string, 'on' | 'off'>;
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
/** The read's answer names each change by its id: 'on' applied, 'off' not applied, absent shows nothing. A change
 *  without an identity (its lock gone) is judged by nothing. */
const proves = (identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | 'not_applied' | undefined => {
  const id = (identity as { id?: string } | undefined)?.id;
  if (id === undefined) return undefined;
  const s = (answers[0] ?? []).map((a) => (a as { state?: State } | undefined)?.state?.[id]).find((x) => x !== undefined);
  return s === 'on' ? 'applied' : s === 'off' ? 'not_applied' : undefined;
};
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch((c) => (c.method === 'GET' ? { status: 200, body: { state: {} } } : { status: 502, body: {} }));
});
afterEach(() => { cleanup(); });

interface Impl {
  send(id: string): Promise<void>;
  readBack(only?: { hold: string }): Promise<boolean>;
  readonly base: string;
}
interface Held { id: string; scope: string; digest: string; hold: string }
const held = (base: string): Held[] => C.pendingOf(base).map((c) => ({
  id: (C.identityOfLock(c.scope, c.digest) as Vars).id, scope: c.scope, digest: c.digest, hold: C.holdOfLock(c.scope, c.digest)!,
})).sort((a, b) => a.id.localeCompare(b.id));
const ids = (base: string) => held(base).map((h) => h.id);

let n = 0;
function hookImpl(): Impl {
  const id = ++n;
  const status = defineRoute<{ state: State }>({ method: 'GET', path: `/rp11/${id}/status`, scope: 'agent' });
  const flip = defineRoute<unknown, { id: string }>({ method: 'POST', path: `/rp11/${id}/flip`, scope: 'agent', body: ['id'], idem: true });
  const read = defineQuery<{ state: State }, { state: State }, undefined>(status);
  const lock = `rp11.q${id}`;
  const m = defineMutation<Vars>(flip, { input: (v) => ({ body: { id: v.id } }), lockKey: (v) => ({ id: v.id }), reads: [read], proves, lock });
  let last!: MutationHook<Vars, unknown>;
  function Probe() { read.use(undefined); last = m.use(); return null; }
  render(<Probe />, { wrapper: wrap });
  return {
    send: async (v) => { expect((await last.run({ id: v })).outcome).toBe('pending'); },
    readBack: (only) => last.readBack(only),
    base: 'lock:' + lock,
  };
}
function sourceImpl(): Impl {
  const id = ++n;
  const status = defineRoute<{ state: State }>({ method: 'GET', path: `/rp11s/${id}/status`, scope: 'agent' });
  const flip = defineRoute<unknown, { id: string }>({ method: 'POST', path: `/rp11s/${id}/flip`, scope: 'agent', body: ['id'], idem: true });
  const lock = `rp11.s${id}`;
  const src = coreSource('rp11s-' + id, {
    reads: { status: { route: status, input: () => ({}) } },
    changes: { flip: { route: flip, lock, input: (v: Vars) => ({ body: { id: v.id } }), lockKey: (v: Vars) => ({ id: v.id }), reads: ['status'], proves } },
  });
  let last!: SourceMutation<unknown, Vars>;
  function Probe() { src.useQueries('status', [undefined]); last = src.useMutation<unknown, Vars>('flip'); return null; }
  render(<Probe />, { wrapper: wrap });
  return {
    send: async (v) => { await last.mutateAsync({ id: v }).catch(() => undefined); },
    readBack: (only) => (last.readBack as (o?: { hold: string }) => Promise<boolean>)(only),
    base: 'lock:' + lock,
  };
}
function lockedImpl(): Impl {
  const id = ++n;
  const list = defineRoute<{ state: State }>({ method: 'GET', path: `/rp11l/${id}/items`, scope: 'realm' });
  const put = defineRoute<unknown, { on: boolean }>({ method: 'PUT', path: `/rp11l/${id}/items/:id`, scope: 'realm', body: ['on'] });
  const read = defineQuery(list);
  const run = (v: Vars, _idem: string, ctx: Ctx) => api(put, { params: { id: v.id }, body: { on: true }, ctx });
  let last!: LockedChange<Vars, unknown>;
  function Probe() { read.use(undefined); last = useLockedChange(run, [read], `rp11l.${id}`, { realm: true, lockKey: (v) => ({ id: v.id }), proves }); return null; }
  render(<Probe />, { wrapper: wrap });
  return {
    send: async (v) => { expect((await last.run({ id: v })).outcome).toBe('pending'); },
    readBack: (only) => last.readBack(only),
    base: `l:rp11l.${id}`,
  };
}

const IMPLS: ReadonlyArray<[string, () => Impl]> = [['defineMutation hook', hookImpl], ['coreSource', sourceImpl], ['useLockedChange', lockedImpl]];

/** Mounts the implementation and sends a and b: both held. */
async function twoHeld(make: () => Impl): Promise<{ impl: Impl; a: Held }> {
  const impl = make();
  await act(async () => { await flush(); });
  for (const id of ['a', 'b']) await act(async () => { await impl.send(id); await flush(); });
  expect(ids(impl.base)).toEqual(['a', 'b']);
  return { impl, a: held(impl.base)[0]! };
}
/** readBack({ hold }) whose first read waits until `during` has run, then answers `state`; later reads show nothing. */
async function delayedReadBack(impl: Impl, hold: string, state: State, during?: () => Promise<void>): Promise<boolean | undefined> {
  const gate = deferred();
  let asked = false;
  onFetch(async (c) => {
    if (c.method !== 'GET') return { status: 502, body: {} };
    if (asked) return { status: 200, body: { state: {} } };
    asked = true;
    await gate.p;
    return { status: 200, body: { state } };
  });
  let ok: boolean | undefined;
  let done!: Promise<void>;
  await act(async () => { done = impl.readBack({ hold }).then((v) => { ok = v; }); for (let i = 0; i < 20 && !asked; i++) await settle(); });
  expect(asked, 'the read-back never read').toBe(true);
  if (during) await act(async () => { await during(); await flush(); });
  await act(async () => { gate.res(); await done; await flush(); });
  return ok;
}

for (const [name, make] of IMPLS) {
  describe(`${name}: readBack({ hold }) answers true only for a stored proof of that hold`, () => {
    it('the hold is dismissed while the read is out, the read then shows it applied: false, nothing completed', async () => {
      const { impl, a } = await twoHeld(make);
      const ok = await delayedReadBack(impl, a.hold, { a: 'on' }, async () => { expect(await C.discard(a.scope, a.digest, a.hold)).toBe(true); });
      expect(ok, 'a read-back whose hold was dismissed while it read answered proved').toBe(false);
      expect(ids(impl.base)).toEqual(['b']);
      expect(C.holdOfLock(a.scope, a.digest), 'the dismissed change came back').toBeUndefined();
    });
    it('the hold is replaced while the read is out (released, sent again): false, the new send stays', async () => {
      const { impl, a } = await twoHeld(make);
      const ok = await delayedReadBack(impl, a.hold, { a: 'on' }, async () => {
        expect(await C.release(a.scope, a.digest, a.hold)).toBe(true);
        await impl.send('a');
      });
      const now = C.holdOfLock(a.scope, a.digest);
      expect(now, 'the second send left no hold').toBeTruthy();
      expect(now).not.toBe(a.hold);
      expect(ok, 'a read-back whose hold was replaced while it read answered proved').toBe(false);
      expect(ids(impl.base)).toEqual(['a', 'b']);
    });
    it('the read answers without showing the change: false, the hold stays', async () => {
      const { impl, a } = await twoHeld(make);
      expect(await delayedReadBack(impl, a.hold, {})).toBe(false);
      expect(ids(impl.base)).toEqual(['a', 'b']);
      expect(C.holdOfLock(a.scope, a.digest)).toBe(a.hold);
    });
    it('the read proves it did not apply: false, and its release is stored', async () => {
      const { impl, a } = await twoHeld(make);
      expect(await delayedReadBack(impl, a.hold, { a: 'off' }), 'a change the read proved not applied answered done').toBe(false);
      expect(ids(impl.base), 'the not-applied release was not stored').toEqual(['b']);
    });
    it('the read proves it applied and the free is stored: true, only that hold is freed', async () => {
      const { impl, a } = await twoHeld(make);
      expect(await delayedReadBack(impl, a.hold, { a: 'on', b: 'on' })).toBe(true);
      expect(ids(impl.base)).toEqual(['b']);
    });
    it('the free cannot be stored (the store turned unreadable while the read was out): false, the hold stays', async () => {
      const { impl, a } = await twoHeld(make);
      let kept: string | null = null;
      const ok = await delayedReadBack(impl, a.hold, { a: 'on' }, async () => { kept = localStorage.getItem(CHANGE_STORE_KEY); localStorage.setItem(CHANGE_STORE_KEY, '{cut'); });
      expect(ok, 'a free that was not stored answered proved').toBe(false);
      expect(ids(impl.base)).toContain('a');
      if (kept !== null) localStorage.setItem(CHANGE_STORE_KEY, kept);
    });
    it('a bare read-back with nothing pending is unchanged: true', async () => {
      const impl = make();
      await act(async () => { await flush(); });
      let ok!: boolean;
      await act(async () => { ok = await impl.readBack(); await flush(); });
      expect(ok).toBe(true);
    });
  });
}

// The three callers capture the hold synchronously with their pick, so through them `captured` always names the
// requested send; this pins proveByVerdict's own refusal of a capture that names another send (or none).
describe('proveByVerdict: a capture that is not the requested send proves nothing', () => {
  it('captured none or another send, the lock now holding the requested one, verdict applied: false, the hold stays', async () => {
    const { impl, a } = await twoHeld(hookImpl);
    for (const captured of [undefined, a.hold + '-other']) {
      let ok!: boolean;
      await act(async () => { ok = await proveByVerdict(a.scope, a.digest, captured, a.hold, C.pendingMark(), 'applied', C.senderOfLock(a.scope, a.digest)); await flush(); });
      expect(ok, `a capture of ${String(captured)} proved ${a.hold}`).toBe(false);
      expect(C.holdOfLock(a.scope, a.digest), 'a send the read never captured was freed').toBe(a.hold);
    }
    expect(ids(impl.base)).toEqual(['a', 'b']);
    let ok!: boolean;
    await act(async () => { ok = await proveByVerdict(a.scope, a.digest, a.hold, a.hold, C.pendingMark(), 'applied', C.senderOfLock(a.scope, a.digest)); await flush(); });
    expect(ok, 'the matching capture did not prove the send (the case above proves nothing)').toBe(true);
    expect(ids(impl.base)).toEqual(['b']);
  });
});

// The proof slot (query.ts readBackProof) says "not made" only when this proof
// judged the requested send not applied AND its release of exactly that hold was stored; never from a false answer.
describe('proveByVerdict: the proof slot learns "not made" only from its own stored release', () => {
  const prove = async (a: Held, verdict: 'applied' | 'not_applied' | undefined) => {
    const proof = { notApplied: false };
    let ok!: boolean;
    await act(async () => { ok = await proveByVerdict(a.scope, a.digest, a.hold, a.hold, C.pendingMark(), verdict, C.senderOfLock(a.scope, a.digest), undefined, proof); await flush(); });
    return { ok, proof: proof.notApplied };
  };
  it('not applied and released: the slot says so; applied, or no verdict: it does not', async () => {
    const { impl, a } = await twoHeld(hookImpl);
    const b = held(impl.base).find((h) => h.id === 'b')!;
    expect(await prove(a, undefined), 'a verdict of nothing said not made').toEqual({ ok: false, proof: false });
    expect(await prove(a, 'not_applied'), 'a stored not-made release left the slot unset').toEqual({ ok: false, proof: true });
    expect(ids(impl.base)).toEqual(['b']);
    expect(await prove(b, 'applied')).toEqual({ ok: true, proof: false });
  });
  it('not applied but the release cannot be stored: the slot stays unset, the hold stays', async () => {
    const { impl, a } = await twoHeld(hookImpl);
    const kept = localStorage.getItem(CHANGE_STORE_KEY);
    localStorage.setItem(CHANGE_STORE_KEY, '{cut');
    const r = await prove(a, 'not_applied');
    if (kept !== null) localStorage.setItem(CHANGE_STORE_KEY, kept);
    expect(r, 'a release that was not stored said not made').toEqual({ ok: false, proof: false });
    expect(ids(impl.base)).toContain('a');
  });
});

// Another tab's completion or Dismiss that so far reached only storage
// (no external-change notice yet; this tab's memory still holds the send pending). Its release answers true, but
// this call wrote nothing of its own, so the slot stays unset.
describe('proveByVerdict: a hold settled elsewhere only in storage is not this proof\'s "not made"', () => {
  const prove = async (a: Held) => {
    const proof = { notApplied: false };
    let ok!: boolean;
    await act(async () => { ok = await proveByVerdict(a.scope, a.digest, a.hold, a.hold, C.pendingMark(), 'not_applied', C.senderOfLock(a.scope, a.digest), undefined, proof); await flush(); });
    return { ok, proof: proof.notApplied };
  };
  // Storage only, as the other tab's write: localStorage in this document fires no storage event here.
  const storeOnly = (a: Held, how: 'removed' | 'released') => {
    const list = JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) ?? '[]') as Array<{ id: string; pending: boolean; t: number }>;
    const mine = list.filter((r) => r.pending && r.id.endsWith(a.scope + '\u0000' + a.digest));
    expect(mine, 'the send\'s stored record').toHaveLength(1);
    const t = Math.max(...list.map((r) => r.t)) + 1;
    const next = how === 'removed' ? list.filter((r) => r !== mine[0]) : list.map((r) => (r === mine[0] ? { ...r, pending: false, t } : r));
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(next));
    expect(C.holdOfLock(a.scope, a.digest), 'this tab still holds the send').toBe(a.hold);
  };
  it('another tab completed it (record removed in storage only): the slot stays unset', async () => {
    const { a } = await twoHeld(hookImpl);
    storeOnly(a, 'removed');
    expect(await prove(a), 'a record removed elsewhere read as this proof\'s not-made release').toEqual({ ok: false, proof: false });
  });
  it('another tab dismissed it (record released in storage only): the slot stays unset', async () => {
    const { a } = await twoHeld(hookImpl);
    storeOnly(a, 'released');
    expect(await prove(a), 'a record released elsewhere read as this proof\'s not-made release').toEqual({ ok: false, proof: false });
  });
});
