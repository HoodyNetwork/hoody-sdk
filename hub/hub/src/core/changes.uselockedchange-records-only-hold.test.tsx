// useLockedChange:
// useLockedChange records only the hold its own pending answer carried, in the account it was pressed in (never a
// lock looked up after the await), and HeldRow carries the computer a held send went to.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from './api';
import * as C from './changes';
import { CHANGE_STORE_KEY, readChanges } from './change-store';
import { bump, capture, setIdentity, setTarget } from './ctx';
import { useLockedChange, type LockedChange, type LockedResult } from './locked';
import { defineMutation, queryClient } from './query';
import { defineRoute } from './routes';
import { coreSource, type SourceMutation, type SourceResult } from './source';
import { boot, calls, onFetch, R1, settle, microFlush } from './test/env';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }
const announce = (): boolean => window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
type Rec = { id: string; pending: boolean; t: number; inc?: string; nonce?: string };
const raw = (): Rec[] => JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Rec[];
const as = (id: string): void => { setIdentity({ id, banned: false }); bump('account'); };
const OTHER = 'someone-else';
const rename = defineRoute<unknown, { name: string }>({ method: 'PATCH', path: '/computers/:id', scope: 'realm', body: ['name'] });
const send = (v: { name: string }) => api(rename, { params: { id: 'c1' }, body: { name: v.name }, ctx: capture() });

/** B (now shown) holds a pending change of the same lock as A's outstanding one (`sameToken`: even with A's very
 *  token, so only the account check tells them apart). Returns B's hold. */
function bHoldsTheSame(aOwn: string, lock: string, sameToken: boolean): string {
  const bOwn = C.changeOwner();
  const a = raw().find((r) => r.id.startsWith(aOwn))!;
  const twin = { ...a, id: bOwn + a.id.slice(aOwn.length), pending: true, ...(sameToken ? {} : { inc: 'b-inc', nonce: 'b-nonce' }), t: a.t + 1 };
  delete (twin as { sending?: unknown }).sending;
  localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([...raw(), twin]));
  announce();
  const held = C.heldChanges(lock);
  expect(held.map((h) => h.hold)).toEqual([(sameToken ? a.inc + '#' + a.nonce : 'b-inc#b-nonce') + '~' + ((a as { oc?: string }).oc ?? '')]);
  return held[0]!.hold!;
}

describe('useLockedChange records only the hold its own pending answer carried, in the press\'s account', () => {
  let release!: (status: number) => void;
  beforeEach(() => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? new Promise((r) => { release = (status) => r({ status, body: status === 200 ? { data: {} } : {} }); }) : { status: 200, body: { data: [] } }));
  });
  afterEach(() => { cleanup(); });
  for (const same of [false, true]) {
    it(`A answers pending while B is shown${same ? ' (B\'s record carries A\'s very token)' : ''}: the old mount's await discard() frees nothing of B's`, async () => {
      const lock = 'case-e3.l' + (same ? 't' : '');
      let h!: LockedChange<{ name: string }, unknown>;
      function Probe() { h = useLockedChange(send, [], 'case-e3.l' + (same ? 't' : ''), { lock, lockKey: () => ({}) }); return null; }
      render(<Probe />, { wrapper: wrap });
      const aOwn = C.changeOwner();
      let going!: Promise<LockedResult<unknown>>;
      await act(async () => { going = h.run({ name: 'a' }); await flush(); });
      expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
      await act(async () => { as(OTHER); });
      const bHold = bHoldsTheSame(aOwn, lock, same);
      await act(async () => { await release(502); await going; await flush(); });
      await act(async () => { h.discard(); await microFlush(); });
      await act(flush);
      expect(C.heldChanges(lock).map((x) => x.hold)).toEqual([bHold]);
    });
  }
  it('control: the same account, nothing switched: await discard() frees the mount\'s own pending send', async () => {
    let h!: LockedChange<{ name: string }, unknown>;
    function Probe() { h = useLockedChange(send, [], 'case-e3.own', { lock: 'case-e3.own', lockKey: () => ({}) }); return null; }
    render(<Probe />, { wrapper: wrap });
    let going!: Promise<LockedResult<unknown>>;
    await act(async () => { going = h.run({ name: 'a' }); await flush(); });
    await act(async () => { await release(502); expect((await going).outcome).toBe('pending'); await flush(); });
    expect(C.heldChanges('case-e3.own')).toHaveLength(1);
    await act(async () => { h.discard(); await microFlush(); });
    expect(C.heldChanges('case-e3.own')).toHaveLength(0);
    await act(flush);
    expect((readChanges() ?? []).filter((r) => r.pending)).toEqual([]);
  });
});

describe('HeldRow carries the held send\'s computer (target)', () => {
  const C1 = { project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } };
  const C2 = { project: { id: 'p1' }, container: { id: 'c2', server_name: 's1' } };
  const containers = (rows: readonly C.HeldRow[]): Array<string | null> => rows.map((r) => r.target?.container.id ?? null).sort();
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); setTarget(C1); onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: { data: [] } })); });
  afterEach(() => { cleanup(); });
  it('query hook: one identity held on computers A and B lists two rows with distinct targets', async () => {
    const route = defineRoute({ method: 'POST', path: '/case-e3/q', scope: 'agent', body: ['x'] });
    const m = defineMutation<{ x: number }>(route, { input: (v) => ({ body: v }), lock: 'case-e3.q', lockKey: () => ({ same: true }) });
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    act(() => { setTarget(C2); });
    expect((await m.run({ x: 1 })).outcome).toBe('pending');
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    const rows = result.current.held();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.identity)).toEqual([{ same: true }, { same: true }]);
    expect(containers(rows)).toEqual(['c1', 'c2']);
    expect(Object.isFrozen(rows[0]!.target)).toBe(true);
  });
  it('source hook: the same, through coreSource', async () => {
    const create = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/case-e3/s', scope: 'agent', body: ['name'] });
    const list = defineRoute({ method: 'GET', path: '/case-e3/s', scope: 'agent' });
    const src = coreSource('case-e3-src', { reads: { list: { route: list } }, changes: { create: { route: create, lock: 'case-e3.s', lockKey: () => ({ same: true }), input: (v: { name: string }) => ({ body: v }), reads: ['list'] } } });
    let last!: SourceMutation<unknown, { name: string }> & { mutateAsync: (v: { name: string }) => Promise<SourceResult<unknown>> };
    function Probe() { last = src.useMutation<unknown, { name: string }>('create') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await last.mutateAsync({ name: 'a' }); await flush(); });
    act(() => { setTarget(C2); });
    await act(async () => { await last.mutateAsync({ name: 'a' }); await flush(); });
    const rows = last.held();
    expect(rows).toHaveLength(2);
    expect(containers(rows)).toEqual(['c1', 'c2']);
  });
});
