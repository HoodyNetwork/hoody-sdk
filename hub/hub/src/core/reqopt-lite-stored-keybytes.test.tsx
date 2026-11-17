// nothing derived from a change's secret variables is stored, and records
// an older build stored with keyBytes lose them in place. The scrub keeps every id, version and hold: a held record
// still refuses its change (READ_BACK_FIRST), so nothing is sent again under a fresh key. A secret route (secret:
// true, secret body keys, bodyText) needs a lockKey; coreSource keeps no variables of a settled secret mutation.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHANGE_FMT, CHANGE_STORE_KEY, readChanges, type StoredChange } from './change-store';
import * as C from './changes';
import { defineMutation, queryClient, varsDigest } from './query';
import { defineRoute } from './routes';
import { coreSource, type SourceMutation } from './source';
import { boot, calls, deferred, onFetch, R1, settle } from './test/env';
import { sourceTable } from '../pages/scripts/data';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 30; i++) await settle(); }
function harness<T>(use: () => T): { current: () => T } {
  let last!: T;
  function Probe() { last = use(); return null; }
  render(<Probe />, { wrapper: wrap });
  return { current: () => last };
}
const raw = (): string => localStorage.getItem(CHANGE_STORE_KEY) ?? '';
const stored = (): StoredChange[] => readChanges() ?? [];
const posts = (): number => calls.filter((c) => c.method !== 'GET').length;
/** Rewrites the stored records as an older build left them: each with a keyBytes digest. */
function plantKeyBytes(bytes: string, extra: Array<Record<string, unknown>> = []): void {
  const list = (JSON.parse(raw()) as Array<Record<string, unknown>>).map((r) => ({ ...r, keyBytes: bytes }));
  localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([...list, ...extra]));
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('reqopt-lite-stored-keybytes X1-lite: stored keyBytes are stripped in place', () => {
  const route = defineRoute({ method: 'POST', path: '/rsec1/idem', scope: 'agent', body: ['n', 'password'], idem: true, secret: ['password'] });
  const m = defineMutation<{ n: number; password: string }>(route, { input: (v) => ({ body: v }), lock: 'rsec1.idem', lockKey: (v) => ({ n: v.n }), page: 'programs' });

  it('a held plain-digest record is scrubbed on load (same id, version, key, hold), and a press of the same change refuses and sends nothing', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 502, body: {} }));
    const vars = { n: 1, password: 'pw-held-1' };
    const r = await m.run(vars);
    expect(r.outcome).toBe('pending');
    const old = await varsDigest(vars);
    plantKeyBytes(old);
    const before = stored()[0]!;
    expect(before.keyBytes).toBe(old);
    C.reloadChangesForTests();
    await flush();
    expect(raw()).not.toContain(old);
    const after = stored();
    expect(after).toHaveLength(1);
    const { keyBytes: _k, ...rest } = before;
    expect(after[0]).toEqual(rest);
    const sent = posts();
    const again = await m.run(vars);
    expect(again).toMatchObject({ outcome: 'not_sent', error: { code: 'READ_BACK_FIRST' } });
    // Other bytes of the same identity are the same change: held too, never a fresh key.
    expect(await m.run({ n: 1, password: 'pw-held-2' })).toMatchObject({ outcome: 'not_sent', error: { code: 'READ_BACK_FIRST' } });
    expect(posts()).toBe(sent);
    expect(stored()[0]).toEqual(rest);
  });

  it('a record THIS build wrote and holds has no keyBytes after a reload; a press of the same change refuses and sends nothing', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 502, body: {} }));
    const vars = { n: 3, password: 'pw-this-build' };
    const r = await m.run(vars);
    expect(r.outcome).toBe('pending');
    expect(r.idem).toBeTruthy();
    const before = stored();
    expect(before).toHaveLength(1);
    expect(before[0]!.keyBytes).toBeUndefined();
    expect(before[0]!.pending).toBe(true);
    C.reloadChangesForTests();
    await flush();
    const sent = posts();
    expect(await m.run(vars)).toMatchObject({ outcome: 'not_sent', error: { code: 'READ_BACK_FIRST' } });
    expect(await m.run({ n: 3, password: 'pw-other' })).toMatchObject({ outcome: 'not_sent', error: { code: 'READ_BACK_FIRST' } });
    expect(posts()).toBe(sent);
    expect(stored()).toEqual(before);
  });

  it('every record loses keyBytes, another account\'s too; nothing else moves and nothing is removed', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 502, body: {} }));
    await m.run({ n: 2, password: 'pw-two' });
    // A current-format record (fmt): the c3 chain converts a record with no fmt (an older build's) at the turn's start.
    const foreign = { id: 'other-account\u0001s:x\u0000d', pending: true, key: 'k-foreign', t: 7, fmt: CHANGE_FMT };
    plantKeyBytes('b'.repeat(64), [{ ...foreign, keyBytes: 'c'.repeat(64) }]);
    const mine = stored().find((r) => r.id !== foreign.id)!;
    C.reloadChangesForTests();
    await flush();
    const list = stored();
    expect(list.some((r) => r.keyBytes !== undefined)).toBe(false);
    expect(list.find((r) => r.id === foreign.id)).toEqual(foreign);
    const { keyBytes: _k, ...rest } = mine;
    expect(list.find((r) => r.id === mine.id)).toEqual(rest);
  });

  it('a corrupt store is left as it is (its unreadable records are never written away)', async () => {
    boot({ realm: R1 });
    const bad = JSON.stringify([{ id: 'a\u0001s\u0000d', pending: true, key: null, t: 1, keyBytes: 'd'.repeat(64) }, { nonsense: true }]);
    localStorage.setItem(CHANGE_STORE_KEY, bad);
    C.reloadChangesForTests();
    await flush();
    expect(raw()).toBe(bad);
  });
});

describe('reqopt-lite-stored-keybytes B: no digest of secret variables is stored', () => {
  it('a password change under a lockKey: two passwords give the same id and record, and no keyBytes is stored', async () => {
    const route = defineRoute({ method: 'POST', path: '/rsec1/pw', scope: 'agent', body: ['user', 'password'], secret: true, idem: true });
    const m = defineMutation<{ user: string; password: string }>(route, { input: (v) => ({ body: v }), lock: 'rsec1.pw', lockKey: (v) => ({ user: v.user }), page: 'programs' });
    const ids: string[] = [];
    for (const password of ['first-pw-Hx7', 'second-pw-Qz9']) {
      boot({ realm: R1 });
      onFetch(() => ({ status: 502, body: {} }));
      const r = await m.run({ user: 'u', password });
      expect(r.outcome).toBe('pending');
      const list = stored();
      expect(list).toHaveLength(1);
      expect(list[0]!.keyBytes).toBeUndefined();
      expect(raw()).not.toContain(await varsDigest({ user: 'u', password }));
      expect(raw()).not.toContain(password);
      ids.push(list[0]!.id);
    }
    expect(ids[0]).toBe(ids[1]);
  });

  it('no write of the store ever carries keyBytes (not only what is left after the scrub)', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 502, body: {} }));
    const route = defineRoute({ method: 'POST', path: '/rsec1/writes', scope: 'agent', body: ['user', 'password'], secret: true, idem: true });
    const m = defineMutation<{ user: string; password: string }>(route, { input: (v) => ({ body: v }), lock: 'rsec1.writes', lockKey: (v) => ({ user: v.user }), page: 'programs' });
    const writes: string[] = [];
    const real = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => { if (k === CHANGE_STORE_KEY) writes.push(v); real(k, v); });
    const vars = { user: 'w', password: 'pw-writes-1' };
    const r = await m.run(vars);
    await flush();
    expect(await m.settle(vars, r.hold!)).toBe(true);
    await m.run(vars);
    await flush();
    expect(writes.length).toBeGreaterThan(0);
    const digest = await varsDigest(vars);
    expect(writes.filter((w) => w.includes('keyBytes') || w.includes(digest))).toEqual([]);
  });

  it('a secret route without a lockKey is refused when defined: secret: true, secret body keys and bodyText; a plain route is not', () => {
    const t = defineRoute({ method: 'POST', path: '/rsec1/t', scope: 'agent', body: ['v'], secret: true });
    const k = defineRoute({ method: 'POST', path: '/rsec1/k', scope: 'agent', body: ['v'], secret: ['v'] });
    const p = defineRoute({ method: 'POST', path: '/rsec1/p', scope: 'agent', body: ['v'] });
    for (const [i, r] of [t, k].entries()) {
      expect(() => defineMutation<{ v: string }>(r, { input: (v) => ({ body: v }) })).toThrow(/secret route needs a lockKey/);
      expect(() => coreSource('rsec1nolock' + i, { changes: { put: { route: r, input: (v: { v: string }) => ({ body: v }) } } })).toThrow(/secret route needs a lockKey/);
      expect(() => defineMutation<{ v: string }>(r, { input: (v) => ({ body: v }), lockKey: () => 'one' })).not.toThrow();
    }
    expect(() => defineMutation<{ v: string }>(p, { input: (v) => ({ body: v }) })).not.toThrow();
  });

  it('coreSource on a secret route: the settled mutation keeps no variables; its outcome is still shown until reset()', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const route = defineRoute<unknown, { pin: string; name: string }>({ method: 'POST', path: '/rsec1/settle', scope: 'agent', body: ['pin', 'name'], secret: true });
    const plain = defineRoute<unknown, { label: string }>({ method: 'POST', path: '/rsec1/settle-plain', scope: 'agent', body: ['label'] });
    const t = { changes: {
      put: { route, input: (v: { pin: string; name: string }) => ({ body: v }), lockKey: (v: { name: string }) => ({ name: v.name }) },
      label: { route: plain, input: (v: { label: string }) => ({ body: v }) },
    } };
    onFetch(() => ({ status: 200, body: { ok: true } }));
    const src = coreSource('rsec1settle', t);
    const h = harness(() => ({ s: src.useMutation<unknown, { pin: string; name: string }>('put') as SourceMutation<unknown, { pin: string; name: string }>, p: src.useMutation<unknown, { label: string }>('label') }));
    await act(async () => { await h.current().s.mutateAsync({ pin: '271828', name: 'n' }); await flush(); });
    expect(JSON.stringify(queryClient.getMutationCache().getAll().map((x) => x.state.variables ?? null))).not.toContain('271828');
    expect(h.current().s.variables).toBeUndefined();
    expect(h.current().s.isSuccess).toBe(true);
    expect(h.current().s.status).toBe('success');
    expect(h.current().s.data).toMatchObject({ outcome: 'done' });
    await act(async () => { h.current().s.mutate({ pin: '314159', name: 'n2' }); await flush(); });
    expect(JSON.stringify(queryClient.getMutationCache().getAll().map((x) => x.state.variables ?? null))).not.toContain('314159');
    expect(h.current().s.data).toMatchObject({ outcome: 'done' });
    await act(async () => { h.current().s.reset(); await flush(); });
    expect(h.current().s.isIdle).toBe(true);
    expect(h.current().s.data).toBeUndefined();
    // A non-secret route keeps TanStack's own behaviour (its variables stay until reset).
    await act(async () => { await h.current().p.mutateAsync({ label: 'shown-label' }); await flush(); });
    expect(h.current().p.variables).toEqual({ label: 'shown-label' });
  });
});

describe('only the newest secret call publishes an outcome or resets the observer', () => {
  const route = defineRoute<unknown, { pin: string; name: string }>({ method: 'POST', path: '/rsec1/order', scope: 'agent', body: ['pin', 'name'], secret: true });
  const t = { changes: { put: { route, input: (v: { pin: string; name: string }) => ({ body: v }), lockKey: (v: { name: string }) => ({ name: v.name }) } } };
  const src = coreSource('rsec1order', t);
  function rig() {
    boot({ realm: R1 });
    queryClient.clear();
    const gates: Record<string, ReturnType<typeof deferred<void>>> = { a: deferred<void>(), b: deferred<void>() };
    onFetch(async (c) => { const n = (c.body as { name: string }).name; await gates[n]!.p; return { status: 200, body: { who: n } }; });
    const h = harness(() => src.useMutation<unknown, { pin: string; name: string }>('put') as SourceMutation<unknown, { pin: string; name: string }>);
    return { h, gates };
  }
  const who = (d: unknown): unknown => (d as { data?: { who?: string } } | undefined)?.data?.who;

  it('A sent, B sent, B settles, A settles: B stays shown', async () => {
    const { h, gates } = rig();
    let pa!: Promise<unknown>, pb!: Promise<unknown>;
    await act(async () => { pa = h.current().mutateAsync({ pin: '1', name: 'a' }); await flush(); pb = h.current().mutateAsync({ pin: '2', name: 'b' }); await flush(); });
    await act(async () => { gates.b!.res(); await pb; await flush(); });
    expect(who(h.current().data)).toBe('b');
    await act(async () => { gates.a!.res(); await pa; await flush(); });
    expect(who(h.current().data)).toBe('b');
    expect(h.current().isSuccess).toBe(true);
  });

  it('A settles while B is pending: B keeps its observer (its onSuccess runs) and A is never shown', async () => {
    const { h, gates } = rig();
    const onB = vi.fn();
    let pa!: Promise<unknown>, pb!: Promise<unknown>;
    await act(async () => { pa = h.current().mutateAsync({ pin: '1', name: 'a' }); await flush(); pb = h.current().mutateAsync({ pin: '2', name: 'b' }, { onSuccess: onB }); await flush(); });
    await act(async () => { gates.a!.res(); await pa; await flush(); });
    expect(who(h.current().data)).toBeUndefined();
    expect(h.current().isSuccess).toBe(false);
    await act(async () => { gates.b!.res(); await pb; await flush(); });
    expect(onB).toHaveBeenCalledTimes(1);
    expect(who(h.current().data)).toBe('b');
  });

  it('reset() during a call: its later outcome is never shown', async () => {
    const { h, gates } = rig();
    let pa!: Promise<unknown>;
    await act(async () => { pa = h.current().mutateAsync({ pin: '1', name: 'a' }); await flush(); });
    act(() => { h.current().reset(); });
    await act(async () => { gates.a!.res(); await pa; await flush(); });
    expect(h.current().data).toBeUndefined();
    expect(h.current().isIdle).toBe(true);
  });
});

describe('a call made re-entrantly from input() leaves no secret variables behind', () => {
  const route = defineRoute<unknown, { pin: string; name: string }>({ method: 'POST', path: '/rsec1/reenter', scope: 'agent', body: ['pin', 'name'], secret: true });
  const hooks: { onInput?: (v: { pin: string; name: string }) => void } = {};
  const t = { changes: { put: { route, input: (v: { pin: string; name: string }) => { hooks.onInput?.(v); return { body: v }; }, lockKey: (v: { name: string }) => ({ name: v.name }) } } };
  const src = coreSource('rsec1reenter', t);
  const cached = (): string => JSON.stringify(queryClient.getMutationCache().getAll().map((x) => x.state.variables ?? null));
  function rig() {
    boot({ realm: R1 });
    queryClient.clear();
    const gates: Record<string, ReturnType<typeof deferred<void>>> = { a: deferred<void>(), b: deferred<void>() };
    onFetch(async (c) => { const n = (c.body as { name: string }).name; await gates[n]!.p; return { status: 200, body: { who: n } }; });
    const h = harness(() => src.useMutation<unknown, { pin: string; name: string }>('put') as SourceMutation<unknown, { pin: string; name: string }>);
    return { h, gates };
  }
  afterEach(() => { delete hooks.onInput; });

  it("input() calls reset(): once the call settles, neither the hook nor the cache keeps its variables", async () => {
    const { h, gates } = rig();
    hooks.onInput = (v) => { if (v.name === 'a') h.current().reset(); };
    let pa!: Promise<unknown>;
    await act(async () => { pa = h.current().mutateAsync({ pin: '161803', name: 'a' }); await flush(); });
    await act(async () => { gates.a!.res(); await pa; await flush(); });
    expect(h.current().variables).toBeUndefined();
    expect(cached()).not.toContain('161803');
  });

  it('input() starts another call: the outer call settles first, then the inner; no variables are left at any point after a settle', async () => {
    const { h, gates } = rig();
    let pb!: Promise<unknown>;
    hooks.onInput = (v) => { if (v.name === 'a') pb = h.current().mutateAsync({ pin: '577215', name: 'b' }); };
    let pa!: Promise<unknown>;
    await act(async () => { pa = h.current().mutateAsync({ pin: '141421', name: 'a' }); await flush(); });
    await act(async () => { gates.a!.res(); await pa; await flush(); });
    expect(h.current().variables).toBeUndefined();
    expect(cached()).not.toContain('141421');
    await act(async () => { gates.b!.res(); await pb; await flush(); });
    expect(h.current().variables).toBeUndefined();
    expect(cached()).not.toContain('577215');
  });
});

describe('a call made re-entrantly from input() is the newer call', () => {
  const route = defineRoute<unknown, { pin: string; name: string }>({ method: 'POST', path: '/rsec1/nested', scope: 'agent', body: ['pin', 'name'], secret: true });
  const hooks: { onInput?: (v: { pin: string; name: string }) => void; input?: (v: { pin: string; name: string }) => object | undefined } = {};
  const t = { changes: { put: { route, input: (v: { pin: string; name: string }) => { hooks.onInput?.(v); return hooks.input?.(v) ?? { body: v }; }, lockKey: (v: { name: string }) => ({ name: v.name }) } } };
  const src = coreSource('rsec1nested', t);
  const cached = (): string => JSON.stringify(queryClient.getMutationCache().getAll().map((x) => x.state.variables ?? null));
  const who = (d: unknown): unknown => (d as { data?: { who?: string } } | undefined)?.data?.who;
  function rig() {
    boot({ realm: R1 });
    queryClient.clear();
    const gates: Record<string, ReturnType<typeof deferred<void>>> = { a: deferred<void>(), b: deferred<void>(), c: deferred<void>() };
    onFetch(async (c) => { const n = (c.body as { name: string }).name; await gates[n]!.p; return { status: 200, body: { who: n } }; });
    const h = harness(() => src.useMutation<unknown, { pin: string; name: string }>('put') as SourceMutation<unknown, { pin: string; name: string }>);
    return { h, gates };
  }
  afterEach(() => { delete hooks.onInput; delete hooks.input; });

  for (const order of [['b', 'a'], ['a', 'b']] as const) {
    it(`A's input() starts B; ${order[0].toUpperCase()} settles, then ${order[1].toUpperCase()}: B stays shown, its onSuccess runs at most once, no variables are left`, async () => {
      const { h, gates } = rig();
      const onB = vi.fn();
      const p: Record<string, Promise<unknown>> = {};
      hooks.onInput = (v) => { if (v.name === 'a') p.b = h.current().mutateAsync({ pin: '577215', name: 'b' }, { onSuccess: onB }); };
      await act(async () => { p.a = h.current().mutateAsync({ pin: '141421', name: 'a' }); await flush(); });
      for (const n of order) await act(async () => { gates[n]!.res(); await p[n]; await flush(); });
      expect(who(h.current().data)).toBe('b');
      expect(h.current().isSuccess).toBe(true);
      expect(cached()).not.toContain('141421');
      expect(cached()).not.toContain('577215');
      // B's own callback is TanStack's to run only while B is the observed call: A attached after it, so it is
      // lost as for any two overlapping calls; the outcome shown is still B's.
      expect(onB.mock.calls.length).toBeLessThanOrEqual(1);
    });
  }

  it('A starts B, whose input() starts C; they settle A, C, B: C stays shown and no variables are left', async () => {
    const { h, gates } = rig();
    const p: Record<string, Promise<unknown>> = {};
    hooks.onInput = (v) => {
      if (v.name === 'a') p.b = h.current().mutateAsync({ pin: '577215', name: 'b' });
      if (v.name === 'b') p.c = h.current().mutateAsync({ pin: '662607', name: 'c' });
    };
    await act(async () => { p.a = h.current().mutateAsync({ pin: '141421', name: 'a' }); await flush(); });
    for (const n of ['a', 'c', 'b']) await act(async () => { gates[n]!.res(); await p[n]; await flush(); });
    expect(who(h.current().data)).toBe('c');
    for (const pin of ['141421', '577215', '662607']) expect(cached()).not.toContain(pin);
  });

  it("A's input() starts B, then A's press throws: B stays observed (its onSuccess runs) and is what is shown; A rejects", async () => {
    const { h, gates } = rig();
    const onB = vi.fn();
    const p: Record<string, Promise<unknown>> = {};
    hooks.onInput = (v) => { if (v.name === 'a') p.b = h.current().mutateAsync({ pin: '577215', name: 'b' }, { onSuccess: onB }); };
    hooks.input = (v) => v.name === 'a' ? { body: v, get target(): never { throw new Error('press'); } } : undefined;
    let aErr: unknown = null;
    await act(async () => { await h.current().mutateAsync({ pin: '141421', name: 'a' }).catch((e: unknown) => { aErr = e; }); await flush(); });
    expect(aErr).toBeInstanceOf(Error);
    expect(h.current().isPending).toBe(true); // B still observed: the throw reset nothing
    await act(async () => { gates.b!.res(); await p.b; await flush(); });
    expect(onB).toHaveBeenCalledTimes(1);
    expect(who(h.current().data)).toBe('b');
    expect(h.current().isError).toBe(false);
    expect(cached()).not.toContain('577215');
    expect(cached()).not.toContain('141421');
  });

  it("A is pending when B's press throws: A stays observed (its onSuccess runs); B's error is shown once A settles", async () => {
    const { h, gates } = rig();
    const onA = vi.fn();
    const p: Record<string, Promise<unknown>> = {};
    hooks.input = (v) => v.name === 'b' ? { body: v, get target(): never { throw new Error('press'); } } : undefined;
    await act(async () => { p.a = h.current().mutateAsync({ pin: '141421', name: 'a' }, { onSuccess: onA }); await flush(); });
    let bErr: unknown = null;
    await act(async () => { await h.current().mutateAsync({ pin: '577215', name: 'b' }).catch((e: unknown) => { bErr = e; }); await flush(); });
    expect(bErr).toBeInstanceOf(Error);
    expect(h.current().isPending).toBe(true);
    await act(async () => { gates.a!.res(); await p.a; await flush(); });
    expect(onA).toHaveBeenCalledTimes(1);
    expect(h.current().isError).toBe(true);
    expect(who(h.current().data)).toBeUndefined();
    expect(cached()).not.toContain('141421');
  });

  it("two overlapping calls: B settles while A is pending; B's variables leave the cache at once, A's when it settles", async () => {
    const { h, gates } = rig();
    const p: Record<string, Promise<unknown>> = {};
    await act(async () => { p.a = h.current().mutateAsync({ pin: '141421', name: 'a' }); await flush(); p.b = h.current().mutateAsync({ pin: '577215', name: 'b' }); await flush(); });
    await act(async () => { gates.b!.res(); await p.b; await flush(); });
    expect(cached()).not.toContain('577215');
    expect(who(h.current().data)).toBe('b');
    await act(async () => { gates.a!.res(); await p.a; await flush(); });
    expect(cached()).not.toContain('141421');
    expect(who(h.current().data)).toBe('b');
  });
});

// The Bots lockKeys are the Bots page's lines, tested by pages/bots/lockkeys.test.ts (theirs, byte for byte).
describe('reqopt-lite-stored-keybytes page lockKeys: scripts comments never name the lock', () => {
  it('scripts commentsCheck by path (its comments are secret); validate keeps its fixed identity', () => {
    const ch = sourceTable.changes as unknown as Record<string, { lockKey?: (v: unknown) => unknown }>;
    expect(ch.commentsCheck!.lockKey!({ path: 'a.ts', ifRevision: 'r', comments: { token: 'secret-value' } })).toEqual({ path: 'a.ts' });
    expect(ch.validate!.lockKey!({ code: 'secret-code' })).toBe('validate');
  });
});
