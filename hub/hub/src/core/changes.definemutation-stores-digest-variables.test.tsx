// Nothing derived from a change's secret variables is stored. The stored
// record holds no digest of the variables (keyBytes stays in memory), a throwing lockKey never falls back to the
// variables, and a route that declares secret body keys needs a lockKey.
import { QueryClientProvider, useQuery, type UseMutationResult } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from './api';
import * as C from './changes';
import { CHANGE_STORE_KEY, readChanges, writeChanges } from './change-store';
import { capture, snapshot } from './ctx';
import { useLockedChange, type LockedChange } from './locked';
import { defineMutation, fallbackDigest, prefix, queryClient, stableJson, varsDigest } from './query';
import { defineRoute } from './routes';
import { coreSource, type SourceError, type SourceMutation, type SourceResult } from './source';
import { boot, calls, onFetch, R1, settle } from './test/env';

const SECRET = 'planted-secret-Hx7q-2026';
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }
const raw = (): string => localStorage.getItem(CHANGE_STORE_KEY) ?? '';
const posts = (): number => calls.filter((c) => c.method === 'POST').length;
/** A digest of the whole `vars` in either form core makes (SHA-256, or its fallback), or the plain secret. A digest
 *  of one field alone is not looked for (the stored identity is the lockKey value, which names no secret here). */
async function leaks(vars: unknown): Promise<string[]> {
  const s = raw();
  const forms = [await varsDigest(vars), fallbackDigest(stableJson(vars)), SECRET];
  return forms.filter((f) => s.includes(f));
}

describe('defineMutation stores no digest of variables that hold a secret', () => {
  beforeEach(() => { boot({ realm: R1 }); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  const route = defineRoute({ method: 'POST', path: '/sec1/idem', scope: 'agent', body: ['n', 'password'], idem: true });
  const m = defineMutation<{ n: number; password: string }>(route, { input: (v) => ({ body: { n: v.n, password: v.password } }), lock: 'sec1.idem', lockKey: (v) => ({ n: v.n }), page: 'programs' });
  it('pending with its key, then released keeping it: the stored record never holds the variables\' digest', async () => {
    const vars = { n: 1, password: SECRET };
    const r = await m.run(vars);
    expect(r.outcome).toBe('pending');
    expect(r.idem).toBeTruthy();
    expect(raw()).toContain(r.idem!); // the record and its key are stored
    expect(await leaks(vars)).toEqual([]);
    expect(await m.settle(vars, r.hold!)).toBe(true); // released, key kept
    expect(readChanges()?.[0]?.key).toBe(r.idem);
    expect(await leaks(vars)).toEqual([]);
  });
  it('in this tab a released key is still replayed for the same bytes only (the bytes live in memory)', async () => {
    const vars = { n: 1, password: SECRET };
    const r = await m.run(vars);
    await m.settle(vars, r.hold!);
    const again = await m.run(vars);
    expect(again.idem).toBe(r.idem);
    await m.settle(vars, again.hold!);
    const other = await m.run({ n: 1, password: SECRET + '-2' });
    expect(other.idem).not.toBe(r.idem);
    expect(posts()).toBe(3);
  });
  it('after a reload the bytes are unknown: a released key is never replayed for a body nobody can compare (a new key)', async () => {
    const vars = { n: 1, password: SECRET };
    const r = await m.run(vars);
    await m.settle(vars, r.hold!);
    C.reloadChangesForTests();
    const again = await m.run(vars);
    expect(again.outcome).toBe('pending');
    expect(again.idem).not.toBe(r.idem);
    expect(await leaks(vars)).toEqual([]);
  });
  it('a record stored by an older build with keyBytes: the bytes are never used, and its next write drops them', async () => {
    const vars = { n: 1, password: SECRET };
    const r = await m.run(vars);
    await m.settle(vars, r.hold!);
    const old = await varsDigest(vars);
    const list = JSON.parse(raw()) as Array<Record<string, unknown>>;
    list[0]!.keyBytes = old;
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list));
    C.reloadChangesForTests();
    const again = await m.run(vars);
    expect(again.idem).not.toBe(r.idem); // the stored bytes did not vouch for the body
    expect(raw()).not.toContain(old);
  });
  it('another tab replayed the change under another key: this tab\'s bytes no longer vouch for the stored key', async () => {
    const vars = { n: 1, password: SECRET };
    const r = await m.run(vars);
    await m.settle(vars, r.hold!);
    const [rec] = readChanges() ?? [];
    writeChanges([{ ...rec!, key: 'key-from-tab-B', nonce: 'nB', t: (rec!.t ?? 0) + 1 }]); // tab B: released under its own key
    window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
    await flush();
    const again = await m.run(vars);
    expect(again.outcome).toBe('pending');
    expect(again.idem).not.toBe('key-from-tab-B'); // tab B's key went with bytes this tab never saw
    expect(again.idem).not.toBe(r.idem);
  });
});

describe('a throwing lockKey never digests the variables (and is refused)', () => {
  beforeEach(() => { boot({ realm: R1 }); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  const route = defineRoute({ method: 'POST', path: '/sec1/throws', scope: 'agent', body: ['password'] });
  const m = defineMutation<{ password: string }>(route, { input: (v) => ({ body: { password: v.password } }), lock: 'sec1.throws', lockKey: () => { throw new Error('page bug'); }, page: 'programs' });
  it('the press is refused before it is sent (INPUT_INVALID); nothing of the variables is stored', async () => {
    const vars = { password: SECRET };
    const r = await m.run(vars);
    expect(r).toMatchObject({ outcome: 'not_sent', error: { code: 'INPUT_INVALID' } });
    expect(await leaks(vars)).toEqual([]);
    expect(await m.isPending(vars)).toBe(false);
    expect(posts()).toBe(0);
  });
});

describe('a route declaring secret body keys needs a lockKey', () => {
  const route = defineRoute({ method: 'POST', path: '/sec1/secret-body', scope: 'agent', body: ['name', 'token'], secret: ['token'] });
  it('defineMutation without a lockKey is refused at definition; with one it is accepted', () => {
    expect(() => defineMutation<{ name: string; token: string }>(route, { input: (v) => ({ body: v }) })).toThrow(/lockKey/);
    expect(() => defineMutation<{ name: string; token: string }>(route, { input: (v) => ({ body: v }), lock: 'sec1.secret-body', lockKey: (v) => ({ name: v.name }) })).not.toThrow();
  });
  it('a coreSource change without a lockKey is refused at definition', () => {
    expect(() => coreSource('sec1-secret-src', { reads: {}, changes: { put: { route, input: (v: { name: string; token: string }) => ({ body: v }) } } })).toThrow(/lockKey/);
  });
});

describe('coreSource and useLockedChange store no digest of secret variables', () => {
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: [] } } : { status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  it('a coreSource change on an idem route with a lockKey', async () => {
    const create = defineRoute<unknown, { name: string; token: string }>({ method: 'POST', path: '/sec1/src', scope: 'agent', body: ['name', 'token'], idem: true });
    const table = { reads: {}, changes: { create: { route: create, lock: 'sec1.src', lockKey: (v: { name: string; token: string }) => ({ name: v.name }), input: (v: { name: string; token: string }) => ({ body: v }) } } };
    const src = coreSource('sec1-src', table);
    let last!: UseMutationResult<SourceResult<unknown>, SourceError, { name: string; token: string }> & SourceMutation<unknown, { name: string; token: string }>;
    function Probe() { last = src.useMutation<unknown, { name: string; token: string }>('create') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    const vars = { name: 'a', token: SECRET };
    let r!: SourceResult<unknown>;
    await act(async () => { r = await last.mutateAsync(vars); await flush(); });
    expect(r.outcome).toBe('pending');
    expect(raw()).not.toBe('');
    expect(await leaks(vars)).toEqual([]);
  });
  it('useLockedChange with a lockKey (it always mints a key)', async () => {
    const list = defineRoute<{ data: string[] }>({ method: 'GET', path: '/computers', scope: 'realm' });
    const rename = defineRoute<unknown, { name: string }>({ method: 'PATCH', path: '/computers/:id', scope: 'realm', body: ['name'] });
    const KEY = (): readonly unknown[] => [...prefix(snapshot()), 'sec1', 'list'];
    const run = (v: { name: string; password: string }) => api(rename, { params: { id: 'c1' }, body: { name: v.name }, ctx: capture() });
    let ch!: LockedChange<{ name: string; password: string }, unknown>;
    function Probe() {
      useQuery({ queryKey: KEY(), queryFn: () => api(list, { ctx: capture() }), retry: false });
      ch = useLockedChange(run, [(k) => k[4] === 'sec1'], 'sec1.locked', { lockKey: (v: { name: string; password: string }) => ({ name: v.name }) });
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    const vars = { name: 'a', password: SECRET };
    await act(async () => { await ch.run(vars); await flush(); });
    expect(ch.state).toBe('pending');
    expect(raw()).not.toBe('');
    expect(await leaks(vars)).toEqual([]);
  });
});

describe('a throwing lockKey in coreSource and useLockedChange never digests the variables (and is refused)', () => {
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: [] } } : { status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  it('coreSource', async () => {
    const put = defineRoute<unknown, { name: string; token: string }>({ method: 'POST', path: '/sec1/src-throws', scope: 'agent', body: ['name', 'token'] });
    const table = { reads: {}, changes: { put: { route: put, lock: 'sec1.src-throws', lockKey: (): unknown => { throw new Error('page bug'); }, input: (v: { name: string; token: string }) => ({ body: v }) } } };
    const src = coreSource('sec1-src-throws', table);
    let last!: UseMutationResult<SourceResult<unknown>, SourceError, { name: string; token: string }> & SourceMutation<unknown, { name: string; token: string }>;
    function Probe() { last = src.useMutation<unknown, { name: string; token: string }>('put') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    const vars = { name: 'a', token: SECRET };
    let r!: SourceResult<unknown>;
    await act(async () => { r = await last.mutateAsync(vars); await flush(); });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'INPUT_INVALID' });
    expect(posts()).toBe(0);
    expect(await leaks(vars)).toEqual([]);
  });
  it('useLockedChange', async () => {
    const rename = defineRoute<unknown, { name: string }>({ method: 'PATCH', path: '/computers/:id', scope: 'realm', body: ['name'] });
    const run = (v: { name: string; password: string }) => api(rename, { params: { id: 'c1' }, body: { name: v.name }, ctx: capture() });
    let ch!: LockedChange<{ name: string; password: string }, unknown>;
    function Probe() { ch = useLockedChange(run, [], 'sec1.locked-throws', { lockKey: (): unknown => { throw new Error('page bug'); } }); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    const vars = { name: 'a', password: SECRET };
    let r!: Awaited<ReturnType<typeof ch.run>>;
    await act(async () => { r = await ch.run(vars); await flush(); });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'INPUT_INVALID' });
    expect(ch.state).not.toBe('pending');
    expect(posts()).toBe(0);
    expect(await leaks(vars)).toEqual([]);
  });
});
