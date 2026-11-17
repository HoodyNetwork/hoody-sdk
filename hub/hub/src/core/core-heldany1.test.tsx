// MutationDef.heldAny() lists every sender's held sends of the lock base (the hook's
// held() without its sender filter), read only.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as C from './changes';
import { CHANGE_STORE_KEY } from './change-store';
import { bump, setRealm } from './ctx';
import { defineMutation, queryClient } from './query';
import { defineRoute } from './routes';
import { boot, onFetch, R1, R2 } from './test/env';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
type Stored = { id: string; pending: boolean; meta?: { by?: string; page?: string; identity?: unknown } };
const route = defineRoute({ method: 'POST', path: '/heldany1/x', scope: 'realm', body: ['x'] });
const m = defineMutation<{ x: number }>(route, { input: (v) => ({ body: v }), lock: 'heldany1.l', lockKey: (v) => ({ x: v.x }), page: 'own' });

describe('heldAny() lists every sender\'s held sends, frees nothing', () => {
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: { data: [] } })); });
  afterEach(() => { cleanup(); });
  it('another sender, no sender and its own: three rows, oldest first, HeldRow shape; the hook\'s held() keeps only its own', async () => {
    expect((await m.forPage('other').run({ x: 1 })).outcome).toBe('pending');
    expect((await m.run({ x: 2 })).outcome).toBe('pending');
    // the {x:2} send becomes a hold recording no sender (an older build's record)
    const list = JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Stored[];
    for (const r of list) if (r.meta && JSON.stringify(r.meta.identity) === '{"x":2}') { delete r.meta.by; delete r.meta.page; }
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list));
    C.reloadChangesForTests();
    expect((await m.run({ x: 3 })).outcome).toBe('pending');
    const rows = m.heldAny();
    expect(rows.map((r) => r.identity)).toEqual([{ x: 1 }, { x: 2 }, { x: 3 }]);
    expect(rows.every((r) => Object.isFrozen(r) && Object.keys(r).sort().join() === 'account,at,hold,identity,target')).toBe(true);
    expect(rows.every((r) => r.account === C.changeOwner() && typeof r.hold === 'string' && r.hold.length > 0)).toBe(true);
    expect(C.heldChanges('heldany1.l').map((h) => h.by === undefined)).toEqual([false, true, false]);
    // read only: nothing freed
    expect(C.heldChanges('heldany1.l')).toHaveLength(3);
    // the hook's held() stays sender-scoped
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    expect(result.current.held().map((r) => r.identity)).toEqual([{ x: 3 }]);
    expect(m.forPage('other').heldAny().map((r) => r.identity)).toEqual([{ x: 1 }, { x: 2 }, { x: 3 }]);
  });
  it('a realm the reads do not read lists nothing; the realm read again lists them', async () => {
    expect((await m.forPage('other').run({ x: 1 })).outcome).toBe('pending');
    expect(m.heldAny()).toHaveLength(1);
    act(() => { setRealm(R2); bump('switch'); });
    expect(m.heldAny()).toEqual([]);
    act(() => { setRealm(R1); bump('switch'); });
    expect(m.heldAny().map((r) => r.identity)).toEqual([{ x: 1 }]);
  });
});
