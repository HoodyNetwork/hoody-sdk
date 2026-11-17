// Held changes across a reload and across tabs (changes.ts over change-store.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SENDING_HEARTBEAT_MS, SENDING_STALE_MS, readChanges, writeChanges, CHANGE_STORE_KEY } from './change-store';
import * as C from './changes';
import { bump } from './ctx';
import { boot, R1 } from './test/env';

const { guarded, isBusy, isPending, release, complete } = C;
// Old code has no reload seam: dropping memory is what a reload did there.
const reload = (): void => { const c = C as unknown as { reloadChangesForTests?: () => void }; (c.reloadChangesForTests ?? C.resetChanges)(); };
const META = { base: 'lock:computer.lifecycle', target: { project: { id: 'p1' }, container: { id: 'c1' } }, realm: R1, identity: { computer: 'c1' }, by: 'q:lifecycle@computer.lifecycle' };
const pendingWith = (idem: string) => async (replay: string | undefined) => ({ outcome: 'pending' as const, idem: replay ?? idem });
// Every held send is answered after its test: a request still out is BUSY in its tab across a boot (sendsOut is
// per tab, not per account), so a send a test leaves out would refuse the next test's press.
const outs: Array<() => void> = [];
const held = () => { let open: (v: { outcome: 'pending'; idem: string }) => void = () => {}; const p = new Promise<{ outcome: 'pending'; idem: string }>((r) => { open = r; }); outs.push(() => open({ outcome: 'pending', idem: 'K-after' })); return { send: vi.fn(() => p), open }; };
const announce = () => window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));

beforeEach(() => { boot({ realm: R1 }); });
afterEach(async () => { vi.useRealTimers(); for (const o of outs.splice(0)) o(); for (let i = 0; i < 50; i++) await Promise.resolve(); });

describe('cross-tab holds: a reload keeps the hold', () => {
  it('reload keeps the hold and the next press is refused (READ_BACK_FIRST), nothing sent; its key is kept for the replay', async () => {
    expect((await guarded('s', 'd', pendingWith('K1'), META)).outcome).toBe('pending');
    reload();
    expect(isPending('s', 'd')).toBe(true);
    const send = vi.fn(pendingWith('K2'));
    expect(await guarded('s', 'd', send, META)).toEqual({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(send).not.toHaveBeenCalled();
    expect(C.heldChanges('computer.lifecycle')).toEqual([expect.objectContaining({ key: 'K1', identity: { computer: 'c1' }, realm: R1 })]);
    expect(C.senderOfLock('s', 'd')).toBe(META.by);
    await release('s', 'd', C.holdOfLock('s', 'd')!);
    const seen: Array<string | undefined> = [];
    await guarded('s', 'd', async (k) => { seen.push(k); return { outcome: 'done' as const }; }, META);
    expect(seen).toEqual(['K1']);
    reload();
    expect(readChanges()).toEqual([]);
    expect(isPending('s', 'd')).toBe(false);
  });
  it('a reload in the middle of a send: the send may have gone through once its stamp goes stale (no heartbeat any more)', async () => {
    vi.useFakeTimers({ now: 10_000, toFake: ['Date'] });
    const a = held();
    void guarded('s', 'd', a.send, META);
    for (let i = 0; i < 20 && !a.send.mock.calls.length; i++) await Promise.resolve(); // the store lock is granted asynchronously
    expect(a.send).toHaveBeenCalledTimes(1);
    reload(); // the tab that sent is gone; this is the reloaded page
    expect(isBusy('s', 'd')).toBe(true);
    vi.setSystemTime(10_000 + SENDING_STALE_MS + 1);
    const send = vi.fn(pendingWith('K2'));
    expect(await guarded('s', 'd', send, META)).toEqual({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(isPending('s', 'd')).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('cross-tab holds: two tabs, one send', () => {
  it('two tabs, one send: while tab A\'s send is out, tab B\'s press of the same change is BUSY and sends nothing', async () => {
    const a = held();
    const first = guarded('s', 'd', a.send, META);
    await Promise.resolve();
    reload(); // tab B, on the same storage
    const b = vi.fn(pendingWith('KB'));
    expect(await guarded('s', 'd', b, META)).toEqual({ outcome: 'not_sent', code: 'BUSY' });
    expect(b).not.toHaveBeenCalled();
    a.open({ outcome: 'pending', idem: 'KA' });
    await first;
    // A's outcome lands in storage; B merges it on the storage event: held, A's key kept.
    announce();
    expect(isBusy('s', 'd')).toBe(false);
    expect(isPending('s', 'd')).toBe(true);
    expect(await guarded('s', 'd', b, META)).toEqual({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(C.heldChanges('computer.lifecycle')[0]!.key).toBe('KA');
  });
  it('a send held out past the stale window keeps its stamp fresh (heartbeat): the other tab still reads BUSY, never "may have gone through"', async () => {
    vi.useFakeTimers({ now: 50_000 });
    const a = held();
    void guarded('s', 'd', a.send, META);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(SENDING_STALE_MS + 2 * SENDING_HEARTBEAT_MS);
    const stamp = readChanges()!.find((r) => r.id.endsWith('s\u0000d'))!.sending!;
    expect(Date.now() - stamp.at).toBeLessThan(SENDING_STALE_MS);
    reload();
    expect(await guarded('s', 'd', vi.fn(pendingWith('KB')), META)).toEqual({ outcome: 'not_sent', code: 'BUSY' });
  });
  it('a release or a completion in another tab reaches this tab on the storage event', async () => {
    await guarded('s', 'd', pendingWith('K1'), META);
    const rec = readChanges()![0]!;
    writeChanges([{ ...rec, pending: false, t: rec.t + 1 }]); // tab B released it (key kept)
    announce();
    expect(isPending('s', 'd')).toBe(false);
    writeChanges([]); // tab B proved it applied: lock and key gone
    announce();
    const seen: Array<string | undefined> = [];
    await guarded('s', 'd', async (k) => { seen.push(k); return { outcome: 'done' as const }; }, META);
    expect(seen).toEqual([undefined]);
  });
  // The request's own record rewritten without its sending stamp is a hold
  // released while the request was out (a warned Dismiss, or a proof read in a tab that adopted a stale stamp). A late
  // 'pending' never makes it pending again; an earlier version of this test expected the opposite.
  it('a late pending outcome does not make a hold released meanwhile in another tab pending again', async () => {
    const a = held();
    const first = guarded('s', 'd', a.send, META);
    await Promise.resolve();
    const rec = readChanges()![0]!;
    writeChanges([{ ...rec, sending: undefined, pending: false, key: null, t: rec.t + 5 }]);
    a.open({ outcome: 'pending', idem: 'KA' });
    await first;
    await Promise.resolve();
    expect(readChanges()![0]).toMatchObject({ pending: false, key: null });
    // The sender's own lock follows that record, so no phantom hold refuses here.
    await vi.waitFor(() => expect(isPending('s', 'd')).toBe(false));
    expect(C.changeHoldRefs()).toEqual([]);
  });
  it('this tab\'s own lock rules hold for a change another tab is sending: complete and discard leave it alone', async () => {
    const a = held();
    void guarded('s', 'd', a.send, META);
    await Promise.resolve();
    reload();
    expect(await complete('s', 'd', C.holdOfLock('s', 'd')!)).toBe(false);
    expect(await C.discard('s', 'd', C.holdOfLock('s', 'd')!)).toBe(false);
    expect(isBusy('s', 'd')).toBe(true);
    expect(readChanges()![0]!.sending).toBeDefined();
  });
});

describe('cross-tab holds: accounts', () => {
  it('a sign-out drops the holds from memory; another account never sees them; the same account gets them back', async () => {
    await guarded('s', 'd', pendingWith('K1'), META);
    const stored = localStorage.getItem(CHANGE_STORE_KEY);
    boot({ realm: R1, identity: false });
    const { setIdentity } = await import('./ctx');
    setIdentity({ id: 'someone-else', banned: false });
    localStorage.setItem(CHANGE_STORE_KEY, stored!);
    bump('account');
    expect(isPending('s', 'd')).toBe(false);
    // The account change leaves the stored record alone (only its account loads it).
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(stored);
    boot({ realm: R1 });
    localStorage.setItem(CHANGE_STORE_KEY, stored!);
    reload();
    expect(isPending('s', 'd')).toBe(true);
  });
});

describe('cross-tab holds meet the shared-locks rule', () => {
  const FROM = { ...META, page: 'computers' };
  const OTHER = { ...META, by: 'q:lifecycle@computer.lifecycle:home-start/home', page: 'home' };
  it('after a reload another sender\'s stored hold answers HELD_BY_OTHER with the sending page, and heldChanges still names it', async () => {
    expect((await guarded('s', 'd', pendingWith('K1'), FROM)).outcome).toBe('pending');
    reload();
    const send = vi.fn(pendingWith('K2'));
    expect(await guarded('s', 'd', send, OTHER)).toEqual({ outcome: 'not_sent', code: 'HELD_BY_OTHER', heldFrom: { page: 'computers', path: '/computers' } });
    expect(send).not.toHaveBeenCalled();
    expect(C.heldChanges('computer.lifecycle')[0]!.from).toEqual({ page: 'computers', path: '/computers' });
    expect(C.refusalOf('s', 'd', OTHER.by)).toMatchObject({ code: 'HELD_BY_OTHER' });
    // Its own sender still reads READ_BACK_FIRST.
    expect(await guarded('s', 'd', send, FROM)).toEqual({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
  });
  it('another tab\'s live send by another sender: HELD_BY_OTHER (not BUSY), nothing sent', async () => {
    const a = held();
    const first = guarded('s', 'd', a.send, FROM);
    await Promise.resolve();
    reload(); // tab B, on the same storage
    const b = vi.fn(pendingWith('KB'));
    expect(await guarded('s', 'd', b, OTHER)).toEqual({ outcome: 'not_sent', code: 'HELD_BY_OTHER', heldFrom: { page: 'computers', path: '/computers' } });
    expect(b).not.toHaveBeenCalled();
    a.open({ outcome: 'pending', idem: 'KA' });
    await first;
  });
});
