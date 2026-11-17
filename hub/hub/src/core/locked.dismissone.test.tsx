// locked.dismissone.test.tsx: useLockedChange dismissOne(identity), the person's warned Dismiss of ONE held change
// (never one held on another computer).
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { api } from './api';
import { CHANGE_STORE_KEY, SENDING_STALE_MS, type StoredChange } from './change-store';
import * as C from './changes';
import { capture, snapshot } from './ctx';
import { useLockedChange, type LockedChange } from './locked';
import { prefix, queryClient } from './query';
import { defineRoute } from './routes';
import { boot, calls, onFetch, settle, microFlush } from './test/env';

const list = defineRoute<{ data: string[] }>({ method: 'GET', path: '/computers', scope: 'realm' });
const rename = defineRoute<unknown, { name: string }>({ method: 'PATCH', path: '/computers/:id', scope: 'realm', body: ['name'] });
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }
const KEY = (): readonly unknown[] => [...prefix(snapshot()), 'test', 'list'];
const isList = (k: readonly unknown[]): boolean => k[4] === 'test' && k[5] === 'list';

// One lock per computer (as Files' filesLockKey); the identity names the computer and the send's own op.
interface V { computer: string; op: string }
const send = (v: V) => api(rename, { params: { id: v.computer }, body: { name: v.op }, ctx: capture() });
const idOf = (v: V) => ({ computer: v.computer, op: v.op });

function harness(): { mine: () => LockedChange<V, unknown>; other: () => LockedChange<V, unknown> } {
  let mine!: LockedChange<V, unknown>, other!: LockedChange<V, unknown>;
  function Probe() {
    useQuery({ queryKey: KEY(), queryFn: () => api(list, { ctx: capture() }), retry: false });
    mine = useLockedChange(send, [isList], 'test.one.mine', { lock: 'test.one.shared', lockKey: (v) => ({ computer: v.computer }), identity: idOf });
    other = useLockedChange(send, [isList], 'test.one.other', { lock: 'test.one.shared', lockKey: (v) => ({ computer: v.computer }), identity: idOf });
    return null;
  }
  render(<Probe />, { wrapper: wrap });
  return { mine: () => mine, other: () => other };
}

describe('useLockedChange dismissOne(identity)', () => {
  it('frees only the held change with that identity: the same sender\'s change held on another computer stays', async () => {
    boot();
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    const h = harness();
    await act(flush);
    await act(async () => { await h.mine().run({ computer: 'atlas', op: 'o1' }); await flush(); });
    await act(async () => { await h.mine().run({ computer: 'boreas', op: 'o2' }); await flush(); });
    expect(h.mine().state).toBe('pending');
    let ok = false;
    await act(async () => { ok = await h.mine().dismissOne({ computer: 'atlas', op: 'o1' }); await microFlush(); });
    expect(ok).toBe(true);
    // atlas is free (a send goes), boreas still held (refused, nothing sent).
    const before = calls.filter((c) => c.method === 'PATCH').length;
    let r = await h.mine().run({ computer: 'boreas', op: 'o3' });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    await act(async () => { r = await h.mine().run({ computer: 'atlas', op: 'o1' }); await flush(); });
    expect(calls.filter((c) => c.method === 'PATCH').length).toBe(before + 1);
  });

  it('the same identity is freed exactly once: a second dismissOne finds nothing and says so', async () => {
    boot();
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    const h = harness();
    await act(flush);
    await act(async () => { await h.mine().run({ computer: 'atlas', op: 'o1' }); await flush(); });
    let first = false, second = true;
    await act(async () => { [first, second] = await Promise.all([h.mine().dismissOne({ computer: 'atlas', op: 'o1' }), h.mine().dismissOne({ computer: 'atlas', op: 'o1' })]); await microFlush(); });
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(h.mine().state).toBe('free');
    let again = true;
    await act(async () => { again = await h.mine().dismissOne({ computer: 'atlas', op: 'o1' }); await microFlush(); });
    expect(again).toBe(false);
  });

  it('an unknown identity, or one of another op on the same computer, is a no-op: the hold stays', async () => {
    boot();
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    const h = harness();
    await act(flush);
    await act(async () => { await h.mine().run({ computer: 'atlas', op: 'o1' }); await flush(); });
    for (const id of [{ computer: 'atlas', op: 'o9' }, { computer: 'nowhere', op: 'o1' }, { computer: 'atlas' }, null, undefined, 'atlas']) {
      let ok = true;
      await act(async () => { ok = await h.mine().dismissOne(id); await microFlush(); });
      expect(ok).toBe(false);
      expect(h.mine().state).toBe('pending');
    }
  });

  it('never another page\'s held change sharing the lock, even with its identity', async () => {
    boot();
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    const h = harness();
    await act(flush);
    await act(async () => { await h.other().run({ computer: 'atlas', op: 'o1' }); await flush(); });
    let ok = true;
    await act(async () => { ok = await h.mine().dismissOne({ computer: 'atlas', op: 'o1' }); await microFlush(); });
    expect(ok).toBe(false);
    expect(h.other().state).toBe('pending');
    await act(async () => { ok = await h.other().dismissOne({ computer: 'atlas', op: 'o1' }); await microFlush(); });
    expect(ok).toBe(true);
    expect(h.other().state).toBe('free');
  });

  it('the key stays, as with dismiss(): the same change sent again replays it', async () => {
    boot();
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    const keys: string[] = [];
    let mine!: LockedChange<V, unknown>;
    function Probe() {
      useQuery({ queryKey: KEY(), queryFn: () => api(list, { ctx: capture() }), retry: false });
      mine = useLockedChange((v: V, idem: string) => { keys.push(idem); return send(v); }, [isList], 'test.one.key', { lock: 'test.one.keyed', lockKey: (v) => ({ computer: v.computer }), identity: idOf });
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    await act(async () => { await mine.run({ computer: 'atlas', op: 'o1' }); await flush(); });
    await act(async () => { await mine.dismissOne({ computer: 'atlas', op: 'o1' }); await microFlush(); });
    await act(async () => { await mine.run({ computer: 'atlas', op: 'o1' }); await flush(); });
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('a held change that records no identity is never matched, not even by no identity', async () => {
    boot();
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    let mine!: LockedChange<V, unknown>;
    function Probe() {
      useQuery({ queryKey: KEY(), queryFn: () => api(list, { ctx: capture() }), retry: false });
      mine = useLockedChange(send, [isList], 'test.one.none', { lock: 'test.one.none', lockKey: (v) => ({ computer: v.computer }), identity: () => undefined });
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    await act(async () => { await mine.run({ computer: 'atlas', op: 'o1' }); await flush(); });
    expect(mine.state).toBe('pending');
    let ok = true;
    await act(async () => { ok = await mine.dismissOne(undefined); await microFlush(); });
    expect(ok).toBe(false);
    expect(mine.state).toBe('pending');
  });

  it('it is the person\'s warned Dismiss: it frees even over a send stamp another tab renewed (a plain free would not)', async () => {
    boot();
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    const raw = (): StoredChange[] => JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as StoredChange[];
    const put = (l: StoredChange[]) => localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(l));
    let mine!: LockedChange<V, unknown>;
    const mount = () => {
      function Probe() {
        useQuery({ queryKey: KEY(), queryFn: () => api(list, { ctx: capture() }), retry: false });
        mine = useLockedChange(send, [isList], 'test.one.warned', { lock: 'test.one.warned', lockKey: (v) => ({ computer: v.computer }), identity: idOf });
        return null;
      }
      render(<Probe />, { wrapper: wrap });
    };
    mount();
    await act(flush);
    await act(async () => { await mine.run({ computer: 'atlas', op: 'o1' }); await flush(); });
    // Another tab's send of it, whose stamp went stale: this tab reloads and adopts it as held.
    put(raw().map((r) => ({ ...r, sending: { tab: 'other-tab', at: Date.now() - SENDING_STALE_MS - 1000 } })));
    C.reloadChangesForTests();
    cleanup();
    mount();
    await act(flush);
    expect(mine.state).toBe('pending');
    // That tab renews its stamp (its heartbeat) before this tab hears of it.
    put(raw().map((r) => ({ ...r, sending: { tab: 'other-tab', at: Date.now() }, t: r.t + 1 })));
    let ok = false;
    await act(async () => { ok = await mine.dismissOne({ computer: 'atlas', op: 'o1' }); await flush(); });
    expect(ok).toBe(true);
    expect(raw().every((r) => r.sending === undefined)).toBe(true);
  });

  it('only.hold: frees only while the hold is still that shown send; a stale token frees nothing and the hold stays', async () => {
    boot();
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    const h = harness();
    await act(flush);
    await act(async () => { await h.mine().run({ computer: 'atlas', op: 'o1' }); await flush(); });
    const shown = C.heldChanges('test.one.shared').find((x) => (x.identity as V).computer === 'atlas')!.hold;
    expect(typeof shown).toBe('string');
    let ok = true;
    await act(async () => { ok = await h.mine().dismissOne({ computer: 'atlas', op: 'o1' }, { hold: `${shown}-not-this-send` }); await microFlush(); });
    expect(ok).toBe(false);
    expect(h.mine().state).toBe('pending');
    const transition = { own: false };
    await act(async () => { ok = await h.mine().dismissOne({ computer: 'atlas', op: 'o1' }, { hold: shown, transition }); await microFlush(); });
    expect(ok).toBe(true);
    expect(transition.own).toBe(true);
    expect(h.mine().state).toBe('free');
  });

  it('only.transition: a second free of a hold already freed says so (own stays false)', async () => {
    boot();
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    const h = harness();
    await act(flush);
    await act(async () => { await h.mine().run({ computer: 'atlas', op: 'o1' }); await flush(); });
    const a = { own: false }, b = { own: false };
    await act(async () => { await Promise.all([h.mine().dismissOne({ computer: 'atlas', op: 'o1' }, { transition: a }), h.mine().dismissOne({ computer: 'atlas', op: 'o1' }, { transition: b })]); await microFlush(); });
    expect([a.own, b.own].filter(Boolean)).toHaveLength(1);
  });
});
