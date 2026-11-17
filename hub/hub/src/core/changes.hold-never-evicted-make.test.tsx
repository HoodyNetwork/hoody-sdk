// Held changes are never evicted (HOLDS_FULL / TOO_LARGE), a hold with no sender is nobody's to
// prove, a mount frees by proof only its own unchanged send, and a locked change's sender names its page.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANGE_STORE_KEY, SENDING_STALE_MS, readChanges, setChangeStoreAdapter, writeChanges } from './change-store';
import * as C from './changes';
import { bump, resetCore } from './ctx';

import { useLockedChange } from './locked';
import { defineMutation, defineQuery, freeByVerdict, queryClient } from './query';
import { defineRoute } from './routes';
import { api } from './api';
import { capture } from './ctx';
import { boot, onFetch, R1, microFlush } from './test/env';
import { installTransport, reply, startFixtureMode, type FixtureRule } from './transport';

const { guarded, isPending } = C;
const reload = (): void => C.reloadChangesForTests();
// A lockKey definition's press always names an identity (a record of a lockKey base without one is an
// older build's, migrated); this file also defines lockKey changes of computer.lifecycle.
const META = { base: 'lock:computer.lifecycle', target: null, realm: R1, by: 'q:lifecycle@computer.lifecycle/computers', identity: null };
const pendingWith = (idem: string) => async (replay: string | undefined) => ({ outcome: 'pending' as const, idem: replay ?? idem });

describe('a hold is never evicted to make room', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  it('at the cap a new hold is refused HOLDS_FULL and nothing is sent; every existing hold stays, after a reload too', async () => {
    for (let i = 0; i < 64; i++) expect((await guarded('s', 'd' + i, pendingWith('K' + i), META)).outcome).toBe('pending');
    const send = vi.fn(pendingWith('K64'));
    expect(await guarded('s', 'd64', send, META)).toEqual({ outcome: 'not_sent', code: 'HOLDS_FULL' });
    expect(send).not.toHaveBeenCalled();
    expect(readChanges()).toHaveLength(64);
    reload();
    for (let i = 0; i < 64; i++) expect(isPending('s', 'd' + i)).toBe(true);
    expect(isPending('s', 'd64')).toBe(false);
    // Freeing one makes room again.
    await C.complete('s', 'd0', C.holdOfLock('s', 'd0')!);
    const again = vi.fn(pendingWith('K64'));
    expect((await guarded('s', 'd64', again, META)).outcome).toBe('pending');
    expect(again).toHaveBeenCalledTimes(1);
  });
  it('a change whose record is too large to store is refused TOO_LARGE, nothing sent, the lock left as it was', async () => {
    const send = vi.fn(pendingWith('K'));
    const big = { ...META, identity: { text: 'x'.repeat(9000) } };
    expect(await guarded('s', 'big', send, big)).toEqual({ outcome: 'not_sent', code: 'TOO_LARGE' });
    expect(send).not.toHaveBeenCalled();
    expect(isPending('s', 'big')).toBe(false);
    expect(C.senderOfLock('s', 'big')).toBe(undefined);
  });
  it('heldChanges says whether a hold is stored (persisted) or held in this tab only', async () => {
    await guarded('s', 'd', pendingWith('K'), META);
    expect(C.heldChanges('computer.lifecycle')).toEqual([expect.objectContaining({ persisted: true })]);
  });
});

describe('a hold that records no sender', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  it('no read-back proof frees it (applied or not), and a warned Dismiss (discard) still can', async () => {
    const { by: _by, ...noSender } = META;
    void _by;
    expect((await guarded('s', 'd', pendingWith('K'), noSender)).outcome).toBe('pending');
    const h = C.holdOfLock('s', 'd');
    expect(await freeByVerdict('s', 'd', h, Infinity, 'applied', META.by)).toBe(false);
    expect(await freeByVerdict('s', 'd', h, Infinity, 'not_applied', META.by)).toBe(false);
    expect(isPending('s', 'd')).toBe(true);
    expect(C.foreignLock('s', 'd', META.by)).toBe(true);
    // Never named as another sender's: the page offers its warned Dismiss, and that frees it.
    expect(C.heldByOther('s', 'd', META.by)).toBe(null);
    await C.discard('s', 'd', h!);
    expect(isPending('s', 'd')).toBe(false);
  });
});

describe('a mount frees by proof only its own send, while no later send moved it', () => {
  const start = defineRoute<{ ok: boolean }>({ method: 'POST', path: '/computers/:id/start', scope: 'realm', body: [] });
  const list = defineRoute<{ data: string[] }>({ method: 'GET', path: '/computers', scope: 'realm' });
  const containers = defineQuery(list, { select: (r) => r.data });
  const startOne = defineMutation<{ id: string }>(start, { input: (v) => ({ params: { id: v.id } }), reads: [containers] });
  const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  function mode(rules: readonly FixtureRule[]) {
    resetCore();
    startFixtureMode(rules, { realm: 'aaaaaaaaaaaaaaaaaaaaaaa1', target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } } });
    queryClient.clear();
  }
  beforeEach(() => { bump('test-boot'); });
  afterEach(() => { cleanup(); installTransport(null); });

  it('mount A settles its change; mount B sends it again; A\'s await complete() never frees B\'s send', async () => {
    mode([reply(list, { body: { data: [] } }), reply(start, { status: 502, body: {} })]);
    const a = renderHook(() => startOne.use({ page: 'computers' }), { wrapper: wrap });
    await act(async () => { await a.result.current.run({ id: 'c1' }); });
    expect(a.result.current.outcome).toBe('pending');
    await act(async () => { a.result.current.settle(); await microFlush(); });
    const b = renderHook(() => startOne.use({ page: 'computers' }), { wrapper: wrap });
    await act(async () => { expect((await b.result.current.run({ id: 'c1' })).outcome).toBe('pending'); });
    // A's history names the same identity, but its send token is gone: proven-applied from A frees nothing.
    await act(async () => { a.result.current.complete(); await microFlush(); });
    expect(await startOne.isPending({ id: 'c1' })).toBe(true);
    await act(async () => { a.result.current.discard(); await microFlush(); });
    expect(await startOne.isPending({ id: 'c1' })).toBe(true);
    // B's own complete() does.
    await act(async () => { b.result.current.complete(); await microFlush(); });
    expect(await startOne.isPending({ id: 'c1' })).toBe(false);
  });
  it('a definition\'s sender is its route, lock and name, never its load order', async () => {
    mode([reply(list, { body: { data: [] } }), reply(start, { status: 502, body: {} })]);
    const second = defineMutation<{ id: string }>(start, { input: (v) => ({ params: { id: v.id } }), lock: 'fix3.order', name: 'second' });
    const first = defineMutation<{ id: string }>(start, { input: (v) => ({ params: { id: v.id } }), lock: 'fix3.order', name: 'first' });
    expect((await first.run({ id: 'c1' })).outcome).toBe('pending');
    const [h] = C.heldChanges('fix3.order');
    expect(h!.by).toMatch(/@fix3\.order:first$/);
    expect(first.heldBy(h!)).toBe('self');
    expect(second.heldBy(h!)).toBe('other');
  });
});

describe('a locked change records its page as the sender', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  afterEach(() => { cleanup(); });
  it('l:<page>:<id>: the same id on two pages is two senders; after a reload the hold is still its own', async () => {
    const rename = defineRoute<unknown, { name: string }>({ method: 'PATCH', path: '/computers/:id', scope: 'realm', body: ['name'] });
    onFetch(() => ({ status: 502, body: {} }));
    const run = (v: { code: string }) => api(rename, { params: { id: 'c1' }, body: { name: v.code }, ctx: capture() });
    const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const home = renderHook(() => useLockedChange<{ code: string }, unknown>(run, [], 'computers.redeem', { lock: 'computers.redeem', page: 'home' }), { wrapper: wrap });
    const comp = renderHook(() => useLockedChange<{ code: string }, unknown>(run, [], 'computers.redeem', { lock: 'computers.redeem', page: 'computers' }), { wrapper: wrap });
    await act(async () => { expect((await home.result.current.run({ code: 'A' })).outcome).toBe('pending'); });
    expect(C.heldChanges('computers.redeem')).toEqual([expect.objectContaining({ by: 'l:home:computers.redeem' })]);
    expect(home.result.current.heldBy).toBe('self');
    expect(comp.result.current.heldBy).toBe('other');
    await act(async () => { comp.result.current.dismiss(); await microFlush(); });
    expect(C.heldChanges('computers.redeem')).toHaveLength(1);
    home.unmount(); comp.unmount();
    act(() => { reload(); });
    const after = renderHook(() => useLockedChange<{ code: string }, unknown>(run, [], 'computers.redeem', { lock: 'computers.redeem', page: 'home' }), { wrapper: wrap });
    expect(after.result.current.heldBy).toBe('self');
    await act(async () => { after.result.current.dismiss(); await microFlush(); });
    expect(C.heldChanges('computers.redeem')).toHaveLength(0);
  });
});

const announce = () => window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
const held = () => { let open: (v: { outcome: 'pending'; idem: string }) => void = () => {}; const p = new Promise<{ outcome: 'pending'; idem: string }>((r) => { open = r; }); return { send: vi.fn((_k: string | undefined) => p), open }; };

describe('nothing is sent without a stored hold', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  afterEach(() => { setChangeStoreAdapter(null); });
  it('a refused write: STORE_UNAVAILABLE, nothing sent, the lock left free', async () => {
    setChangeStoreAdapter({ read: () => localStorage.getItem(CHANGE_STORE_KEY), write: () => false });
    const send = vi.fn(pendingWith('K'));
    expect(await guarded('s', 'd', send, META)).toEqual({ outcome: 'not_sent', code: 'STORE_UNAVAILABLE' });
    expect(send).not.toHaveBeenCalled();
    expect(isPending('s', 'd')).toBe(false);
    expect(C.isBusy('s', 'd')).toBe(false);
  });
  it('storage that cannot be read: STORE_UNAVAILABLE, nothing sent (memory never decides alone)', async () => {
    setChangeStoreAdapter({ read() { throw new Error('blocked'); }, write: () => true });
    const send = vi.fn(pendingWith('K'));
    expect(await guarded('s', 'd', send, META)).toEqual({ outcome: 'not_sent', code: 'STORE_UNAVAILABLE' });
    expect(send).not.toHaveBeenCalled();
  });
  it('a corrupt store proves no absence: a held change stays held, and a new press is refused until a clean read', async () => {
    expect((await guarded('s', 'd', pendingWith('K'), META)).outcome).toBe('pending');
    const list = JSON.parse(localStorage.getItem(CHANGE_STORE_KEY)!) as unknown[];
    // Another build's record this one cannot validate, and the hold's own record lost with it.
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([{ id: 'x', pending: 'yes', t: 1 }]));
    announce();
    expect(isPending('s', 'd')).toBe(true);
    const send = vi.fn(pendingWith('K2'));
    expect(await guarded('s', 'other', send, META)).toEqual({ outcome: 'not_sent', code: 'STORE_UNAVAILABLE' });
    expect(send).not.toHaveBeenCalled();
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list));
    announce();
    expect((await guarded('s', 'other', send, META)).outcome).toBe('pending');
  });
});

describe('the first key is stored with the hold before the send leaves', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  it('the admission record carries the key the send uses; a reload mid-send keeps it for the receipt', async () => {
    const a = held();
    void guarded('s', 'd', a.send, META, undefined, 'FIRST');
    for (let i = 0; i < 20 && !a.send.mock.calls.length; i++) await Promise.resolve(); // the store lock is granted asynchronously
    expect(a.send).toHaveBeenCalledWith('FIRST');
    expect(readChanges()![0]).toEqual(expect.objectContaining({ key: 'FIRST', sending: expect.anything(), inc: expect.any(String) }));
    reload();
    expect(C.heldChanges('computer.lifecycle')).toEqual([]);
    expect(readChanges()![0]!.key).toBe('FIRST');
  });
  it('a first send that fails is failed, not a replay; a refusal before the request drops the minted key', async () => {
    expect((await guarded('s', 'd', async () => ({ outcome: 'failed' as const }), META, undefined, 'K1')).outcome).toBe('failed');
    expect(C.senderOfLock('s', 'd')).toBe(undefined);
    expect((await guarded('s', 'd', async () => ({ outcome: 'stale' as const }), META, undefined, 'K2')).outcome).toBe('stale');
    expect(readChanges()).toEqual([]);
  });
});

describe('a hold\'s incarnation', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  it('a read-back that began on hold 1 never frees hold 2 of the same change adopted from another tab (complete or release)', async () => {
    expect((await guarded('s', 'd', pendingWith('K1'), META)).outcome).toBe('pending');
    reload(); // tab B
    const mark = C.pendingMark(), h1 = C.holdOfLock('s', 'd')!;
    // Tab A proved hold 1 and sent the change again: hold 2, another incarnation, both writes seen at once here.
    const r1 = readChanges()![0]!;
    writeChanges([{ ...r1, inc: 'hold-2', key: 'K2', t: r1.t + 10 }]);
    announce();
    expect(isPending('s', 'd')).toBe(true);
    expect(await C.complete('s', 'd', h1,{ upTo: mark })).toBe(false);
    expect(isPending('s', 'd')).toBe(true);
    expect(await C.release('s', 'd', h1,{ upTo: mark })).toBe(false);
    expect(isPending('s', 'd')).toBe(true);
  });
  it('a late pending answer of a dismissed hold never overwrites the later hold of the same change', async () => {
    const a = held();
    const first = guarded('s', 'd', a.send, META);
    await Promise.resolve();
    // Meanwhile (this tab suspended, its stamp stale) another tab dismissed it and sent the change again.
    const r1 = readChanges()![0]!;
    const { sending: _s, ...rest } = r1;
    void _s;
    writeChanges([{ ...rest, pending: true, inc: 'hold-2', key: 'K2', t: r1.t + 10 }]);
    a.open({ outcome: 'pending', idem: 'K1' });
    await first;
    expect(readChanges()![0]).toEqual(expect.objectContaining({ inc: 'hold-2', key: 'K2' }));
  });
});

describe('an unrelated write keeps the dead-tab timer', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  afterEach(() => { vi.useRealTimers(); });
  it('another tab\'s stamp goes stale on time even after an unrelated storage event, without a press', async () => {
    vi.useFakeTimers({ now: 10_000, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const a = held();
    void guarded('s', 'd', a.send, META);
    await Promise.resolve();
    reload(); // tab B sees A's live stamp
    expect(C.isBusy('s', 'd')).toBe(true);
    // An unrelated write (a third tab's change) and its event.
    writeChanges([...readChanges()!, { id: 'unrelated', pending: false, key: null, t: 1 }]);
    announce();
    vi.advanceTimersByTime(SENDING_STALE_MS + 100);
    expect(isPending('s', 'd')).toBe(true);
  });
});
