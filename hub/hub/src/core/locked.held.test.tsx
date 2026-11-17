// locked.held.test.tsx: useLockedChange held(), what a warning snapshots when it arms: this id's held changes in the
// current scope, each with its identity and the hold token of that very send. Passed back to dismissOne(identity,
// { hold }) its Dismiss frees exactly what it showed: never a later send of the same change, never another computer's
// or another page's hold.
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { api } from './api';
import { capture, snapshot } from './ctx';
import { useLockedChange, type LockedChange } from './locked';
import { prefix, queryClient } from './query';
import { defineRoute } from './routes';
import { boot, microFlush, onFetch, settle } from './test/env';

const list = defineRoute<{ data: string[] }>({ method: 'GET', path: '/computers', scope: 'realm' });
const rename = defineRoute<unknown, { name: string }>({ method: 'PATCH', path: '/computers/:id', scope: 'realm', body: ['name'] });
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }
const KEY = (): readonly unknown[] => [...prefix(snapshot()), 'test', 'list'];
const isList = (k: readonly unknown[]): boolean => k[4] === 'test' && k[5] === 'list';

// One lock per computer; the identity names the computer and the send's own op. Every PATCH answers 502: pending.
interface V { computer: string; op: string }
const send = (v: V) => api(rename, { params: { id: v.computer }, body: { name: v.op }, ctx: capture() });
const idOf = (v: V) => ({ computer: v.computer, op: v.op });

function start(): { mine: () => LockedChange<V, unknown>; other: () => LockedChange<V, unknown> } {
  boot();
  queryClient.clear();
  onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
  let mine!: LockedChange<V, unknown>, other!: LockedChange<V, unknown>;
  function Probe() {
    useQuery({ queryKey: KEY(), queryFn: () => api(list, { ctx: capture() }), retry: false });
    mine = useLockedChange(send, [isList], 'test.held.mine', { lock: 'test.held.shared', lockKey: (v) => ({ computer: v.computer }), identity: idOf });
    other = useLockedChange(send, [isList], 'test.held.other', { lock: 'test.held.shared', lockKey: (v) => ({ computer: v.computer }), identity: idOf });
    return null;
  }
  render(<Probe />, { wrapper: wrap });
  return { mine: () => mine, other: () => other };
}
const pend = async (h: () => LockedChange<V, unknown>, v: V) => { await act(async () => { await h().run(v); await flush(); }); };

describe('useLockedChange held()', () => {
  it('nothing held: an empty list', async () => {
    const h = start();
    await act(flush);
    expect(h.mine().held()).toEqual([]);
  });

  it('lists each held change of this id with its identity and its own hold token; reading it frees nothing', async () => {
    const h = start();
    await act(flush);
    await pend(h.mine, { computer: 'atlas', op: 'o1' });
    await pend(h.mine, { computer: 'boreas', op: 'o2' });
    const rows = h.mine().held();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.identity)).toEqual(expect.arrayContaining([{ computer: 'atlas', op: 'o1' }, { computer: 'boreas', op: 'o2' }]));
    for (const r of rows) expect(typeof r.hold === 'string' && r.hold !== '').toBe(true);
    expect(rows[0]!.hold).not.toBe(rows[1]!.hold);
    expect(Object.isFrozen(rows)).toBe(true);
    expect(Object.isFrozen(rows[0]!.identity)).toBe(true);
    expect(h.mine().held()).toEqual(rows);
    expect(h.mine().state).toBe('pending');
  });

  it('a row frees exactly its own send through dismissOne(identity, { hold }); the other row stays held', async () => {
    const h = start();
    await act(flush);
    await pend(h.mine, { computer: 'atlas', op: 'o1' });
    await pend(h.mine, { computer: 'boreas', op: 'o2' });
    const atlas = h.mine().held().find((r) => (r.identity as { computer: string }).computer === 'atlas')!;
    let ok = false;
    await act(async () => { ok = await h.mine().dismissOne(atlas.identity, { hold: atlas.hold }); await microFlush(); });
    expect(ok).toBe(true);
    expect(h.mine().held().map((r) => r.identity)).toEqual([{ computer: 'boreas', op: 'o2' }]);
    expect(h.mine().state).toBe('pending');
  });

  it('a row read before the change was sent again frees nothing: the later send is not the one it showed', async () => {
    const h = start();
    await act(flush);
    await pend(h.mine, { computer: 'atlas', op: 'o1' });
    const [shown] = h.mine().held();
    let ok = false;
    // Freed elsewhere (another view's Dismiss), then the same change goes out again and is held again.
    await act(async () => { ok = await h.mine().dismiss(); await microFlush(); });
    expect(ok).toBe(true);
    expect(h.mine().held()).toEqual([]);
    await pend(h.mine, { computer: 'atlas', op: 'o1' });
    const [now] = h.mine().held();
    expect(now!.identity).toEqual(shown!.identity);
    expect(now!.hold).not.toBe(shown!.hold);
    await act(async () => { ok = await h.mine().dismissOne(shown!.identity, { hold: shown!.hold }); await microFlush(); });
    expect(ok).toBe(false);
    expect(h.mine().state).toBe('pending');
    await act(async () => { ok = await h.mine().dismissOne(now!.identity, { hold: now!.hold }); await microFlush(); });
    expect(ok).toBe(true);
    expect(h.mine().held()).toEqual([]);
    expect(h.mine().state).toBe('free');
  });

  it('never lists another page\'s held change sharing the lock (its own held() does)', async () => {
    const h = start();
    await act(flush);
    await pend(h.other, { computer: 'atlas', op: 'o1' });
    expect(h.mine().state).toBe('pending');
    expect(h.mine().heldBy).toBe('other');
    expect(h.mine().held()).toEqual([]);
    expect(h.other().held().map((r) => r.identity)).toEqual([{ computer: 'atlas', op: 'o1' }]);
  });
});
