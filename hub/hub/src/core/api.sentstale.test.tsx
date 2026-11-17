// A change that went out is pending whenever its context died
// before its answer was read, a definite refusal included, keyed or keyless: the send may repeat an earlier one whose
// outcome is unknown (a kept key, a key restored after a reload, a key carried in the body), and a refusal of this send
// settles nothing about that one. Only a change never sent reads not_sent. The key a call is checked with is the key
// it is admitted and sent with.
import { QueryClientProvider, type UseMutationResult } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, outcomeOf, type HubError } from './api';
import * as C from './changes';
import { CHANGE_STORE_KEY, type StoredChange } from './change-store';
import { bump, capture } from './ctx';
import { newKey } from './kit';
import { useLockedChange, type LockedChange } from './locked';
import { defineMutation, queryClient } from './query';
import { defineRoute } from './routes';
import { coreSource, type SourceError, type SourceMutation, type SourceResult } from './source';
import { boot, calls, onFetch, R1, settle } from './test/env';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const spins = async (n = 20): Promise<void> => { for (let i = 0; i < n; i++) await settle(); };
const raw = (): StoredChange[] => JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as StoredChange[];
const posts = () => calls.filter((c) => c.method !== 'GET');
const outcome = (p: Promise<unknown>): Promise<HubError> => p.then(() => ({}) as HubError, (e: HubError) => e);
// The realm switch lands after the answer arrived (a few microtasks after fetch resolves, before api() reads the
// rejection), like a buffered answer: a switch while the request is out aborts an agent request instead.
const afterAnswer = (f: () => void): void => { let p: Promise<void> = Promise.resolve(); for (let i = 0; i < 4; i++) p = p.then(() => undefined); void p.then(f); };
const dead429 = () => onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: [] } } : (afterAnswer(() => bump('switch')), { status: 429, body: { error: 'RATE_LIMITED' } })));
const unknown502 = () => onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: [] } } : { status: 502, body: {} }));
type V = { n: number };

describe('s1: api, a sent change answered after its context died', () => {
  const keyed = defineRoute({ method: 'POST', path: '/c8d/s1', scope: 'agent', body: ['n'], idem: true });
  const plain = defineRoute({ method: 'POST', path: '/c8d/s1/plain', scope: 'agent', body: ['n'] });
  const read = defineRoute({ method: 'GET', path: '/c8d/s1/read', scope: 'agent' });
  beforeEach(() => { boot({ realm: R1 }); });
  it('s1a: a key core minted, on its first send, refused 429: pending', async () => {
    dead429();
    expect(outcomeOf(await outcome(api(keyed, { body: { n: 1 }, idem: newKey() })), true)).toBe('pending');
  });
  it('s1b: a caller key refused 429: pending', async () => {
    dead429();
    expect(outcomeOf(await outcome(api(keyed, { body: { n: 1 }, idem: 'K-caller' })), true)).toBe('pending');
  });
  it('s1c: no key, refused 429: pending', async () => {
    dead429();
    expect(outcomeOf(await outcome(api(plain, { body: { n: 1 } })), true)).toBe('pending');
  });
  it('s1d control: a read answered after its context died is stale', async () => {
    onFetch(() => (afterAnswer(() => bump('switch')), { status: 200, body: { data: [] } }));
    expect(outcomeOf(await outcome(api(read, {})), false)).toBe('stale');
  });
  it('s1e control: a change whose context died before the send is not_sent, nothing sent', async () => {
    onFetch(() => ({ status: 200, body: {} }));
    const ctx = capture();
    bump('switch');
    const e = await outcome(api(plain, { body: { n: 1 }, ctx }));
    expect(e.kind).toBe('not_sent');
    expect(outcomeOf(e, true)).toBe('not_sent');
    expect(calls.length).toBe(0);
  });
});

describe('502, Dismiss keeping the caller key, reload, the same key, 429 after a switch', () => {
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); unknown502(); });
  afterEach(() => { cleanup(); C.resetChanges(); });
  it('k2a defineMutation: the hold stays pending with K1', async () => {
    const route = defineRoute({ method: 'POST', path: '/c8d/k2a', scope: 'agent', body: ['n'], idem: true });
    const m = defineMutation<V>(route, { input: (v) => ({ body: v, idem: 'K1' }), lock: 'c8d.k2a', lockKey: (v) => ({ n: v.n }), proves: () => 'applied', page: 'programs' });
    const first = await m.run({ n: 1 });
    expect(first.outcome).toBe('pending');
    expect(await m.dismiss({ n: 1 }, first.hold!)).toBe(true);
    await spins();
    C.reloadChangesForTests();
    await spins();
    dead429();
    const again = await m.run({ n: 1 });
    expect(posts().length).toBe(2);
    expect(posts().every((c) => JSON.stringify(c).includes('K1'))).toBe(true);
    expect(again.outcome).toBe('pending');
    expect(raw().filter((r) => r.pending && r.key === 'K1').length).toBe(1);
  });
  it('k2b coreSource: the hold stays pending with K1', async () => {
    const route = defineRoute({ method: 'POST', path: '/c8d/k2b', scope: 'agent', body: ['n'], idem: true });
    const src = coreSource('c8d-src', { reads: {}, changes: { put: { route, lock: 'c8d.k2b', lockKey: (v: V): unknown => ({ n: v.n }), input: (v: V) => ({ body: v, idem: 'K1' }) } } });
    let last!: UseMutationResult<SourceResult<unknown>, SourceError, V> & SourceMutation<unknown, V>;
    function Probe() { last = src.useMutation<unknown, V>('put') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    let r!: SourceResult<unknown>;
    await act(async () => { r = await last.mutateAsync({ n: 1 }); await spins(); });
    expect(r.outcome).toBe('pending');
    const rows = last.held();
    expect(rows.length).toBe(1);
    let freed = false;
    await act(async () => { freed = await last.dismissHeld(rows[0]!); await spins(); });
    expect(freed).toBe(true);
    C.reloadChangesForTests();
    await act(async () => { await spins(); });
    dead429();
    await act(async () => { r = await last.mutateAsync({ n: 1 }); await spins(); });
    expect(posts().length).toBe(2);
    expect(posts().every((c) => JSON.stringify(c).includes('K1'))).toBe(true);
    expect(r.outcome).toBe('pending');
    expect(raw().filter((x) => x.pending && x.key === 'K1').length).toBe(1);
  });
  it('k2c defineMutation: a first send with a key core minted, refused 429 after a switch, is pending and held', async () => {
    const route = defineRoute({ method: 'POST', path: '/c8d/k2c', scope: 'agent', body: ['n'], idem: true });
    const m = defineMutation<V>(route, { input: (v) => ({ body: v }), lock: 'c8d.k2c', lockKey: (v) => ({ n: v.n }), proves: () => 'applied', page: 'programs' });
    dead429();
    expect((await m.run({ n: 1 })).outcome).toBe('pending');
    await spins();
    expect(raw().filter((x) => x.pending).length).toBe(1);
  });
  it('k2d coreSource: a first send with a key core minted, refused 429 after a switch, is pending and held', async () => {
    const route = defineRoute({ method: 'POST', path: '/c8d/k2d', scope: 'agent', body: ['n'], idem: true });
    const src = coreSource('c8d-src2', { reads: {}, changes: { put: { route, lock: 'c8d.k2d', lockKey: (v: V): unknown => ({ n: v.n }), input: (v: V) => ({ body: v }) } } });
    let last!: UseMutationResult<SourceResult<unknown>, SourceError, V> & SourceMutation<unknown, V>;
    function Probe() { last = src.useMutation<unknown, V>('put') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    dead429();
    let r!: SourceResult<unknown>;
    await act(async () => { r = await last.mutateAsync({ n: 1 }); await spins(); });
    expect(r.outcome).toBe('pending');
    expect(raw().filter((x) => x.pending).length).toBe(1);
  });
});

describe('a key carried in the body (the gate decision shape), no idempotency header', () => {
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); unknown502(); });
  afterEach(() => { cleanup(); C.resetChanges(); });
  it('g1: 502, Dismiss keeping the key, the same decision again, a buffered 429 across a switch: pending and held', async () => {
    const route = defineRoute({ method: 'POST', path: '/c8d/g1/gate', scope: 'agent', body: ['gate_id', 'request_id', 'confirm'] });
    const send = (v: { approve: boolean }, idem: string, ctx: Parameters<Parameters<typeof useLockedChange>[0]>[2]) =>
      api(route, { body: { gate_id: 'g1', request_id: idem, confirm: { approved: v.approve } }, ctx });
    let last!: LockedChange<{ approve: boolean }, unknown>;
    function Probe() { last = useLockedChange(send, [], 'c8d.gate', { lock: 'c8d.gate', lockKey: () => ({ g: 'g1' }) }); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await last.run({ approve: true }); await spins(); });
    expect(last.state).toBe('pending');
    await act(async () => { last.dismiss(); await spins(); });
    expect(last.state).toBe('free');
    dead429();
    let r!: { outcome: string };
    await act(async () => { r = (await last.run({ approve: true })) as { outcome: string }; await spins(); });
    const ids = posts().map((c) => (c.body as { request_id?: string }).request_id);
    expect(ids.length).toBe(2);
    expect(typeof ids[0]).toBe('string');
    expect(ids[1]).toBe(ids[0]);
    expect(r.outcome).toBe('pending');
    expect(last.state).toBe('pending');
    expect(raw().filter((x) => x.pending).length).toBe(1);
  });
});

describe('an unsent replay never becomes a pending hold', () => {
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); unknown502(); });
  afterEach(() => { cleanup(); C.resetChanges(); });
  async function storeLockHeld(): Promise<() => void> {
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    void navigator.locks.request('hub_changes', () => gate);
    await settle();
    return open;
  }
  it('k3a useLockedChange: 502, dismissed (its key kept), then a press whose context dies at admission: nothing sent, no hold', async () => {
    const route = defineRoute({ method: 'POST', path: '/c8d/k3', scope: 'agent', body: ['name'], idem: true });
    const send = (v: { name: string }, idem: string, ctx: Parameters<Parameters<typeof useLockedChange>[0]>[2]) => api(route, { body: v, idem, ctx });
    let last!: LockedChange<{ name: string }, unknown>;
    function Probe() { last = useLockedChange(send, [], 'c8d.locked', { lock: 'c8d.locked', lockKey: (v: { name: string }) => ({ k: v.name }) }); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await last.run({ name: 'a' }); await spins(); });
    expect(last.state).toBe('pending');
    await act(async () => { last.dismiss(); await spins(); });
    expect(last.state).toBe('free');
    expect(raw().filter((x) => x.pending).length).toBe(0);
    const sentBefore = posts().length;
    const open = await storeLockHeld();
    let p!: Promise<unknown>;
    await act(async () => { p = last.run({ name: 'a' }); await settle(); });
    bump('switch');
    open();
    let r!: { outcome: string };
    await act(async () => { r = (await p) as { outcome: string }; await spins(); });
    // One mutation request in all: the first press's. The second never left, so it is not_sent.
    expect(sentBefore).toBe(1);
    expect(posts().length).toBe(1);
    expect(r.outcome).toBe('not_sent');
    expect(raw().filter((x) => x.pending).length).toBe(0);
    expect(last.state).toBe('free');
  });
});

describe('the key is read once, so the key checked is the key admitted and sent', () => {
  const keyed = defineRoute({ method: 'POST', path: '/c8d/m1', scope: 'agent', body: ['n'], idem: true });
  beforeEach(() => { boot({ realm: R1 }); onFetch(() => ({ status: 200, body: {} })); });
  it('m1a: a body whose toJSON sets the key after the check: refused unsent, nothing sent', async () => {
    const input: { body: unknown; idem?: string } = { body: null };
    input.body = { n: 1, toJSON() { input.idem = 'K1'; return { n: 1 }; } };
    const e = await outcome(api(keyed, input as never));
    expect(e).toMatchObject({ notSent: true, code: 'IDEMPOTENCY_KEY_INVALID' });
    expect(calls.length).toBe(0);
  });
  it('m1b: a key getter that changes between reads: refused unsent, nothing sent', async () => {
    let reads = 0;
    const input = { body: { n: 1 }, get idem() { return reads++ === 0 ? undefined : 'K1'; } };
    const e = await outcome(api(keyed, input as never));
    expect(e).toMatchObject({ notSent: true, code: 'IDEMPOTENCY_KEY_INVALID' });
    expect(calls.length).toBe(0);
    expect(reads).toBe(1);
  });
});
