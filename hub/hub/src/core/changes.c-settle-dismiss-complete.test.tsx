// Every free names its hold, an account switch while hashing
// frees nothing, and admission refuses without cross-tab coordination.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as C from './changes';
import { bump, setIdentity, setRealm, snapshot } from './ctx';
import { readChanges } from './change-store';
import { computerLifecycle } from './power';
import { defineMutation } from './query';
import { defineRoute } from './routes';
import { boot, calls, onFetch, R1, R2 } from './test/env';

const posts = (): number => calls.filter((c) => c.method === 'POST').length;
const switchTo = (r: string): void => { setRealm(r); bump('switch'); };
const META = { base: 'lock:case-c.raw', target: null, realm: R1, by: 'q:case-c@case-c.raw' };
const pendingWith = (idem: string) => async (replay: string | undefined) => ({ outcome: 'pending' as const, idem: replay ?? idem });
type Loose<V> = (vars: V, hold?: string) => Promise<boolean>;

describe('settle, dismiss, complete and discard require the hold', () => {
  beforeEach(() => { boot({ realm: R1 }); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  const route = defineRoute({ method: 'POST', path: '/case-c/press', scope: 'realm', body: ['n'] });
  const press = defineMutation<{ n: number }>(route, { input: (v) => ({ body: { n: v.n } }), lock: 'case-c.press', lockKey: (v) => ({ n: v.n }), page: 'programs' });
  it('a call without a hold (an old caller) frees nothing and answers false; with the run\'s hold it frees', async () => {
    const sent = await press.run({ n: 1 });
    expect(sent.outcome).toBe('pending');
    for (const f of [press.settle, press.dismiss, press.complete, press.discard] as Array<Loose<{ n: number }>>) {
      expect(await f({ n: 1 })).toBe(false);
      expect(await f({ n: 1 }, '')).toBe(false);
    }
    expect(await press.isPending({ n: 1 })).toBe(true);
    expect(await press.dismiss({ n: 1 }, sent.hold!)).toBe(true);
    expect(await press.isPending({ n: 1 })).toBe(false);
  });
  it('stale recovery: an earlier send\'s hold never frees the newer send of the same change', async () => {
    const first = (await press.run({ n: 1 })).hold!;
    expect(await press.settle({ n: 1 }, first)).toBe(true);
    const second = (await press.run({ n: 1 })).hold!;
    expect(second).not.toBe(first);
    expect(await press.settle({ n: 1 }, first)).toBe(false);
    expect(await press.complete({ n: 1 }, first)).toBe(false);
    expect(await press.discard({ n: 1 }, first)).toBe(false);
    expect(await press.isPending({ n: 1 })).toBe(true);
    expect(await press.complete({ n: 1 }, second)).toBe(true);
  });
  it('the registry: release, complete and discard act only on the named send', async () => {
    expect((await C.guarded('s', 'd', pendingWith('K1'), META)).outcome).toBe('pending');
    const h = C.holdOfLock('s', 'd')!;
    expect(await C.release('s', 'd', 'other#1')).toBe(false);
    expect(await C.complete('s', 'd', 'other#1')).toBe(false);
    expect(await C.discard('s', 'd', 'other#1')).toBe(false);
    expect(C.isPending('s', 'd')).toBe(true);
    expect(await C.release('s', 'd', h)).toBe(true);
    expect(await C.release('s', 'd', h)).toBe(false);
  });
});

describe('an account switch while hashing frees nothing and names no other account\'s hold', () => {
  beforeEach(() => { boot({ realm: R1 }); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  const route = defineRoute({ method: 'POST', path: '/case-c/acct', scope: 'base', body: ['n'] });
  const m = defineMutation<{ n: number }>(route, { input: (v) => ({ body: { n: v.n } }), lock: 'case-c.acct', lockKey: (v) => ({ n: v.n }), page: 'programs' });
  it('holdOf asked in account A, answered after a switch to B (holding the same change): undefined, so B\'s hold is never dismissed for A', async () => {
    const a = String(snapshot().account);
    const as = (id: string): void => { setIdentity({ id, banned: false }); bump('account'); };
    const aHold = (await m.run({ n: 1 })).hold!;
    const ai = C.heldInstance('lock:case-c.acct', aHold)!;
    as('someone-else');
    // Account B holds the same change (same scope and digest, the same page's sender).
    await C.guarded(ai.scope, ai.digest, pendingWith('KB'), { base: 'lock:case-c.acct', target: null, realm: ai.realm, by: ai.by! });
    const bHold = C.holdOfLock(ai.scope, ai.digest)!;
    expect(bHold).toBeTruthy();
    as(a);
    const asked = m.holdOf({ n: 1 });
    as('someone-else');
    expect(await asked).toBe(undefined);
    // A dismiss started in A with A's hold, the account switched to B while hashing: nothing freed, B's hold stays.
    as(a);
    const going = m.dismiss({ n: 1 }, aHold);
    as('someone-else');
    expect(await going).toBe(false);
    // Each account keeps its own hold (its incarnation; the send count moves when a hold is adopted again).
    const inc = (h: string | undefined): string | undefined => h?.split('#')[0];
    expect(C.heldChanges('case-c.acct').map((h) => inc(h.hold))).toEqual([inc(bHold)]);
    as(a);
    expect(C.heldChanges('case-c.acct').map((h) => inc(h.hold))).toEqual([inc(aHold)]);
    expect(inc(aHold)).not.toBe(inc(bHold));
    expect(posts()).toBe(1);
  });
});

describe('an across-realms hold is the same change in every realm view', () => {
  beforeEach(() => { boot({ realm: 'all' }); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  it('sent from All realms, dismissed with its token from a specific realm; another page sees it held there first', async () => {
    const sent = await computerLifecycle.forPage('board').run({ id: 'c1', op: 'start' });
    expect(sent.outcome).toBe('pending');
    switchTo(R2);
    expect(await computerLifecycle.forPage('computers').heldByOther({ id: 'c1', op: 'start' })).toMatchObject({ code: 'HELD_BY_OTHER' });
    expect(await computerLifecycle.forPage('board').dismiss({ id: 'c1', op: 'start' }, sent.hold!)).toBe(true);
    expect(C.heldChanges('computer.lifecycle')).toEqual([]);
  });
});

describe('admission refuses unsent without cross-tab coordination', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it('no navigator.locks: NO_COORDINATION, nothing sent, nothing stored', async () => {
    vi.stubGlobal('navigator', {});
    const send = vi.fn(pendingWith('K'));
    expect(await C.guarded('s', 'd', send, META)).toEqual({ outcome: 'not_sent', code: 'NO_COORDINATION' });
    expect(send).not.toHaveBeenCalled();
    expect(C.isPending('s', 'd')).toBe(false);
    expect(readChanges() ?? []).toEqual([]);
  });
  it('a lock request that throws (or rejects): NO_COORDINATION, nothing sent', async () => {
    const send = vi.fn(pendingWith('K'));
    vi.stubGlobal('navigator', { locks: { request: () => { throw new Error('SecurityError'); } } });
    expect(await C.guarded('s', 'd', send, META)).toEqual({ outcome: 'not_sent', code: 'NO_COORDINATION' });
    vi.stubGlobal('navigator', { locks: { request: () => Promise.reject(new Error('AbortError')) } });
    expect(await C.guarded('s', 'd', send, META)).toEqual({ outcome: 'not_sent', code: 'NO_COORDINATION' });
    expect(send).not.toHaveBeenCalled();
    expect(C.isPending('s', 'd')).toBe(false);
  });
  it('a page run answers not_sent with the code, and the Board-style run sends nothing', async () => {
    vi.stubGlobal('navigator', {});
    onFetch(() => ({ status: 502, body: {} }));
    const res = await computerLifecycle.forPage('computers').run({ id: 'c1', op: 'start' });
    expect(res.outcome).toBe('not_sent');
    expect(res.error?.code).toBe('NO_COORDINATION');
    expect(posts()).toBe(0);
  });
});
