// query.ts and the fixture transport: keys follow [account, realm, gen], late answers never render,
// mutations never retry and must be read back after a pending outcome.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, outcomeOf } from './api';
import { bump, resetCore, setIdentity, setRealm, setTarget, snapshot } from './ctx';
import { CoreQueryProvider, defineMutation, defineQuery, queryClient, varsDigest, type MutationResult } from './query';
import { keepsChanges, useChangesVersion } from './index';
import { heldChanges } from './changes';
import { defineRoute } from './routes';
import { readPage } from './session';
import { answers, defineFixtures, FIXTURE_UID, installTransport, reply, startFixtureMode, type FixtureRule } from './transport';
import { microFlush } from './test/env';

const list = defineRoute<{ data: string[] }>({ method: 'GET', path: '/computers', scope: 'realm' });
const start = defineRoute<{ ok: boolean }>({ method: 'POST', path: '/computers/:id/start', scope: 'realm', body: [] });
const bots = defineRoute<{ items: string[] }>({ method: 'GET', path: '/bots', scope: 'agent' });

const containers = defineQuery(list, { select: (r) => r.data });
// A read-back that proves the change did not apply: frees it with its key kept (a plain read frees nothing).
const notApplied = () => 'not_applied' as const;
const startOne = defineMutation<{ id: string }>(start, { input: (v) => ({ params: { id: v.id } }), reads: [containers], proves: notApplied });

function mode(rules: readonly FixtureRule[]) {
  resetCore();
  startFixtureMode(rules, { realm: 'aaaaaaaaaaaaaaaaaaaaaaa1', target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } } });
  queryClient.clear();
}

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

beforeEach(() => { bump('test-boot'); });
afterEach(() => { cleanup(); installTransport(null); });

describe('fixtures', () => {
  const { states } = defineFixtures({
    default: 'many',
    states: {
    many: [reply(list, { body: { data: ['a', 'b'] } }), reply(bots, { body: { items: ['x'] } })],
    pending: [reply(start, answers.pending5xx())],
    lost: [reply(start, answers.lost(5))],
    late: [reply(list, answers.late({ data: ['old'] }, 5))],
    },
  });
  it('a declared answer comes back for its route, agent routes included', async () => {
    mode(states.many);
    expect(await api(list)).toEqual({ data: ['a', 'b'] });
    expect(await api(bots)).toEqual({ items: ['x'] });
  });
  it('a route without a rule answers 501 NO_FIXTURE', async () => {
    mode(states.many);
    await expect(api(start, { params: { id: 'c1' } })).rejects.toMatchObject({ status: 501, code: 'NO_FIXTURE' });
  });
  it('a 5xx or a lost answer to a change is pending', async () => {
    mode(states.pending);
    expect(outcomeOf(await api(start, { params: { id: 'c1' } }).catch((e) => e))).toBe('pending');
    mode(states.lost);
    expect(outcomeOf(await api(start, { params: { id: 'c1' } }).catch((e) => e))).toBe('pending');
  });
  it('a late answer to a read is dropped as stale', async () => {
    mode(states.late);
    expect(outcomeOf(await api(list).catch((e) => e))).toBe('stale');
  });
  it('rules can match requests and answer a limited number of times', async () => {
    mode([reply(start, { status: 409, body: { error: 'BUSY' } }, { times: 1 }), reply(start, { body: { ok: true } }, { when: (r) => r.path === '/computers/c2/start' })]);
    await expect(api(start, { params: { id: 'c1' } })).rejects.toMatchObject({ status: 409, code: 'BUSY' });
    expect(await api(start, { params: { id: 'c2' } })).toEqual({ ok: true });
  });
  it('the fixture session is the fixture account', () => {
    mode([]);
    expect(readPage()).toMatchObject({ kind: 'account', uid: FIXTURE_UID });
  });
});

describe('defineQuery', () => {
  it('keys are prefixed with account, realm and gen (and the computer for agent routes)', () => {
    mode([]);
    const k = containers.key(undefined);
    expect(k.slice(0, 5)).toEqual(['hub', FIXTURE_UID, 'aaaaaaaaaaaaaaaaaaaaaaa1', expect.any(Number), list.id]);
    expect(defineQuery(bots).key(undefined).slice(5, 7)).toEqual(['p1', 'c1']);
  });
  it('a realm switch drops every cached answer of the old generation', async () => {
    mode([reply(list, { body: { data: ['a'] } })]);
    await containers.fetch(undefined);
    expect(queryClient.getQueryCache().getAll().length).toBe(1);
    bump('switch');
    expect(queryClient.getQueryCache().getAll().length).toBe(0);
  });
  it('a late answer never renders: the view shows the new generation\'s answer', async () => {
    let n = 0;
    mode([reply(list, () => (++n === 1 ? { body: { data: ['old'] }, delayMs: 40 } : { body: { data: ['new'] } }))]);
    function View() {
      const q = containers.use(undefined);
      return <p>{q.data ? q.data.join(',') : q.isError ? 'error' : 'loading'}</p>;
    }
    render(<View />, { wrapper: wrap });
    expect(screen.getByText('loading')).toBeTruthy();
    act(() => { bump('switch'); });
    await waitFor(() => expect(screen.getByText('new')).toBeTruthy());
    await new Promise((r) => setTimeout(r, 60));
    expect(screen.queryByText('old')).toBeNull();
    expect(screen.getByText('new')).toBeTruthy();
  });
  it('reads are not retried', async () => {
    let n = 0;
    mode([reply(list, () => { n++; return { status: 503, body: {} }; })]);
    const { result } = renderHook(() => containers.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(n).toBe(1);
    expect(outcomeOf(result.current.error)).toBe('failed');
  });
});

describe('defineMutation', () => {
  it('done: the outcome, and the declared reads are read again', async () => {
    let reads = 0;
    mode([reply(list, () => { reads++; return { body: { data: ['a'] } }; }), reply(start, { body: { ok: true } })]);
    const { result } = renderHook(() => ({ q: containers.use(undefined), m: startOne.use() }), { wrapper: wrap });
    await waitFor(() => expect(result.current.q.data).toEqual(['a']));
    let res;
    await act(async () => { res = await result.current.m.run({ id: 'c1' }); });
    expect(res).toMatchObject({ outcome: 'done', data: { ok: true } });
    await waitFor(() => expect(reads).toBe(2));
    expect(result.current.m.outcome).toBe('done');
  });
  it('pending: never retried, run() refused until readBack(), which re-reads', async () => {
    let sends = 0, reads = 0;
    mode([reply(list, () => { reads++; return { body: { data: ['a'] } }; }), reply(start, () => { sends++; return { status: 502, body: {} }; })]);
    const { result } = renderHook(() => ({ q: containers.use(undefined), m: startOne.use() }), { wrapper: wrap });
    await waitFor(() => expect(result.current.q.data).toEqual(['a']));
    await act(async () => { await result.current.m.run({ id: 'c1' }); });
    expect(result.current.m.outcome).toBe('pending');
    expect(sends).toBe(1);
    let again;
    await act(async () => { again = await result.current.m.run({ id: 'c1' }); });
    expect(again).toMatchObject({ outcome: 'not_sent', error: { code: 'READ_BACK_FIRST' } });
    expect(sends).toBe(1);
    await act(async () => { await result.current.m.readBack(); });
    expect(result.current.m.outcome).toBe('read');
    expect(reads).toBe(2);
    await act(async () => { await result.current.m.run({ id: 'c1' }); });
    expect(sends).toBe(2);
  });
  it('a failed read-back keeps it pending; the retry after a good read-back reuses the key', async () => {
    const create = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['x'], idem: true });
    const sessions = defineQuery(defineRoute<{ data: string[] }>({ method: 'GET', path: '/sessions', scope: 'agent' }), { select: (r) => r.data });
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions], proves: notApplied });
    let readFails = false;
    const keys: unknown[] = [];
    mode([
      reply(sessions.route, () => (readFails ? { status: 503, body: {} } : { body: { data: [] } })),
      reply(create, (r) => { keys.push(r.n); return { status: 502, body: {} }; }),
    ]);
    const idems: (string | undefined)[] = [];
    const { result } = renderHook(() => ({ q: sessions.use(undefined), m: m.use() }), { wrapper: wrap });
    await waitFor(() => expect(result.current.q.data).toEqual([]));
    await act(async () => { idems.push((await result.current.m.run({ x: 1 })).idem); });
    expect(result.current.m.outcome).toBe('pending');
    readFails = true;
    await act(async () => { await result.current.m.readBack(); });
    expect(result.current.m.outcome).toBe('pending');
    let again;
    await act(async () => { again = await result.current.m.run({ x: 1 }); });
    expect(again).toMatchObject({ outcome: 'not_sent', error: { code: 'READ_BACK_FIRST' } });
    readFails = false;
    await act(async () => { await result.current.m.readBack(); });
    expect(result.current.m.outcome).toBe('read');
    await act(async () => { idems.push((await result.current.m.run({ x: 1 })).idem); });
    expect(keys).toHaveLength(2);
    expect(idems[1]).toBe(idems[0]);
  });
  it('a read-back with no declared reads never unlocks', async () => {
    mode([reply(start, { status: 502, body: {} })]);
    const bare = defineMutation<{ id: string }>(start, { input: (v) => ({ params: { id: v.id } }) });
    const { result } = renderHook(() => bare.use(), { wrapper: wrap });
    await act(async () => { await result.current.run({ id: 'c1' }); });
    await act(async () => { await result.current.readBack(); });
    expect(result.current.outcome).toBe('pending');
  });
  it('a route with idem gets a fresh key per run', async () => {
    const create = defineRoute({ method: 'POST', path: '/sessions', scope: 'agent', body: ['x'], idem: true });
    const keys: string[] = [];
    mode([reply(create, (r) => { keys.push(String(r.n)); return { body: {} }; })]);
    const m = defineMutation<void>(create, { input: () => ({ body: { x: 1 } }) });
    const a = await m.run(), b = await m.run();
    expect(a.idem).toMatch(/^hub-/);
    expect(a.idem).not.toBe(b.idem);
  });
});

describe('the run() guard, the replay key, read-backs and the mutation cache', () => {
  const create = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['x'], idem: true });
  const sessions = defineQuery(defineRoute<{ data: string[] }>({ method: 'GET', path: '/sessions', scope: 'agent' }), { select: (r) => r.data });
  const versions = defineQuery(defineRoute<{ data: string[] }>({ method: 'GET', path: '/versions', scope: 'agent' }), { select: (r) => r.data });

  it('run() refuses a pending change (READ_BACK_FIRST) and reuses its key after the read-back, like use()', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions], proves: notApplied });
    let sends = 0;
    mode([reply(sessions.route, { body: { data: [] } }), reply(create, () => { sends++; return { status: 502, body: {} }; })]);
    const { result } = renderHook(() => sessions.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(result.current.data).toEqual([]));
    const a = await m.run({ x: 1 });
    expect(a.outcome).toBe('pending');
    const b = await m.run({ x: 1 });
    expect(b).toMatchObject({ outcome: 'not_sent', error: { code: 'READ_BACK_FIRST' } });
    expect(sends).toBe(1);
    // Another change (other variables) is its own operation.
    expect((await m.run({ x: 2 })).outcome).toBe('pending');
    expect(sends).toBe(2);
    expect(await m.readBack()).toBe(true);
    const c = await m.run({ x: 1 });
    expect(sends).toBe(3);
    expect(c.idem).toBe(a.idem);
  });
  it('a second run() of the same change while the first runs is BUSY', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions] });
    let release!: () => void;
    mode([reply(create, () => new Promise((res) => { release = () => res({ body: {} }); }))]);
    const first = m.run({ x: 5 });
    await new Promise((r) => setTimeout(r, 10));
    expect(await m.run({ x: 5 })).toMatchObject({ outcome: 'not_sent', error: { code: 'BUSY' } });
    await release();
    expect((await first).outcome).toBe('done');
  });
  it('a replay that fails keeps the original key; the next run reuses it', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions], proves: notApplied });
    let n = 0;
    mode([reply(sessions.route, { body: { data: [] } }), reply(create, () => (++n === 1 ? { status: 502, body: {} } : { status: 429, body: { error: 'RATE_LIMITED' } }))]);
    const { result } = renderHook(() => ({ q: sessions.use(undefined), m: m.use() }), { wrapper: wrap });
    await waitFor(() => expect(result.current.q.data).toEqual([]));
    let a!: { idem?: string }, b!: { idem?: string; outcome: string }, c!: { idem?: string };
    await act(async () => { a = await result.current.m.run({ x: 1 }); });
    await act(async () => { await result.current.m.readBack(); });
    await act(async () => { b = await result.current.m.run({ x: 1 }); });
    // A refused replay proves nothing about the first send: it stays pending under the same key.
    expect(b.outcome).toBe('pending');
    expect(b.idem).toBe(a.idem);
    await act(async () => { await result.current.m.readBack(); });
    await act(async () => { c = await result.current.m.run({ x: 1 }); });
    expect(c.idem).toBe(a.idem);
  });
  it('a disabled (never fetched) read does not wedge the read-back; an enabled one is read fresh', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions, versions], proves: notApplied });
    mode([reply(sessions.route, { body: { data: [] } }), reply(versions.route, { body: { data: [] } }), reply(create, { status: 502, body: {} })]);
    const { result } = renderHook(() => ({ q: sessions.use(undefined), v: versions.use(undefined, { enabled: false }), m: m.use() }), { wrapper: wrap });
    await waitFor(() => expect(result.current.q.data).toEqual([]));
    await act(async () => { await result.current.m.run({ x: 1 }); });
    await act(async () => { await result.current.m.readBack(); });
    expect(result.current.m.outcome).toBe('read');
  });
  it('no release without proves: a fresh read-back keeps the change held; only dismiss() frees it, key kept', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions] });
    let sends = 0;
    mode([reply(sessions.route, { body: { data: [] } }), reply(create, () => { sends++; return { status: 502, body: {} }; })]);
    const { result } = renderHook(() => ({ q: sessions.use(undefined), m: m.use() }), { wrapper: wrap });
    await waitFor(() => expect(result.current.q.data).toEqual([]));
    let a!: { idem?: string }, b!: { idem?: string; outcome: string; error?: { code?: string | null } };
    await act(async () => { a = await result.current.m.run({ x: 1 }); });
    let ok = true;
    await act(async () => { ok = await result.current.m.readBack(); });
    expect(ok).toBe(false);
    expect(result.current.m.outcome).toBe('pending');
    await act(async () => { b = await result.current.m.run({ x: 1 }); });
    expect(b.error?.code).toBe('READ_BACK_FIRST');
    expect(sends).toBe(1);
    await act(async () => { result.current.m.dismiss(); await microFlush(); });
    await act(async () => { b = await result.current.m.run({ x: 1 }); });
    expect(sends).toBe(2);
    expect(b.idem).toBe(a.idem);
  });
  it('dismiss checks the sender: another definition sharing the lock cannot free this change', async () => {
    const mine = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions], lock: 'test.shared.dismiss', lockKey: () => ({}) });
    const other = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions], lock: 'test.shared.dismiss', lockKey: () => ({}) });
    mode([reply(sessions.route, { body: { data: [] } }), reply(create, { status: 502, body: {} })]);
    expect((await mine.run({ x: 1 })).outcome).toBe('pending');
    const { result } = renderHook(() => other.use(), { wrapper: wrap });
    expect(result.current.outcome).toBe('pending');
    await act(async () => { result.current.dismiss(); await other.dismiss({ x: 1 }, (await other.holdOf({ x: 1 }))!); });
    expect(await mine.isPending({ x: 1 })).toBe(true);
    await mine.dismiss({ x: 1 }, (await mine.holdOf({ x: 1 }))!);
    expect(await mine.isPending({ x: 1 })).toBe(false);
  });
  it('when every read is disabled nothing was read back: it stays pending', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [versions] });
    mode([reply(versions.route, { body: { data: [] } }), reply(create, { status: 502, body: {} })]);
    const { result } = renderHook(() => ({ v: versions.use(undefined, { enabled: false }), m: m.use() }), { wrapper: wrap });
    await act(async () => { await result.current.m.run({ x: 1 }); });
    await act(async () => { await result.current.m.readBack(); });
    expect(result.current.m.outcome).toBe('pending');
  });
  it('a first load already in flight when recovery starts is not the read-back: a new GET is sent', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions] });
    let gets = 0;
    const held: (() => void)[] = [];
    mode([
      reply(sessions.route, () => { gets++; return gets === 1 ? new Promise((res) => { held.push(() => res({ body: { data: ['old'] } })); }) : { body: { data: ['new'] } }; }),
      reply(create, { status: 502, body: {} }),
    ]);
    const { result } = renderHook(() => ({ q: sessions.use(undefined), m: m.use() }), { wrapper: wrap });
    await waitFor(() => expect(gets).toBe(1));
    await act(async () => { await result.current.m.run({ x: 1 }); });
    let rb!: Promise<boolean>;
    await act(async () => { rb = result.current.m.readBack(); await new Promise((r) => setTimeout(r, 20)); held.forEach((f) => f()); await rb; });
    expect(gets).toBe(2);
  });
  it('C9: a generation bump clears the mutation cache (its variables may hold secrets)', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }) });
    mode([reply(create, { body: {} })]);
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    await act(async () => { await result.current.run({ x: 42 }); });
    expect(queryClient.getMutationCache().getAll().length).toBeGreaterThan(0);
    act(() => { bump('account'); });
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });
});

describe('fixture requests carry the target', () => {
  it('an agent call\'s rule sees the computer it goes to; a Hoody API call sees null', async () => {
    const seen: (string | null)[] = [];
    mode([
      reply(bots, (r) => { seen.push(r.target?.container.id ?? null); return { body: { items: [] } }; }),
      reply(list, (r) => { seen.push(r.target === null ? 'none' : 'some'); return { body: { data: [] } }; }),
    ]);
    await api(bots, {});
    await api(bots, { target: { project: { id: 'p2' }, container: { id: 'c2', server_name: 's1' } } });
    await api(list, {});
    expect(seen).toEqual(['c1', 'c2', 'none']);
  });
});

describe('no declared reads hold until settle; the read-back start fence', () => {
  const create = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['x'], idem: true });
  const sessions = defineQuery(defineRoute<{ data: string[] }>({ method: 'GET', path: '/sessions', scope: 'agent' }), { select: (r) => r.data });

  it('a lost answer on a change with no declared reads is pending, holds, and settle(vars) releases it (same key)', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }) });
    let sends = 0;
    mode([reply(create, () => (++sends === 1 ? { status: 502, body: {} } : { body: {} }))]);
    const a = await m.run({ x: 1 });
    expect(a.outcome).toBe('pending');
    expect(await m.readBack()).toBe(false);
    expect((await m.run({ x: 1 })).error?.code).toBe('READ_BACK_FIRST');
    expect(sends).toBe(1);
    await m.settle({ x: 1 }, (await m.holdOf({ x: 1 }))!);
    const b = await m.run({ x: 1 });
    expect(b.outcome).toBe('done');
    expect(b.idem).toBe(a.idem);
    expect(sends).toBe(2);
  });
  it('a change without a key and without reads is refused until settled, never resent blindly', async () => {
    const plain = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/plain', scope: 'base', body: ['x'] });
    const m = defineMutation<{ x: number }>(plain, { input: (v) => ({ body: v }) });
    let sends = 0;
    mode([reply(plain, () => (++sends === 1 ? { status: 502, body: {} } : { body: {} }))]);
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    expect((await m.run({ x: 1 })).error?.code).toBe('READ_BACK_FIRST');
    expect(sends).toBe(1);
    await m.settle({ x: 1 }, (await m.holdOf({ x: 1 }))!);
    expect((await m.run({ x: 1 })).outcome).toBe('done');
  });
  it('the hook of a change with no declared reads holds until its settle()', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }) });
    let sends = 0;
    mode([reply(create, () => (++sends === 1 ? { status: 502, body: {} } : { body: {} }))]);
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    let a!: { idem?: string }, b!: { idem?: string; outcome: string; error?: { code?: string | null } };
    await act(async () => { a = await result.current.run({ x: 1 }); });
    await act(async () => { b = await result.current.run({ x: 1 }); });
    expect(b.error?.code).toBe('READ_BACK_FIRST');
    await act(async () => { result.current.settle(); await microFlush(); });
    expect(result.current.outcome).toBe('read');
    await act(async () => { b = await result.current.run({ x: 1 }); });
    expect(b.outcome).toBe('done');
    expect(b.idem).toBe(a.idem);
  });
  it('another account never holds this one\'s run() locks; a realm switch keeps them; the same account gets them back', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }) });
    let sends = 0;
    mode([reply(create, () => (++sends === 1 ? { status: 502, body: {} } : { body: {} }))]);
    const me = snapshot().account;
    const a = await m.run({ x: 1 });
    expect(a.outcome).toBe('pending');
    act(() => { bump('switch'); });
    expect((await m.run({ x: 1 })).error?.code).toBe('READ_BACK_FIRST');
    // Another account is shown: it holds nothing of this one's (its own sends are its own).
    act(() => { setIdentity({ id: 'someone-else', banned: false }); bump('account'); });
    expect(await m.isPending({ x: 1 })).toBe(false);
    // The account that sent it signs in again: its unresolved change is still held (never sent twice).
    act(() => { setIdentity({ id: String(me), banned: false }); bump('account'); });
    expect(await m.isPending({ x: 1 })).toBe(true);
    expect((await m.run({ x: 1 })).error?.code).toBe('READ_BACK_FIRST');
    expect(sends).toBe(1);
  });
  it('a read-back releases only changes that were pending when it began', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions], proves: notApplied });
    let gets = 0;
    const held: (() => void)[] = [];
    mode([
      reply(sessions.route, () => { gets++; return gets === 2 ? new Promise((res) => { held.push(() => res({ body: { data: [] } })); }) : { body: { data: [] } }; }),
      reply(create, { status: 502, body: {} }),
    ]);
    const { result } = renderHook(() => sessions.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    const rb = m.readBack();
    await waitFor(() => expect(held.length).toBe(1));
    expect((await m.run({ x: 2 })).outcome).toBe('pending');
    held.forEach((f) => f());
    // x:1 is freed, but x:2 went pending while it read: the read-back never answers true for it.
    expect(await rb).toBe(false);
    expect((await m.run({ x: 2 })).error?.code).toBe('READ_BACK_FIRST');
    expect((await m.run({ x: 1 })).error?.code).not.toBe('READ_BACK_FIRST');
  });
  it('the hook\'s read-back does not release a change that went pending after it began', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions] });
    let gets = 0, sends = 0;
    const held: (() => void)[] = [];
    mode([
      reply(sessions.route, () => { gets++; return gets === 2 ? new Promise((res) => { held.push(() => res({ body: { data: [] } })); }) : { body: { data: [] } }; }),
      reply(create, () => (++sends === 2 ? { status: 502, body: {} } : { status: 400, body: { error: 'BAD' } })),
    ]);
    const { result } = renderHook(() => ({ q: sessions.use(undefined), m: m.use() }), { wrapper: wrap });
    await waitFor(() => expect(result.current.q.data).toEqual([]));
    // A definite failure leaves nothing pending; the read-back starts, then a change goes pending under it.
    await act(async () => { await result.current.m.run({ x: 1 }); });
    let rb!: Promise<boolean>;
    await act(async () => { rb = result.current.m.readBack(); await waitFor(() => expect(held.length).toBe(1)); });
    await act(async () => { await result.current.m.run({ x: 1 }); });
    await act(async () => { held.forEach((f) => f()); await rb; });
    expect(result.current.m.outcome).toBe('pending');
    let c!: { error?: { code?: string | null } };
    await act(async () => { c = await result.current.m.run({ x: 1 }); });
    expect(c.error?.code).toBe('READ_BACK_FIRST');
  });
});

describe('guards survive a remount + discard', () => {
  const create = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['x'], idem: true });
  const sessions = defineQuery(defineRoute<{ data: string[] }>({ method: 'GET', path: '/sessions', scope: 'agent' }), { select: (r) => r.data });

  it('Root A: a pending change stays refused after its hook unmounts and remounts; the read-back replays the same key', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions], proves: notApplied });
    let sends = 0;
    const keys: string[] = [];
    mode([reply(sessions.route, { body: { data: [] } }), reply(create, () => { sends++; return { status: 502, body: {} }; })]);
    const first = renderHook(() => ({ q: sessions.use(undefined), m: m.use() }), { wrapper: wrap });
    await waitFor(() => expect(first.result.current.q.data).toEqual([]));
    await act(async () => { keys.push(String((await first.result.current.m.run({ x: 1 })).idem)); });
    first.unmount();
    const again = renderHook(() => ({ q: sessions.use(undefined), m: m.use() }), { wrapper: wrap });
    await waitFor(() => expect(again.result.current.q.data).toEqual([]));
    expect(again.result.current.m.outcome).toBe('pending');
    let r!: { outcome: string; error?: { code?: string | null } };
    await act(async () => { r = await again.result.current.m.run({ x: 1 }); });
    expect(r.error?.code).toBe('READ_BACK_FIRST');
    expect(sends).toBe(1);
    await act(async () => { await again.result.current.m.readBack(); });
    await act(async () => { r = await again.result.current.m.run({ x: 1 }); keys.push(String((r as { idem?: string }).idem)); });
    expect(sends).toBe(2);
    expect(keys[1]).toBe(keys[0]);
  });
  it('Root A: the hook and run() share one lock for the same change', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions] });
    mode([reply(sessions.route, { body: { data: [] } }), reply(create, { status: 502, body: {} })]);
    expect((await m.run({ x: 3 })).outcome).toBe('pending');
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    let r!: { error?: { code?: string | null } };
    await act(async () => { r = await result.current.run({ x: 3 }); });
    expect(r.error?.code).toBe('READ_BACK_FIRST');
  });
  it('await discard(vars): proven not applied, the lock and the key go; the next run sends a fresh key', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions] });
    const keys: string[] = [];
    mode([reply(create, { status: 502, body: {} })]);
    const a = await m.run({ x: 1 });
    expect(a.outcome).toBe('pending');
    keys.push(String(a.idem));
    await m.discard({ x: 1 }, (await m.holdOf({ x: 1 }))!);
    const b = await m.run({ x: 1 });
    expect(b.outcome).toBe('pending');
    keys.push(String(b.idem));
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });
  it('await discard(vars) does nothing while that change is being sent', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions] });
    let release!: () => void;
    mode([reply(create, () => new Promise((res) => { release = () => res({ status: 502, body: {} }); }))]);
    const first = m.run({ x: 9 });
    await new Promise((r) => setTimeout(r, 10));
    await m.discard({ x: 9 }, (await m.holdOf({ x: 9 }))!);
    await release();
    expect((await first).outcome).toBe('pending');
    expect((await m.run({ x: 9 })).error?.code).toBe('READ_BACK_FIRST');
  });
  it('the hook\'s await discard() drops its pending change: the next press sends a fresh key', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions] });
    const keys: string[] = [];
    mode([reply(create, { status: 502, body: {} })]);
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    await act(async () => { keys.push(String((await result.current.run({ x: 4 })).idem)); });
    await act(async () => { result.current.discard(); await microFlush(); });
    expect(result.current.outcome).toBe('idle');
    await act(async () => { keys.push(String((await result.current.run({ x: 4 })).idem)); });
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });
});

describe('realm rule (a realm switch keeps unresolved changes) + read-back flights', () => {
  const REALM_B = 'bbbbbbbbbbbbbbbbbbbbbbb2';
  const REALM_A = 'aaaaaaaaaaaaaaaaaaaaaaa1';
  const acctChange = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/users/me/thing', scope: 'base', body: ['x'] });
  const me = defineQuery(defineRoute<{ ok: number }>({ method: 'GET', path: '/users/me', scope: 'base' }));
  const realmChange = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/computers/batch', scope: 'realm', body: ['x'] });
  const switchTo = (r: string) => { setRealm(r); bump('switch'); };

  it('an account-wide change still pending after a realm switch is refused (READ_BACK_FIRST) until read back', async () => {
    const m = defineMutation<{ x: number }>(acctChange, { input: (v) => ({ body: v }), reads: [me], proves: notApplied });
    let sends = 0;
    mode([reply(me.route, { body: { ok: 1 } }), reply(acctChange, () => { sends++; return { status: 502, body: {} }; })]);
    const a = await m.run({ x: 1 });
    expect(a.outcome).toBe('pending');
    switchTo(REALM_B);
    expect((await m.run({ x: 1 })).error?.code).toBe('READ_BACK_FIRST');
    expect(sends).toBe(1);
    const { result } = renderHook(() => me.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(result.current.data).toEqual({ ok: 1 }));
    expect(await m.readBack()).toBe(true);
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    expect(sends).toBe(2);
  });
  it('a realm-scoped change is its realm\'s: another realm sends its own, back in the first realm it is still refused', async () => {
    const m = defineMutation<{ x: number }>(realmChange, { input: (v) => ({ body: v }), reads: [containers] });
    let sends = 0;
    mode([reply(realmChange, () => { sends++; return { status: 502, body: {} }; })]);
    const a = await m.run({ x: 1 });
    expect(a.outcome).toBe('pending');
    switchTo(REALM_B);
    const b = await m.run({ x: 1 });
    expect(b.outcome).toBe('pending');
    switchTo(REALM_A);
    expect((await m.run({ x: 1 })).error?.code).toBe('READ_BACK_FIRST');
    expect(sends).toBe(2);
  });
  it('an account change: another account holds nothing of it; the account that sent it still holds its change', async () => {
    const m = defineMutation<{ x: number }>(acctChange, { input: (v) => ({ body: v }), reads: [me] });
    mode([reply(acctChange, { status: 502, body: {} })]);
    const was = snapshot().account;
    expect((await m.run({ x: 2 })).outcome).toBe('pending');
    setIdentity({ id: 'someone-else', banned: false });
    bump('account');
    expect(await m.isPending({ x: 2 })).toBe(false);
    setIdentity({ id: String(was), banned: false });
    bump('account');
    expect((await m.run({ x: 2 })).error?.code).toBe('READ_BACK_FIRST');
  });
  it('two overlapping read-backs share one request; when it is cancelled both fail and the change stays pending', async () => {
    let reads = 0;
    const held: Array<() => void> = [];
    mode([
      reply(list, () => { reads++; return reads === 1 ? { status: 200, body: { data: ['a'] } } : new Promise((res) => { held.push(() => res({ status: 200, body: { data: ['b'] } })); }); }),
      reply(start, { status: 502, body: {} }),
    ]);
    const { result } = renderHook(() => containers.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(result.current.data).toEqual(['a']));
    expect((await startOne.run({ id: 'c1' })).outcome).toBe('pending');
    const p1 = startOne.readBack();
    await new Promise((r) => setTimeout(r, 5));
    const p2 = startOne.readBack();
    await new Promise((r) => setTimeout(r, 5));
    expect(reads).toBe(2);
    await queryClient.cancelQueries();
    for (const h of held) h();
    expect(await p1).toBe(false);
    expect(await p2).toBe(false);
    expect((await startOne.run({ id: 'c1' })).error?.code).toBe('READ_BACK_FIRST');
  });
  it('readFresh(): a network answer sent after the call began, joined while one is out, null when cancelled', async () => {
    let reads = 0;
    const held: Array<() => void> = [];
    mode([reply(list, () => { reads++; return new Promise((res) => { held.push(() => res({ status: 200, body: { data: ['n' + reads] } })); }); })]);
    const a = containers.readFresh(undefined);
    await new Promise((r) => setTimeout(r, 5));
    const b = containers.readFresh(undefined);
    await new Promise((r) => setTimeout(r, 5));
    expect(reads).toBe(1);
    held.shift()!();
    expect(await a).toEqual({ data: ['n1'] });
    expect(await b).toEqual({ data: ['n1'] });
    const c = containers.readFresh(undefined);
    await new Promise((r) => setTimeout(r, 5));
    await queryClient.cancelQueries();
    for (const h of held) h();
    expect(await c).toBeNull();
  });
});

describe('flake 0758 (press order): the first press is the one sent, whatever order the digests finish in', () => {
  const create = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['x'], idem: true });
  it('a slow first digest does not let the second press jump ahead (the second is BUSY)', async () => {
    const subtle = globalThis.crypto.subtle;
    const real = subtle.digest.bind(subtle);
    let n = 0;
    const spy = vi.spyOn(subtle, 'digest').mockImplementation(((alg: AlgorithmIdentifier, data: BufferSource) => {
      const wait = n++ === 0 ? 30 : 0;
      return new Promise((res) => setTimeout(res, wait)).then(() => real(alg, data));
    }) as typeof subtle.digest);
    try {
      const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }) });
      let sends = 0;
      let release!: () => void;
      mode([reply(create, () => { sends++; return new Promise((res) => { release = () => res({ body: {} }); }); })]);
      const first = m.run({ x: 1 });
      const second = m.run({ x: 1 });
      const order: string[] = [];
      void first.then(() => order.push('first'));
      const s = await second;
      order.push('second');
      expect(s.error?.code).toBe('BUSY');
      await release();
      expect((await first).outcome).toBe('done');
      expect(order).toEqual(['second', 'first']);
      expect(sends).toBe(1);
    } finally { spy.mockRestore(); }
  });
});

describe('a read-back releases only what it read: the target computer', () => {
  const create = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['x'], idem: true });
  const sessions = defineQuery(defineRoute<{ data: string[] }>({ method: 'GET', path: '/sessions', scope: 'agent' }), { select: (r) => r.data });
  const C1 = { project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } };
  const C2 = { project: { id: 'p1' }, container: { id: 'c2', server_name: 's1' } };
  it('a fresh read of computer B does not release computer A\'s unresolved change', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions] });
    let sends = 0;
    mode([reply(sessions.route, { body: { data: [] } }), reply(create, () => { sends++; return { status: 502, body: {} }; })]);
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    act(() => { setTarget(C2); });
    const { result, unmount } = renderHook(() => ({ q: sessions.use(undefined), h: m.use() }), { wrapper: wrap });
    await waitFor(() => expect(result.current.q.data).toEqual([]));
    expect(result.current.h.outcome).not.toBe('pending');
    await act(async () => { await m.readBack(); await result.current.h.readBack(); });
    unmount();
    act(() => { setTarget(C1); });
    expect((await m.run({ x: 1 })).error?.code).toBe('READ_BACK_FIRST');
    expect(sends).toBe(1);
  });
  it('reads that core did not build (an adapter\'s own refresh) prove nothing', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [{ invalidate: async () => {}, refresh: async () => true }] });
    mode([reply(create, { status: 502, body: {} })]);
    expect((await m.run({ x: 2 })).outcome).toBe('pending');
    expect(await m.readBack()).toBe(false);
    expect((await m.run({ x: 2 })).error?.code).toBe('READ_BACK_FIRST');
  });
  it('hook await discard() with no change of its own drops nothing', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions] });
    mode([reply(create, { status: 502, body: {} })]);
    expect((await m.run({ x: 3 })).outcome).toBe('pending');
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    await act(async () => { result.current.discard(); await microFlush(); });
    expect((await m.run({ x: 3 })).error?.code).toBe('READ_BACK_FIRST');
  });
  it('a BUSY second press leaves the first press running', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }) });
    let release!: () => void;
    mode([reply(create, () => new Promise((res) => { release = () => res({ body: {} }); }))]);
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    let first!: Promise<unknown>;
    act(() => { first = result.current.run({ x: 4 }); });
    await waitFor(() => expect(result.current.outcome).toBe('running'));
    let second!: { error?: { code?: string | null } };
    await act(async () => { second = await result.current.run({ x: 4 }); });
    expect(second.error?.code).toBe('BUSY');
    expect(result.current.outcome).toBe('running');
    expect(result.current.running).toBe(true);
    await act(async () => { await release(); await first; });
    expect(result.current.outcome).toBe('done');
  });
  it('mutations are not kept in the MutationCache (variables may hold a secret)', () => {
    expect(queryClient.getDefaultOptions().mutations?.gcTime).toBe(0);
  });
});

describe('a setQueryData during a read-back is not a network answer', () => {
  it('readFresh is null when the cache was written by hand after the fetch landed', async () => {
    let reads = 0;
    mode([reply(list, () => { reads++; return { status: 200, body: { data: ['net'] } }; })]);
    const key = containers.key(undefined);
    const cache = queryClient.getQueryCache();
    const stop = cache.subscribe((e) => {
      if (e.type === 'updated' && e.action.type === 'success' && !e.action.manual) queryClient.setQueryData(key, { data: ['hand'] });
    });
    try { expect(await containers.readFresh(undefined)).toBeNull(); } finally { stop(); }
    expect(reads).toBe(1);
    expect(await containers.readFresh(undefined)).toEqual({ data: ['net'] });
  });
});

describe('kit locks follow the computer and account, never the realm', () => {
  const restart = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/programs/:id/restart', scope: 'kit', kit: 'daemon', index: 1, body: ['x'], idem: true });
  const noRealm = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/tasks', scope: 'agent', realm: 'none', body: ['x'], idem: true });
  const withRealm = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/bots', scope: 'agent', body: ['x'], idem: true });
  const REALM_B = 'bbbbbbbbbbbbbbbbbbbbbbb2';
  it('a pending daemon restart stays held after a realm switch', async () => {
    const m = defineMutation<{ x: number }>(restart, { input: (v) => ({ params: { id: 'web' }, body: v }) });
    let sends = 0;
    mode([reply(restart, () => { sends++; return { status: 502, body: {} }; })]);
    const a = await m.run({ x: 1 });
    expect(a.outcome).toBe('pending');
    setRealm(REALM_B); bump('switch');
    expect((await m.run({ x: 1 })).error?.code).toBe('READ_BACK_FIRST');
    expect(sends).toBe(1);
  });
  it('an agent route that sends no realm is held across a realm switch; one that sends the realm is its realm\'s', async () => {
    const a = defineMutation<{ x: number }>(noRealm, { input: (v) => ({ body: v }) });
    const b = defineMutation<{ x: number }>(withRealm, { input: (v) => ({ body: v }) });
    mode([reply(noRealm, { status: 502, body: {} }), reply(withRealm, { status: 502, body: {} })]);
    expect((await a.run({ x: 1 })).outcome).toBe('pending');
    expect((await b.run({ x: 1 })).outcome).toBe('pending');
    setRealm(REALM_B); bump('switch');
    expect((await a.run({ x: 1 })).error?.code).toBe('READ_BACK_FIRST');
    expect((await b.run({ x: 1 })).outcome).toBe('pending');
  });
});

describe('Check again reads the computer the change went to', () => {
  const create = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['x'], idem: true });
  const sessions = defineQuery(defineRoute<{ data: string[] }>({ method: 'GET', path: '/sessions', scope: 'agent' }), { select: (r) => r.data });
  const C2 = { project: { id: 'p1' }, container: { id: 'c2', server_name: 's1' } };
  it('a pending change on c1, Check again while c2 is shown: c1 is re-read (a cached read of c1 asks c1), and released', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions], proves: notApplied });
    const asked: string[] = [];
    let c1fails = false;
    mode([
      reply(sessions.route, (r) => { asked.push(r.target?.container.id ?? '-'); return r.target?.container.id === 'c1' && c1fails ? { status: 503, body: {} } : { body: { data: [] } }; }),
      reply(create, { status: 502, body: {} }),
    ]);
    const first = renderHook(() => sessions.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(first.result.current.data).toEqual([]));
    first.unmount();
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    act(() => { setTarget(C2); });
    const { result } = renderHook(() => ({ q: sessions.use(undefined), h: m.use() }), { wrapper: wrap });
    await waitFor(() => expect(result.current.q.data).toEqual([]));
    asked.length = 0;
    c1fails = true;
    expect(await m.readBack()).toBe(false);
    expect(asked).toContain('c1');
    c1fails = false;
    await act(async () => { await result.current.h.readBack(); });
    expect(asked.filter((x) => x === 'c1').length).toBeGreaterThan(1);
    act(() => { setTarget({ project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } }); });
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
  });
});

describe('CoreQueryProvider (bots request: page hook tests without TanStack imports)', () => {
  it('renders a core hook against core\'s one QueryClient', async () => {
    mode([reply(list, { body: { data: ['a'] } })]);
    const { result } = renderHook(() => containers.use(undefined), { wrapper: CoreQueryProvider });
    await waitFor(() => expect(result.current.data).toEqual(['a']));
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);
  });
});

describe('stableJson nulls only cycles', () => {
  it('a sub-object repeated in two places is written both times', async () => {
    const { stableJson } = await import('./query');
    const t = { id: 'c1' };
    expect(stableJson({ a: t, b: t })).toBe('{"a":{"id":"c1"},"b":{"id":"c1"}}');
    const cyc: Record<string, unknown> = { x: 1 };
    cyc.self = cyc;
    expect(stableJson(cyc)).toBe('{"self":null,"x":1}');
  });
});

describe('a read-back releases only changes of the realm it read', () => {
  const REALM_A = 'aaaaaaaaaaaaaaaaaaaaaaa1';
  const REALM_B = 'bbbbbbbbbbbbbbbbbbbbbbb2';
  const batch = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/computers/batch', scope: 'realm', body: ['x'] });
  const botAdd = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/bots', scope: 'agent', body: ['x'], idem: true });
  const botList = defineQuery(bots, { select: (r) => r.items });
  const switchTo = (r: string) => { setRealm(r); bump('switch'); };
  it('realm-host route: realm A\'s pending change survives a fresh read-back in realm B (run() and the hook)', async () => {
    const m = defineMutation<{ x: number }>(batch, { input: (v) => ({ body: v }), reads: [containers], proves: notApplied });
    let sends = 0;
    mode([reply(list, { body: { data: [] } }), reply(batch, () => { sends++; return { status: 502, body: {} }; })]);
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    switchTo(REALM_B);
    const { result } = renderHook(() => ({ q: containers.use(undefined), h: m.use() }), { wrapper: wrap });
    await waitFor(() => expect(result.current.q.data).toEqual([]));
    await act(async () => { await m.readBack(); await m.readBack({ x: 1 }); await result.current.h.readBack(); result.current.h.settle(); });
    switchTo(REALM_A);
    expect((await m.run({ x: 1 })).error?.code).toBe('READ_BACK_FIRST');
    expect(sends).toBe(1);
  });
  it('agent route that sends the realm: realm A\'s pending change survives a fresh read-back in realm B', async () => {
    const m = defineMutation<{ x: number }>(botAdd, { input: (v) => ({ body: v }), reads: [botList], proves: notApplied });
    let sends = 0;
    mode([reply(bots, { body: { items: [] } }), reply(botAdd, () => { sends++; return { status: 502, body: {} }; })]);
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    switchTo(REALM_B);
    const { result } = renderHook(() => botList.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(result.current.data).toEqual([]));
    await act(async () => { await m.readBack(); });
    switchTo(REALM_A);
    expect((await m.run({ x: 1 })).error?.code).toBe('READ_BACK_FIRST');
    expect(sends).toBe(1);
  });
  it('back in realm A, a fresh read-back releases it (the key replays)', async () => {
    const m = defineMutation<{ x: number }>(batch, { input: (v) => ({ body: v }), reads: [containers], proves: notApplied });
    let sends = 0;
    mode([reply(list, { body: { data: [] } }), reply(batch, () => { sends++; return { status: 502, body: {} }; })]);
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    switchTo(REALM_B);
    switchTo(REALM_A);
    const { result } = renderHook(() => containers.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(await m.readBack()).toBe(true);
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    expect(sends).toBe(2);
  });
});

describe('the hook\'s pending and running follow the change\'s computer', () => {
  const create = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['x'], idem: true });
  const C2 = { project: { id: 'p1' }, container: { id: 'c2', server_name: 's1' } };
  it('a pending change on c1 still shows pending on the same mount after the top bar moves to c2', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }) });
    mode([reply(create, { status: 502, body: {} })]);
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    await act(async () => { await result.current.run({ x: 1 }); });
    expect(result.current.outcome).toBe('pending');
    act(() => { setTarget(C2); });
    expect(result.current.outcome).toBe('pending');
  });
});

describe('a settled change keeps no variables in the mutation cache while mounted', () => {
  it('after run() settles, the answer stays on the hook and the mutation cache is empty', async () => {
    const secret = defineRoute<unknown, { password: string }>({ method: 'POST', path: '/users/me/password', scope: 'base', body: ['password'] });
    const m = defineMutation<{ password: string }>(secret, { input: (v) => ({ body: v }) });
    mode([reply(secret, { body: { ok: true } })]);
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    await act(async () => { await result.current.run({ password: 'hunter2' }); });
    expect(result.current.outcome).toBe('done');
    expect(result.current.data).toEqual({ ok: true });
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(JSON.stringify(queryClient.getMutationCache().getAll().map((x) => x.state.variables))).not.toContain('hunter2');
  });
});

describe('a change that names its own realm (All realms shown) is shown and settled as that change', () => {
  const REALM_X = 'cccccccccccccccccccccc03';
  const add = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/script-instances', scope: 'agent', body: ['x'], idem: true });
  it('pending shows on the hook; the hook\'s settle() (no variables) frees it', async () => {
    const m = defineMutation<{ x: number; realm: string }>(add, { input: (v) => ({ body: { x: v.x }, realm: v.realm }) });
    let sends = 0;
    mode([reply(add, () => { sends++; return { status: 502, body: {} }; })]);
    setRealm('all'); bump('switch');
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    await act(async () => { await result.current.run({ x: 1, realm: REALM_X }); });
    expect(sends).toBe(1);
    expect(result.current.outcome).toBe('pending');
    await act(async () => { result.current.settle(); await microFlush(); });
    await act(async () => { await result.current.run({ x: 1, realm: REALM_X }); });
    expect(sends).toBe(2);
  });
});

describe('the public C9 probe (pages never write lock scopes by hand)', () => {
  const batch = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/computers/batch', scope: 'realm', body: ['x'] });
  it('isPending(vars) follows the change\'s own scope (realm, shared lock); isPending() any of the shown realm; useChangesVersion moves', async () => {
    const m = defineMutation<{ x: number }>(batch, { input: (v) => ({ body: v }) });
    const shared = defineMutation<{ x: number; label: string }>(batch, { input: (v) => ({ body: { x: v.x } }), lock: 'test.std.probe', lockKey: (v) => ({ x: v.x }) });
    mode([reply(batch, { status: 502, body: {} })]);
    const { result } = renderHook(() => useChangesVersion(), { wrapper: wrap });
    const v0 = result.current;
    expect(await m.isPending()).toBe(false);
    await act(async () => { await m.run({ x: 1 }); await shared.run({ x: 7, label: 'a' }); });
    expect(result.current).toBeGreaterThan(v0);
    expect(await m.isPending({ x: 1 })).toBe(true);
    expect(await m.isPending({ x: 2 })).toBe(false);
    expect(await m.isPending()).toBe(true);
    expect(await shared.isPending({ x: 7, label: 'other' })).toBe(true);
    setRealm('bbbbbbbbbbbbbbbbbbbbbbb2'); bump('switch');
    expect(await m.isPending()).toBe(false);
    expect(await m.isPending({ x: 1 })).toBe(false);
    expect(keepsChanges('switch')).toBe(true);
  });
});

describe('a change acts in the realm it was sent in (read-back and settle)', () => {
  const REALM_X = 'cccccccccccccccccccccc03';
  const REALM_B = 'bbbbbbbbbbbbbbbbbbbbbbb2';
  it('an agent change that names its own realm is never released by a read-back in another realm', async () => {
    const mk = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/r5-items', scope: 'agent', body: ['x'], idem: true });
    const items = defineQuery(defineRoute<{ data: string[] }>({ method: 'GET', path: '/r5-items', scope: 'agent' }), { select: (r) => r.data });
    const m = defineMutation<{ x: number; realm: string }>(mk, { input: (v) => ({ body: { x: v.x }, realm: v.realm }), reads: [items] });
    let sends = 0;
    mode([reply(items.route, { body: { data: [] } }), reply(mk, () => { sends++; return { status: 502, body: {} }; })]);
    expect((await m.run({ x: 1, realm: REALM_X })).outcome).toBe('pending');
    setRealm(REALM_B); bump('switch');
    const { result } = renderHook(() => items.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(await m.readBack()).toBe(false);
    expect(await m.isPending({ x: 1, realm: REALM_X })).toBe(true);
    expect((await m.run({ x: 1, realm: REALM_X })).error?.code).toBe('READ_BACK_FIRST');
    expect(sends).toBe(1);
  });
  it('settle(vars) shown in All realms settles the change sent in its realm; shown in another realm it settles nothing', async () => {
    const ren = defineRoute<unknown, { name: string }>({ method: 'PATCH', path: '/computers/:id', scope: 'realm', body: ['name'] });
    const m = defineMutation<{ name: string }>(ren, { input: (v) => ({ params: { id: 'c1' }, body: v }) });
    let sends = 0;
    mode([reply(ren, () => { sends++; return sends === 1 || sends === 2 ? { status: 502, body: {} } : { body: {} }; })]);
    const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
    const sent = await m.run({ name: 'a' });
    expect(sent.outcome).toBe('pending');
    setRealm(REALM_B); bump('switch');
    // case-c: hold is required; another realm's view finds no hold of these variables (holdOf), so nothing.
    expect(await m.holdOf({ name: 'a' })).toBe(undefined);
    expect(await m.settle({ name: 'a' }, (await m.holdOf({ name: 'a' }))!)).toBe(false);
    setRealm(R1); bump('switch');
    expect((await m.run({ name: 'a' })).error?.code).toBe('READ_BACK_FIRST');
    setRealm('all'); bump('switch');
    // In All realms the page passes the hold it showed (the run's, or HeldChange.hold).
    expect(await m.settle({ name: 'a' }, sent.hold!)).toBe(true);
    setRealm(R1); bump('switch');
    expect((await m.run({ name: 'a' })).outcome).toBe('pending');
    expect(sends).toBe(2);
  });
});

describe('a change proven applied drops its key; the next press gets a new one', () => {
  const restart = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/programs/:id/restart', scope: 'kit', kit: 'daemon', index: 1, body: ['x'], idem: true });
  it('restart, completed (await complete()), restart again: a new key; settle() alone keeps it (read showed not applied)', async () => {
    const m = defineMutation<{ x: number }>(restart, { input: (v) => ({ params: { id: 'web' }, body: v }) });
    let status = 502;
    mode([reply(restart, () => ({ status, body: {} }))]);
    const a = await m.run({ x: 1 });
    expect(a.outcome).toBe('pending');
    await m.settle({ x: 1 }, (await m.holdOf({ x: 1 }))!);
    const b = await m.run({ x: 1 });
    expect(b.outcome).toBe('pending');
    expect(b.idem).toBe(a.idem);
    await m.complete({ x: 1 }, (await m.holdOf({ x: 1 }))!);
    status = 200;
    const c = await m.run({ x: 1 });
    expect(c.outcome).toBe('done');
    expect(c.idem).toBeTruthy();
    expect(c.idem).not.toBe(a.idem);
  });
  it('the hook: await complete() frees this mount\'s last change and its key', async () => {
    const m = defineMutation<{ x: number }>(restart, { input: (v) => ({ params: { id: 'web' }, body: v }) });
    let status = 502;
    mode([reply(restart, () => ({ status, body: {} }))]);
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    let a!: Awaited<ReturnType<typeof m.run>>;
    await act(async () => { a = await result.current.run({ x: 2 }); });
    expect(result.current.outcome).toBe('pending');
    await act(async () => { result.current.complete(); await microFlush(); });
    status = 200;
    let c!: Awaited<ReturnType<typeof m.run>>;
    await act(async () => { c = await result.current.run({ x: 2 }); });
    expect(c.outcome).toBe('done');
    expect(c.idem).not.toBe(a.idem);
  });
});

describe('a read-back frees a change only when the read proves it (proves)', () => {
  const startR = defineRoute<unknown, Record<string, never>>({ method: 'POST', path: '/r6-programs/:id/start', scope: 'agent', body: [], idem: true });
  const progs = defineQuery(defineRoute<{ data: Array<{ id: string; state: string }> }>({ method: 'GET', path: '/r6-programs', scope: 'agent' }), { select: (r) => r.data });
  it('any 200 read without the effect keeps it pending; a read showing it frees it and drops the key', async () => {
    let state = 'stopped', status = 502;
    const m = defineMutation<{ id: string }>(startR, {
      input: (v) => ({ params: { id: v.id }, body: {} }), reads: [progs], lockKey: (v) => ({ id: v.id }),
      proves: (id, answers) => (answers[0]!.some((rows) => (rows as Array<{ id: string; state: string }>).some((p) => p.id === (id as { id: string }).id && p.state === 'running')) ? 'applied' : undefined),
    });
    mode([reply(progs.route, () => ({ body: { data: [{ id: 'web', state }] } })), reply(startR, () => ({ status, body: {} }))]);
    const { result } = renderHook(() => progs.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    const a = await m.run({ id: 'web' });
    expect(a.outcome).toBe('pending');
    expect(await m.readBack()).toBe(false);
    expect(await m.isPending({ id: 'web' })).toBe(true);
    state = 'running';
    expect(await m.readBack()).toBe(true);
    expect(await m.isPending({ id: 'web' })).toBe(false);
    status = 200;
    const c = await m.run({ id: 'web' });
    expect(c.outcome).toBe('done');
    expect(c.idem).not.toBe(a.idem);
  });
});

describe('proves() sees only the answers this read-back fetched', () => {
  const startR = defineRoute<unknown, Record<string, never>>({ method: 'POST', path: '/r5c-programs/:id/start', scope: 'agent', body: [], idem: true });
  const progs = defineQuery(defineRoute<{ data: Array<{ id: string; state: string }> }>({ method: 'GET', path: '/r5c-programs', scope: 'agent', query: ['page'] }), {
    input: (page: number) => ({ query: { page } }), select: (r) => r.data,
  });
  it('a disabled instance still caching the old answer cannot prove the change', async () => {
    let state = 'running';
    const m = defineMutation<{ id: string }>(startR, {
      input: (v) => ({ params: { id: v.id }, body: {} }), reads: [progs], lockKey: (v) => ({ id: v.id }),
      proves: (id, answers) => (answers[0]!.some((rows) => (rows as Array<{ id: string; state: string }>).some((p) => p.id === (id as { id: string }).id && p.state === 'running')) ? 'applied' : undefined),
    });
    mode([reply(progs.route, () => ({ body: { data: [{ id: 'web', state }] } })), reply(startR, () => ({ status: 502, body: {} }))]);
    const one = renderHook(() => progs.use(1), { wrapper: wrap });
    const two = renderHook(({ on }: { on: boolean }) => progs.use(2, { enabled: on }), { wrapper: wrap, initialProps: { on: true } });
    await waitFor(() => expect(two.result.current.data).toBeTruthy());
    await waitFor(() => expect(one.result.current.data).toBeTruthy());
    two.rerender({ on: false });
    state = 'stopped';
    expect((await m.run({ id: 'web' })).outcome).toBe('pending');
    expect(await m.readBack()).toBe(false);
    expect(await m.isPending({ id: 'web' })).toBe(true);
    state = 'running';
    expect(await m.readBack()).toBe(true);
    expect(await m.isPending({ id: 'web' })).toBe(false);
  });
});

describe('await complete() after settle() still drops the kept key', () => {
  const restart = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/r5c6/:id/restart', scope: 'kit', kit: 'daemon', index: 1, body: ['x'], idem: true });
  it('run → pending, settle (released, key kept), complete: the next run sends a new key', async () => {
    const m = defineMutation<{ x: number }>(restart, { input: (v) => ({ params: { id: 'web' }, body: v }) });
    let status = 502;
    mode([reply(restart, () => ({ status, body: {} }))]);
    const a = await m.run({ x: 1 });
    expect(a.outcome).toBe('pending');
    await m.settle({ x: 1 }, (await m.holdOf({ x: 1 }))!);
    expect(await m.isPending({ x: 1 })).toBe(false);
    await m.complete({ x: 1 }, (await m.holdOf({ x: 1 }))!);
    status = 200;
    const c = await m.run({ x: 1 });
    expect(c.outcome).toBe('done');
    expect(c.idem).toBeTruthy();
    expect(c.idem).not.toBe(a.idem);
  });
  it('the hook: settle() then await complete() drops the key too', async () => {
    const m = defineMutation<{ x: number }>(restart, { input: (v) => ({ params: { id: 'web' }, body: v }) });
    let status = 502;
    mode([reply(restart, () => ({ status, body: {} }))]);
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    let a!: Awaited<ReturnType<typeof m.run>>;
    await act(async () => { a = await result.current.run({ x: 2 }); });
    await act(async () => { result.current.settle(); await microFlush(); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { result.current.complete(); await microFlush(); });
    status = 200;
    let c!: Awaited<ReturnType<typeof m.run>>;
    await act(async () => { c = await result.current.run({ x: 2 }); });
    expect(c.outcome).toBe('done');
    expect(c.idem).not.toBe(a.idem);
  });
});

describe('a refused replay of a kept key leaves the first send unknown', () => {
  const restart = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/r5c3/:id/restart', scope: 'kit', kit: 'daemon', index: 1, body: ['x'], idem: true });
  it('replay answered 429: pending again (never "failed"), the lock is back, the next press is held unsent', async () => {
    const m = defineMutation<{ x: number }>(restart, { input: (v) => ({ params: { id: 'web' }, body: v }) });
    let status = 502;
    let posts = 0;
    mode([reply(restart, () => { posts++; return { status, body: { error: status === 429 ? 'RATE_LIMITED' : 'BAD_GATEWAY' } }; })]);
    const a = await m.run({ x: 1 });
    expect(a.outcome).toBe('pending');
    await m.settle({ x: 1 }, (await m.holdOf({ x: 1 }))!);
    status = 429;
    const b = await m.run({ x: 1 });
    expect(b.idem).toBe(a.idem);
    expect(b.outcome).toBe('pending');
    expect(b.error?.code).toBe('RATE_LIMITED');
    expect(await m.isPending({ x: 1 })).toBe(true);
    const c = await m.run({ x: 1 });
    expect(c.error?.code).toBe('READ_BACK_FIRST');
    expect(posts).toBe(2);
  });
  it('a first send refused (not a replay) is still a definite failure', async () => {
    const m = defineMutation<{ x: number }>(restart, { input: (v) => ({ params: { id: 'web' }, body: v }) });
    mode([reply(restart, () => ({ status: 429, body: { error: 'RATE_LIMITED' } }))]);
    const a = await m.run({ x: 3 });
    expect(a.outcome).toBe('failed');
    expect(await m.isPending({ x: 3 })).toBe(false);
  });
});

describe('a lock digest never falls back to the plain variables', () => {
  it('without Web Crypto the digest is a hash: stable, distinct, and holds none of the bytes', async () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', {});
    try {
      const a = await varsDigest({ code: 'INVITE-SECRET-42' });
      const a2 = await varsDigest({ code: 'INVITE-SECRET-42' });
      const b = await varsDigest({ code: 'INVITE-SECRET-43' });
      expect(a).toBe(a2);
      expect(a).not.toBe(b);
      expect(a).not.toContain('SECRET');
      expect(a).toMatch(/^x[0-9a-f]{32}$/);
    } finally { vi.unstubAllGlobals(); expect(globalThis.crypto).toBe(real); }
  });
});

describe('changes with no proves under a shared lock', () => {
  const ren = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/np-shared/:id/set', scope: 'realm', body: ['x'] });
  const mk = (proves?: () => 'applied' | 'not_applied' | undefined) => defineMutation<{ x: number }>(ren, {
    input: (v) => ({ params: { id: 'a' }, body: v }), lock: 'test.np.shared', lockKey: () => ({}), reads: [containers], ...(proves ? { proves } : {}),
  });
  it('a hook\'s dismiss() never frees another sender\'s change that now holds its last lock', async () => {
    let status = 200;
    mode([reply(ren, () => ({ status, body: {} })), reply(list, () => ({ body: { data: [] } }))]);
    const a = mk(), b = mk();
    const { result } = renderHook(() => a.use(), { wrapper: wrap });
    await act(async () => { expect((await result.current.run({ x: 1 })).outcome).toBe('done'); });
    status = 502;
    expect((await b.run({ x: 1 })).outcome).toBe('pending');
    await act(async () => { result.current.dismiss(); await microFlush(); });
    expect((await b.run({ x: 1 })).error?.code).toBe('READ_BACK_FIRST');
    expect(await b.isPending({ x: 1 })).toBe(true);
  });
  it('a hook\'s dismiss() with no variables frees every pending change of its own sender, not only the last', async () => {
    const own = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/np-own/:id/set', scope: 'realm', body: ['x'] });
    const m = defineMutation<{ x: number }>(own, { input: (v) => ({ params: { id: 'a' }, body: v }), reads: [containers] });
    mode([reply(own, () => ({ status: 502, body: {} }))]);
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    await act(async () => { expect((await result.current.run({ x: 1 })).outcome).toBe('pending'); });
    await act(async () => { expect((await result.current.run({ x: 2 })).outcome).toBe('pending'); });
    await act(async () => { result.current.dismiss(); await microFlush(); });
    expect(await m.isPending({ x: 1 })).toBe(false);
    expect(await m.isPending({ x: 2 })).toBe(false);
  });
  it('another definition\'s read-back (its proves says applied) never frees a change it did not send', async () => {
    mode([reply(ren, () => ({ status: 502, body: {} })), reply(list, () => ({ body: { data: ['c1'] } }))]);
    const a = mk(), b = mk(() => 'applied');
    const { result } = renderHook(() => containers.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect((await a.run({ x: 1 })).outcome).toBe('pending');
    // b judges nothing of a's, but a's change still holds the lock in this realm: never true.
    expect(await b.readBack()).toBe(false);
    expect(await b.readBack({ x: 1 })).toBe(false);
    expect(await a.isPending({ x: 1 })).toBe(true);
  });
  it('freeByVerdict is true only when nothing of the change is pending afterwards (a newer send stays)', async () => {
    const { freeByVerdict } = await import('./query');
    const { guarded, holdOfLock, pendingMark } = await import('./changes');
    mode([]);
    await guarded('np5', 'd', async () => ({ outcome: 'pending' as const, idem: 'K1' }));
    const upTo = pendingMark() - 1; // a read-back that began before this change went pending
    expect(await freeByVerdict('np5', 'd', holdOfLock('np5', 'd'), upTo, 'applied')).toBe(false);
    expect(await freeByVerdict('np5', 'd', holdOfLock('np5', 'd'), upTo, 'not_applied')).toBe(false);
    expect(await freeByVerdict('np5', 'd', holdOfLock('np5', 'd'), pendingMark(), 'not_applied')).toBe(true);
  });
});

describe('senders, the current lock and what a read-back may answer', () => {
  const create = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/core2-sessions', scope: 'agent', body: ['x'], idem: true });
  const sessions = defineQuery(defineRoute<{ data: string[] }>({ method: 'GET', path: '/core2-sessions', scope: 'agent' }), { select: (r) => r.data });
  const applied = () => 'applied' as const;
  it('a hook whose last change is done cannot dismiss the same change another sender has pending now', async () => {
    const mine = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions], lock: 'core2.shared.last', lockKey: () => ({}) });
    const other = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions], lock: 'core2.shared.last', lockKey: () => ({}) });
    let status = 200;
    mode([reply(sessions.route, { body: { data: [] } }), reply(create, () => ({ status, body: {} }))]);
    const { result } = renderHook(() => mine.use(), { wrapper: wrap });
    await act(async () => { expect((await result.current.run({ x: 1 })).outcome).toBe('done'); });
    status = 502;
    expect((await other.run({ x: 1 })).outcome).toBe('pending');
    await act(async () => { result.current.dismiss(); await microFlush(); });
    expect(await other.isPending({ x: 1 })).toBe(true);
  });
  it('readBack() and readBack(vars) never prove another sender\'s change under a shared lock', async () => {
    const mine = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions], lock: 'core2.shared.rb', lockKey: () => ({}), proves: applied });
    const other = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions], lock: 'core2.shared.rb', lockKey: () => ({}) });
    mode([reply(sessions.route, { body: { data: [] } }), reply(create, { status: 502, body: {} })]);
    const { result } = renderHook(() => sessions.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect((await other.run({ x: 1 })).outcome).toBe('pending');
    expect(await mine.readBack()).toBe(false);
    expect(await other.isPending({ x: 1 })).toBe(true);
    expect(await mine.readBack({ x: 1 })).toBe(false);
    expect(await other.isPending({ x: 1 })).toBe(true);
  });
  it('a read-back that began before a newer send went pending never answers true for it', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions], proves: () => 'not_applied' as const });
    let hold: (() => void) | null = null, gets = 0;
    mode([
      reply(sessions.route, () => (++gets === 2 ? new Promise((res) => { hold = () => res({ body: { data: [] } }); }) : { body: { data: [] } })),
      reply(create, { status: 502, body: {} }),
    ]);
    const { result } = renderHook(() => sessions.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    const rb = m.readBack({ x: 1 });
    await waitFor(() => expect(hold).not.toBeNull());
    await m.dismiss({ x: 1 }, (await m.holdOf({ x: 1 }))!);
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    hold!();
    expect(await rb).toBe(false);
    expect(await m.isPending({ x: 1 })).toBe(true);
  });
  it('the hook\'s dismiss() frees every pending change this mount sent, not only the last', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions] });
    mode([reply(sessions.route, { body: { data: [] } }), reply(create, { status: 502, body: {} })]);
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    await act(async () => { await result.current.run({ x: 1 }); });
    await act(async () => { await result.current.run({ x: 2 }); });
    expect(await m.isPending({ x: 1 })).toBe(true);
    await act(async () => { result.current.dismiss(); await microFlush(); });
    expect(await m.isPending({ x: 2 })).toBe(false);
    expect(await m.isPending({ x: 1 })).toBe(false);
  });
  it('after a remount, dismiss() never frees this definition\'s change on another computer', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [sessions] });
    mode([reply(sessions.route, { body: { data: [] } }), reply(create, { status: 502, body: {} })]);
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    act(() => { setTarget({ project: { id: 'p1' }, container: { id: 'c2', server_name: 's1' } }); });
    await act(async () => { result.current.dismiss(); await microFlush(); });
    act(() => { setTarget({ project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } }); });
    expect(await m.isPending({ x: 1 })).toBe(true);
  });
  it('proves sees the answer the recovery request fetched, never a cache write made after it landed', async () => {
    const pages = defineQuery(defineRoute<{ data: string[] }>({ method: 'GET', path: '/core2-pages', scope: 'agent', query: ['page'] }), { input: (page: number) => ({ query: { page } }), select: (r) => r.data });
    const seen: unknown[][] = [];
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [pages], proves: (_id, a) => { seen.push([...a[0]!]); return (a[0]!).some((d) => (d as string[]).includes('done')) ? 'applied' : undefined; } });
    let hold: (() => void) | null = null, armed = false;
    mode([
      reply(pages.route, (req) => (armed && req.query.page === '2' ? new Promise((res) => { hold = () => res({ body: { data: [] } }); }) : { body: { data: [] } })),
      reply(create, { status: 502, body: {} }),
    ]);
    const one = renderHook(() => pages.use(1), { wrapper: wrap });
    const two = renderHook(() => pages.use(2), { wrapper: wrap });
    await waitFor(() => expect(one.result.current.data).toEqual([]));
    await waitFor(() => expect(two.result.current.data).toEqual([]));
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    armed = true;
    const rb = m.readBack({ x: 1 });
    await waitFor(() => expect(hold).not.toBeNull());
    queryClient.setQueryData(pages.key(1), { data: ['done'] });
    hold!();
    expect(await rb).toBe(false);
    expect(await m.isPending({ x: 1 })).toBe(true);
  });
});

describe('await complete() and await discard() act only on this sender\'s changes; answers are judged in the realm they were read', () => {
  const create = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/core2-sol', scope: 'agent', body: ['x'], idem: true });
  const list = defineQuery(defineRoute<{ data: string[] }>({ method: 'GET', path: '/core2-sol', scope: 'agent' }), { select: (r) => r.data });
  it('await complete() on a mount that sent nothing never frees another sender\'s pending change under a shared lock', async () => {
    const mine = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), lock: 'core2.sol.c', lockKey: () => ({}) });
    const other = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), lock: 'core2.sol.c', lockKey: () => ({}) });
    mode([reply(create, { status: 502, body: {} })]);
    const { result } = renderHook(() => mine.use(), { wrapper: wrap });
    expect((await other.run({ x: 1 })).outcome).toBe('pending');
    await act(async () => { result.current.complete(); await microFlush(); });
    expect(await other.isPending({ x: 1 })).toBe(true);
  });
  it('await complete() after this mount\'s change is done never frees the same change another sender has pending now', async () => {
    const mine = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), lock: 'core2.sol.d', lockKey: () => ({}) });
    const other = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), lock: 'core2.sol.d', lockKey: () => ({}) });
    let status = 200;
    mode([reply(create, () => ({ status, body: {} }))]);
    const { result } = renderHook(() => mine.use(), { wrapper: wrap });
    await act(async () => { expect((await result.current.run({ x: 1 })).outcome).toBe('done'); });
    status = 502;
    expect((await other.run({ x: 1 })).outcome).toBe('pending');
    await act(async () => { result.current.complete(); await microFlush(); });
    expect(await other.isPending({ x: 1 })).toBe(true);
  });
  it('await discard() after this mount\'s change is done never frees the same change another sender has pending now', async () => {
    const mine = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), lock: 'core2.sol.d2', lockKey: () => ({}) });
    const other = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), lock: 'core2.sol.d2', lockKey: () => ({}) });
    let status = 200;
    mode([reply(create, () => ({ status, body: {} }))]);
    const { result } = renderHook(() => mine.use(), { wrapper: wrap });
    await act(async () => { expect((await result.current.run({ x: 1 })).outcome).toBe('done'); });
    status = 502;
    expect((await other.run({ x: 1 })).outcome).toBe('pending');
    await act(async () => { result.current.discard(); await microFlush(); });
    expect(await other.isPending({ x: 1 })).toBe(true);
  });
  it('await complete() frees every pending change this sender sent, not only the last', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }) });
    mode([reply(create, { status: 502, body: {} })]);
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    await act(async () => { await result.current.run({ x: 1 }); });
    await act(async () => { await result.current.run({ x: 2 }); });
    await act(async () => { result.current.complete(); await microFlush(); });
    expect(await m.isPending({ x: 2 })).toBe(false);
    expect(await m.isPending({ x: 1 })).toBe(false);
  });
  it('a read that asks another realm explicitly never proves a change of the shown realm', async () => {
    const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1', R2 = 'bbbbbbbbbbbbbbbbbbbbbbb2';
    setRealm(R1); bump('switch');
    const inR2 = defineQuery(defineRoute<{ data: string[] }>({ method: 'GET', path: '/core2-sol-r2', scope: 'agent' }), { input: () => ({ realm: R2 }), select: (r) => r.data });
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [inR2], proves: (_id, a) => ((a[0] || []).length ? 'applied' : undefined) });
    mode([reply(inR2.route, { body: { data: ['done'] } }), reply(list.route, { body: { data: [] } }), reply(create, { status: 502, body: {} })]);
    const q = renderHook(() => inR2.use(), { wrapper: wrap });
    await waitFor(() => expect(q.result.current.data).toEqual(['done']));
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    expect(await m.readBack({ x: 1 })).toBe(false);
    expect(await m.isPending({ x: 1 })).toBe(true);
  });
  it('with All realms shown, a read that asks another realm never proves a change sent to one realm', async () => {
    const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1', R2 = 'bbbbbbbbbbbbbbbbbbbbbbb2';
    const inR2 = defineQuery(defineRoute<{ data: string[] }>({ method: 'GET', path: '/core2-sol-all', scope: 'agent' }), { input: () => ({ realm: R2 }), select: (r) => r.data });
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v, realm: R1 }), reads: [inR2], proves: (_id, a) => ((a[0] || []).length ? 'applied' : undefined) });
    mode([reply(inR2.route, { body: { data: ['done'] } }), reply(create, { status: 502, body: {} })]);
    // All is shown AFTER mode(), which resets the realm to R1.
    setRealm('all'); bump('switch');
    expect(snapshot().realm).toBe('all');
    const q = renderHook(() => inR2.use(), { wrapper: wrap });
    await waitFor(() => expect(q.result.current.data).toEqual(['done']));
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    expect(await m.readBack({ x: 1 })).toBe(false);
    expect(await m.isPending({ x: 1 })).toBe(true);
  });
  it('control: a read of the change\'s own realm still proves it', async () => {
    const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
    setRealm(R1); bump('switch');
    const inR1 = defineQuery(defineRoute<{ data: string[] }>({ method: 'GET', path: '/core2-sol-r1', scope: 'agent' }), { input: () => ({ realm: R1 }), select: (r) => r.data });
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [inR1], proves: (_id, a) => ((a[0] || []).length ? 'applied' : undefined) });
    mode([reply(inR1.route, { body: { data: ['done'] } }), reply(create, { status: 502, body: {} })]);
    const q = renderHook(() => inR1.use(), { wrapper: wrap });
    await waitFor(() => expect(q.result.current.data).toEqual(['done']));
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    expect(await m.readBack({ x: 1 })).toBe(true);
    expect(await m.isPending({ x: 1 })).toBe(false);
  });
});

describe('heldBy per definition: a page tells its own held change from another page\'s under a shared lock', () => {
  const create = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/core2-heldby', scope: 'agent', body: ['x'], idem: true });
  it('heldBy(h) is self for the definition that sent it and other for one sharing the lock', async () => {
    const keys = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), lock: 'core2.heldby', lockKey: (v) => ({ x: v.x }) });
    const computers = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), lock: 'core2.heldby', lockKey: (v) => ({ x: v.x }) });
    mode([reply(create, { status: 502, body: {} })]);
    expect((await computers.run({ x: 1 })).outcome).toBe('pending');
    const [h] = heldChanges('core2.heldby');
    expect(h).toBeDefined();
    expect(computers.heldBy(h!)).toBe('self');
    expect(keys.heldBy(h!)).toBe('other');
    expect(keys.heldBy({ ...h!, by: undefined })).toBeUndefined();
  });
});

describe('another sender\'s hold is named, never judged; no-argument frees reach only this mount\'s sends; off-page reads', () => {
  const create = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/core2-fix2', scope: 'agent', body: ['x'], idem: true });
  const list = defineQuery(defineRoute<{ data: string[] }>({ method: 'GET', path: '/core2-fix2', scope: 'agent' }), { select: (r) => r.data });
  it('shared locks (b): a press under another sender\'s hold answers HELD_BY_OTHER with the sending page; heldChanges shows it as from that page', async () => {
    const computers = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), lock: 'core2.fix2.held', lockKey: () => ({}), page: 'computers' });
    const keys = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), lock: 'core2.fix2.held', lockKey: () => ({}), page: 'keys' });
    mode([reply(create, { status: 502, body: {} })]);
    expect((await computers.run({ x: 1 })).outcome).toBe('pending');
    const r = await keys.run({ x: 1 });
    expect(r.error?.code).toBe('HELD_BY_OTHER');
    expect(r.heldFrom).toEqual({ page: 'computers', path: '/computers' });
    expect((await computers.run({ x: 1 })).error?.code).toBe('READ_BACK_FIRST');
    const [h] = heldChanges('core2.fix2.held');
    expect(h!.from).toEqual({ page: 'computers', path: '/computers' });
    expect(keys.heldBy(h!)).toBe('other');
  });
  it('an explicit-variable read-back never asks proves about another sender\'s change', async () => {
    let asked = 0;
    const mine = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [list], lock: 'core2.fix2.rb', lockKey: () => ({}), proves: () => { asked++; return 'applied'; } });
    const other = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), lock: 'core2.fix2.rb', lockKey: () => ({}) });
    mode([reply(list.route, { body: { data: [] } }), reply(create, { status: 502, body: {} })]);
    const q = renderHook(() => list.use(), { wrapper: wrap });
    await waitFor(() => expect(q.result.current.data).toEqual([]));
    expect((await other.run({ x: 1 })).outcome).toBe('pending');
    expect(await mine.readBack({ x: 1 })).toBe(false);
    expect(asked).toBe(0);
    expect(await other.isPending({ x: 1 })).toBe(true);
  });
  // No-argument dismiss() frees only what THIS mount sent and
  // showed; an earlier mount's hold was not shown here, so it is freed by dismiss(vars, hold) naming it.
  it('no-argument dismiss() frees this mount\'s own change; an earlier mount\'s stays until dismissed by its hold', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }) });
    mode([reply(create, { status: 502, body: {} })]);
    const first = renderHook(() => m.use(), { wrapper: wrap });
    await act(async () => { await first.result.current.run({ x: 1 }); });
    first.unmount();
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    await act(async () => { await result.current.run({ x: 2 }); });
    await act(async () => { result.current.dismiss(); await microFlush(); });
    expect(await m.isPending({ x: 2 })).toBe(false);
    expect(await m.isPending({ x: 1 })).toBe(true);
    expect(await m.dismiss({ x: 1 }, (await m.holdOf({ x: 1 }))!)).toBe(true);
    expect(await m.isPending({ x: 1 })).toBe(false);
  });
  it('await complete() frees only what this mount sent: a mount that sent nothing on it frees nothing, an earlier mount\'s change stays', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }) });
    mode([reply(create, { status: 502, body: {} })]);
    const first = renderHook(() => m.use(), { wrapper: wrap });
    await act(async () => { await first.result.current.run({ x: 1 }); });
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    await act(async () => { result.current.complete(); await microFlush(); });
    expect(await m.isPending({ x: 1 })).toBe(true);
    await act(async () => { first.result.current.complete(); await microFlush(); });
    expect(await m.isPending({ x: 1 })).toBe(false);
  });
  it('off-page: a declared read no page holds is read once for the read-back, so its proof can free the change', async () => {
    const offRead = defineQuery(defineRoute<{ data: string[] }>({ method: 'GET', path: '/core2-fix2-off', scope: 'agent' }), { select: (r) => r.data });
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), reads: [offRead], proves: (_id, a) => ((a[0] || []).some((d) => (d as string[]).includes('done')) ? 'applied' : undefined) });
    let gets = 0;
    mode([reply(offRead.route, () => { gets++; return { body: { data: ['done'] } }; }), reply(create, { status: 502, body: {} })]);
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    expect(await m.readBack({ x: 1 })).toBe(true);
    expect(gets).toBeGreaterThan(0);
    expect(await m.isPending({ x: 1 })).toBe(false);
  });
});

describe('explicit-variable frees and per-page senders', () => {
  const create = defineRoute<unknown, { x: number }>({ method: 'POST', path: '/core2-fix2b', scope: 'agent', body: ['x'], idem: true });
  it('complete/discard/settle(vars) of another sender\'s hold free nothing, its key stays; heldByOther names its page', async () => {
    const a = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), lock: 'core2.fix2.vars', lockKey: (v) => v, page: 'programs' });
    const b = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), lock: 'core2.fix2.vars', lockKey: (v) => v, page: 'computers' });
    mode([reply(create, { status: 502, body: {} })]);
    const first = await a.run({ x: 1 });
    expect(first.outcome).toBe('pending');
    const held = { outcome: 'not_sent', code: 'HELD_BY_OTHER', heldFrom: { page: 'programs', path: '/programs' } };
    await b.discard({ x: 1 }, (await b.holdOf({ x: 1 }))!); await b.complete({ x: 1 }, (await b.holdOf({ x: 1 }))!); await b.settle({ x: 1 }, (await b.holdOf({ x: 1 }))!);
    expect(await b.heldByOther({ x: 1 })).toEqual(held);
    expect(await a.heldByOther({ x: 1 })).toBeUndefined();
    expect(await a.isPending({ x: 1 })).toBe(true);
    // Released by its own sender (key kept): another sender's discard still drops nothing, so the replay keeps the key.
    await a.settle({ x: 1 }, (await a.holdOf({ x: 1 }))!);
    await b.discard({ x: 1 }, (await b.holdOf({ x: 1 }))!); await b.complete({ x: 1 }, (await b.holdOf({ x: 1 }))!);
    expect(await b.heldByOther({ x: 1 })).toEqual(held);
    const again = await a.run({ x: 1 });
    expect(again.idem).toBe(first.idem);
    // Its own sender's discard does drop it: the next run sends a fresh key.
    await a.settle({ x: 1 }, (await a.holdOf({ x: 1 }))!);
    await a.discard({ x: 1 }, (await a.holdOf({ x: 1 }))!);
    expect((await a.run({ x: 1 })).idem).not.toBe(first.idem);
  });
  it('one definition mounted by two pages is two senders: B sees A\'s hold as other, and B\'s settle/dismiss/complete free nothing of it', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), lock: 'core2.fix2.pages', lockKey: () => ({}) });
    mode([reply(create, { status: 502, body: {} })]);
    const pa = renderHook(() => m.use({ page: 'computers' }), { wrapper: wrap });
    const pb = renderHook(() => m.use({ page: 'home' }), { wrapper: wrap });
    await act(async () => { await pa.result.current.run({ x: 1 }); });
    const [h] = heldChanges('core2.fix2.pages');
    expect(h!.from).toEqual({ page: 'computers', path: '/computers' });
    expect(m.forPage('computers').heldBy(h!)).toBe('self');
    expect(m.forPage('home').heldBy(h!)).toBe('other');
    let r!: MutationResult<unknown>;
    await act(async () => { r = await pb.result.current.run({ x: 2 }); });
    expect(r.error?.code).toBe('HELD_BY_OTHER');
    expect(r.heldFrom).toEqual({ page: 'computers', path: '/computers' });
    await act(async () => { pb.result.current.settle(); pb.result.current.dismiss(); pb.result.current.complete(); pb.result.current.discard(); await microFlush(); });
    expect(await m.forPage('computers').isPending({ x: 1 })).toBe(true);
    await m.forPage('home').discard({ x: 1 }, (await m.forPage('home').holdOf({ x: 1 }))!);
    expect(await m.forPage('home').heldByOther({ x: 1 })).toMatchObject({ code: 'HELD_BY_OTHER' });
    expect(await m.forPage('computers').isPending({ x: 1 })).toBe(true);
    await act(async () => { pa.result.current.dismiss(); await microFlush(); });
    expect(await m.isPending({ x: 1 })).toBe(false);
  });
  // A mount that sent nothing frees nothing without variables.
  // An earlier mount's hold stays recoverable, by its token.
  it('remount recovery by token: held() lists the earlier mount\'s send (hold, at, identity); dismissHeld(row) frees exactly it; a stale token frees nothing', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }), lockKey: (v) => ({ x: v.x }) });
    mode([reply(create, { status: 502, body: {} })]);
    const first = renderHook(() => m.use(), { wrapper: wrap });
    let ra!: MutationResult<unknown>, rb!: MutationResult<unknown>;
    await act(async () => { ra = await first.result.current.run({ x: 1 }); rb = await first.result.current.run({ x: 2 }); });
    first.unmount();
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    await act(async () => { result.current.settle(); await microFlush(); });
    expect(await m.isPending({ x: 1 })).toBe(true);
    const rows = result.current.held();
    expect(rows.map((x) => x.hold).sort()).toEqual([ra.hold, rb.hold].sort());
    const rowA = rows.find((x) => x.hold === ra.hold)!;
    expect(rowA.identity).toEqual({ x: 1 });
    expect(rowA.at).toBeGreaterThan(0);
    expect(await result.current.dismissHeld({ ...rowA, hold: ra.hold!.split('#')[0] + '#stale' })).toBe(false);
    expect(await result.current.dismissHeld({ ...rowA, account: 'someone-else\u0001' })).toBe(false);
    // Another page's view of the definition (another sender): lists nothing of these, frees nothing of these.
    const home = renderHook(() => m.use({ page: 'home' }), { wrapper: wrap });
    expect(home.result.current.held()).toEqual([]);
    expect(await home.result.current.dismissHeld(rowA)).toBe(false);
    let freed = false;
    await act(async () => { freed = await result.current.dismissHeld(rowA); });
    expect(freed).toBe(true);
    expect(await m.isPending({ x: 1 })).toBe(false);
    expect(await m.isPending({ x: 2 })).toBe(true);
    expect(result.current.held().map((x) => x.hold)).toEqual([rb.hold]);
  });
  it('remount, nothing sent by this mount: settle() and await complete() free nothing; the earlier mount\'s change is freed by its hold', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }) });
    mode([reply(create, { status: 502, body: {} })]);
    const first = renderHook(() => m.use(), { wrapper: wrap });
    await act(async () => { await first.result.current.run({ x: 1 }); });
    first.unmount();
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    await act(async () => { result.current.complete(); await microFlush(); });
    expect(await m.isPending({ x: 1 })).toBe(true);
    await act(async () => { result.current.settle(); await microFlush(); });
    expect(await m.isPending({ x: 1 })).toBe(true);
    expect(await m.settle({ x: 1 }, (await m.holdOf({ x: 1 }))!)).toBe(true);
    expect(await m.isPending({ x: 1 })).toBe(false);
  });
  it('await complete() frees only this mount\'s change; the earlier mount\'s stays', async () => {
    const m = defineMutation<{ x: number }>(create, { input: (v) => ({ body: v }) });
    mode([reply(create, { status: 502, body: {} })]);
    const first = renderHook(() => m.use(), { wrapper: wrap });
    await act(async () => { await first.result.current.run({ x: 1 }); });
    first.unmount();
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    await act(async () => { await result.current.run({ x: 2 }); });
    await act(async () => { result.current.complete(); await microFlush(); });
    expect(await m.isPending({ x: 2 })).toBe(false);
    expect(await m.isPending({ x: 1 })).toBe(true);
  });
});
