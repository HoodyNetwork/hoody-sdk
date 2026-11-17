// A failed forget never
// writes anything back later (no resurrected hold). Its verdict is now 'done' | 'changed' | 'failed' | 'unknown'
// bound to the shown holds; 'unknown' drops from this tab's memory only the removed records and the
// shown holds (never a send still out or another lock of the account) while storage stays the authority for
// admission. A hook records only the hold its own pending answer carried, never a lock looked up after the await.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as C from './changes';
import { dropAttemptIds, heldAttempts, holdAttempt } from './attempts';
import { ATTEMPT_PREFIX, CHANGE_STORE_KEY, readChanges, setChangeStoreAdapter } from './change-store';
import { bump, setIdentity, snapshot } from './ctx';
import { defineMutation, queryClient, type MutationResult } from './query';
import { defineRoute } from './routes';
import { coreSource, type SourceMutation, type SourceResult } from './source';
import { boot, calls, onFetch, R1, settle, microFlush } from './test/env';

const META = { base: 'lock:case-e2.raw', target: null, realm: R1, by: 'q:case-e2@case-e2.raw' };
const pendingNoKey = async () => ({ outcome: 'pending' as const });
const pendingWith = (idem: string) => async (replay: string | undefined) => ({ outcome: 'pending' as const, idem: replay ?? idem });
const reload = (): void => C.reloadChangesForTests();
const announce = (): boolean => window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
type Rec = { id: string; pending: boolean; t: number; inc?: string; nonce?: string; key?: string | null };
const raw = (): Rec[] => JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Rec[];
const plainWrite = (t: string | null): boolean => { if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t); return true; };
const plainRead = (): string | null => localStorage.getItem(CHANGE_STORE_KEY);
const as = (id: string): void => { setIdentity({ id, banned: false }); bump('account'); };
const OTHER = 'someone-else';
/** The warned forget of the shown account, passing exactly the holds the warning shows. */
const forgetShown = () => C.forgetAccountChanges(String(snapshot().account), C.changeHoldRefs(), { holdsIn: () => [], drop: () => {} });

/** The removal lands, the read that should prove it fails, the rollback is refused: no verdict. */
function landsThenNoVerdict(): void {
  let writes = 0;
  setChangeStoreAdapter({ read: () => { if (writes > 0 && writes < 3) throw new Error('read failed'); return plainRead(); }, write: (t) => (++writes === 1 ? plainWrite(t) : (writes = 3, false)) });
}
/** The removal is reported stored but never lands (the read-back still holds the records), the rollback is refused. */
function neverLandsNoVerdict(): void {
  let writes = 0;
  setChangeStoreAdapter({ read: plainRead, write: () => (++writes === 1) });
}

describe('after an unknown forget nothing ever comes back', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  afterEach(() => { setChangeStoreAdapter(null); });
  const actions: Array<[string, () => void | Promise<void>]> = [
    ['complete', async () => { const h = C.holdOfLock('s', 'k'); if (h) await C.complete('s', 'k', h); }],
    ['discard', async () => { const h = C.holdOfLock('s', 'k'); if (h) await C.discard('s', 'k', h); }],
    ['release', async () => { const h = C.holdOfLock('s', 'k'); if (h) await C.release('s', 'k', h); }],
    // Another tab proves it (its own write of a list without the record) or forgets the account (an empty list).
    ['another tab\'s proof', () => { localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(raw().filter((r) => !r.id.endsWith('\u0000k')))); announce(); }],
    ['another tab\'s forget', () => { localStorage.setItem(CHANGE_STORE_KEY, '[]'); announce(); }],
  ];
  for (const [name, act] of actions) {
    it(`a keyless hold, an unknown forget, then ${name}: no clean read or reload shows it again`, async () => {
      await C.guarded('s', 'k', pendingNoKey, META);
      landsThenNoVerdict();
      expect(await forgetShown()).toBe('unknown');
      setChangeStoreAdapter(null);
      await act();
      for (let i = 0; i < 3; i++) { announce(); await settle(); }
      expect(raw()).toEqual([]);
      reload();
      expect(C.isPending('s', 'k')).toBe(false);
      expect(C.unresolvedChanges()).toBe(0);
      expect(raw()).toEqual([]);
    });
  }
});

describe('a rollback read back whole: failed, nothing forgotten', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  afterEach(() => { setChangeStoreAdapter(null); });
  it('tokens unchanged, still counted, and the same lock refuses a second send', async () => {
    await C.guarded('s', 'b', pendingWith('KB'), META);
    const hold = C.holdOfLock('s', 'b');
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    let wrote = false, failed = false;
    setChangeStoreAdapter({ read: () => { if (wrote && !failed) { failed = true; return '{not json'; } return plainRead(); }, write: (t) => { wrote = true; return plainWrite(t); } });
    expect(await forgetShown()).toBe('failed');
    setChangeStoreAdapter(null);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    expect(C.holdOfLock('s', 'b')).toBe(hold);
    expect(C.unresolvedChanges()).toBe(1);
    let sent = 0;
    expect(await C.guarded('s', 'b', async () => { sent++; return { outcome: 'done' as const }; }, META)).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(sent).toBe(0);
  });
});

describe('unknown drops this tab\'s holds; storage decides what comes back', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  afterEach(() => { setChangeStoreAdapter(null); });
  it('storage lacks them (the removal landed): memory zero, a fresh runtime zero, the lock is free', async () => {
    await C.guarded('s', 'c', pendingWith('KC'), META);
    landsThenNoVerdict();
    expect(await forgetShown()).toBe('unknown');
    setChangeStoreAdapter(null);
    expect(C.unresolvedChanges()).toBe(0);
    expect(C.isPending('s', 'c')).toBe(false);
    reload();
    expect(C.unresolvedChanges()).toBe(0);
  });
  it('storage still has them (the removal never landed): memory zero, then the next clean read and a fresh runtime show them; the same lock is refused', async () => {
    await C.guarded('s', 'c', pendingWith('KC'), META);
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    neverLandsNoVerdict();
    expect(await forgetShown()).toBe('unknown');
    setChangeStoreAdapter(null);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    expect(C.isPending('s', 'c')).toBe(false); // this tab's memory dropped it
    expect(C.unresolvedChanges()).toBe(1); // the warning reads storage, which still holds it
    let sent = 0;
    const press = () => C.guarded('s', 'c', async () => { sent++; return { outcome: 'done' as const }; }, META);
    expect(await press()).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' }); // admission reads storage
    announce();
    await settle();
    expect(C.unresolvedChanges()).toBe(1);
    reload();
    expect(C.unresolvedChanges()).toBe(1);
    expect(await press()).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(sent).toBe(0);
    // The next confirmed forget (the warning shows them again) finishes.
    expect(await forgetShown()).toBe('done');
    expect(raw()).toEqual([]);
  });
  it('a rollback written but not read back (the store stays unreadable): unknown, never failed', async () => {
    await C.guarded('s', 'c', pendingWith('KC'), META);
    let writes = 0;
    setChangeStoreAdapter({ read: () => { if (writes > 0) throw new Error('read failed'); return plainRead(); }, write: (t) => { writes++; return plainWrite(t); } });
    expect(await forgetShown()).toBe('unknown');
    expect(writes).toBe(2); // the removal and the rollback both reported stored, neither proven
    setChangeStoreAdapter(null);
    expect(C.isPending('s', 'c')).toBe(false); // this tab's memory dropped it
    expect(C.unresolvedChanges()).toBe(1); // the rollback did land: the warning's clean read shows it again
  });
  it('a send still out here keeps its lock (its answer persists); the rest leave memory', async () => {
    await C.guarded('s', 'c1', pendingWith('K1'), META);
    let open!: (v: { outcome: 'pending'; idem: string }) => void;
    const going = C.guarded('s', 'c2', () => new Promise<{ outcome: 'pending'; idem: string }>((r) => { open = r; }), META);
    await settle();
    expect(C.isBusy('s', 'c2')).toBe(true);
    neverLandsNoVerdict();
    expect(await forgetShown()).toBe('unknown');
    setChangeStoreAdapter(null);
    expect(C.isPending('s', 'c1')).toBe(false);
    expect(C.isBusy('s', 'c2')).toBe(true);
    open({ outcome: 'pending', idem: 'K2' });
    expect((await going).outcome).toBe('pending');
    expect(C.isPending('s', 'c2')).toBe(true);
  });
});

describe('unknown drops this tab\'s attempt holds too; admission stays with storage', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  afterEach(() => { setChangeStoreAdapter(null); });
  it('memory empty, the same lock refused while storage holds it, admitted once a clean read proves it gone', async () => {
    const first = await holdAttempt('case-e2:att', { by: 'case-e2:att', realm: R1 });
    expect(first.ok).toBe(true);
    // Answered, so only the hold remains (a request still out keeps its record).
    if (first.ok) first.hold.sent();
    await settle();
    // The attempts side drops exactly the attempt holds the warning showed.
    const shownAtt = heldAttempts().map((h) => ({ id: h.id, token: h.id }));
    expect(shownAtt).toHaveLength(1);
    neverLandsNoVerdict();
    expect(await C.forgetAccountChanges(String(snapshot().account), [...C.changeHoldRefs(), ...shownAtt], { holdsIn: () => [], drop: dropAttemptIds })).toBe('unknown');
    // While storage cannot be read, the holds are the ones this tab knows: none any more.
    setChangeStoreAdapter({ read: () => { throw new Error('unreadable'); }, write: () => false });
    expect(heldAttempts()).toEqual([]);
    setChangeStoreAdapter(null);
    expect(heldAttempts()).toHaveLength(1); // storage still holds it: shown again
    expect(await holdAttempt('case-e2:att', { by: 'case-e2:att', realm: R1 })).toMatchObject({ ok: false, code: 'HELD' });
    const acct = String(snapshot().account);
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(raw().filter((r) => !r.id.startsWith(ATTEMPT_PREFIX + acct))));
    expect((await holdAttempt('case-e2:att', { by: 'case-e2:att', realm: R1 })).ok).toBe(true);
  });
});

// A's send outstanding, the account switched to B, B holding the same
// change; A's answer must not make B's hold this mount's own (a no-argument Dismiss would free it).
describe('a hook records only the hold its own pending answer carried, in the account it was pressed in', () => {
  const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }
  let release!: (status: number) => void;
  beforeEach(() => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch((c) => (c.method === 'POST' ? new Promise((r) => { release = (status) => r({ status, body: status === 200 ? { data: {} } : {} }); }) : { status: 502, body: {} }));
  });
  afterEach(() => { cleanup(); });
  /** B (now shown) holds a pending change of the same id as A's outstanding one, with its own token. */
  /** `sameToken`: B's record even carries A's very token (inc and nonce): only the account check tells them apart. */
  function bHoldsTheSame(aOwn: string, lock: string, sameToken = false): string {
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
  for (const [status, same] of [[502, false], [200, false], [502, true]] as const) {
    const answer = (status === 502 ? 'pending' : 'done') + (same ? ', B holding a record with A\'s very token,' : '');
    it(`query hook: A answers ${answer} while B is shown: the old mount's no-argument Dismiss frees nothing of B's`, async () => {
      const route = defineRoute({ method: 'POST', path: '/case-e2/q' + status + (same ? 't' : ''), scope: 'agent', body: ['x'] });
      const m = defineMutation<{ x: number }>(route, { input: (v) => ({ body: v }), lock: 'case-e2.q' + status + (same ? 't' : ''), lockKey: (v) => ({ x: v.x }) });
      const { result } = renderHook(() => m.use(), { wrapper: wrap });
      const aOwn = C.changeOwner();
      let going!: Promise<MutationResult<unknown>>;
      await act(async () => { going = result.current.run({ x: 1 }); await flush(); });
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
      await act(async () => { as(OTHER); });
      const bHold = bHoldsTheSame(aOwn, 'case-e2.q' + status + (same ? 't' : ''), same);
      await act(async () => { await release(status); await going; await flush(); });
      await act(async () => { result.current.dismiss(); await microFlush(); });
      await act(async () => { await flush(); });
      expect(C.heldChanges('case-e2.q' + status + (same ? 't' : '')).map((h) => h.hold)).toEqual([bHold]);
    });
    it(`source hook: A answers ${answer} while B is shown: the old mount's no-argument Dismiss frees nothing of B's`, async () => {
      const create = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/case-e2/s' + status + (same ? 't' : ''), scope: 'agent', body: ['name'] });
      const list = defineRoute({ method: 'GET', path: '/case-e2/s' + status + (same ? 't' : ''), scope: 'agent' });
      const src = coreSource('case-e2-src-' + status + (same ? 't' : ''), { reads: { list: { route: list } }, changes: { create: { route: create, lock: 'case-e2.s' + status + (same ? 't' : ''), input: (v: { name: string }) => ({ body: v }), reads: ['list'] } } });
      let last!: SourceMutation<unknown, { name: string }> & { mutateAsync: (v: { name: string }) => Promise<SourceResult<unknown>> };
      function Probe() { last = src.useMutation<unknown, { name: string }>('create') as never; return null; }
      render(<Probe />, { wrapper: wrap });
      const aOwn = C.changeOwner();
      let going!: Promise<SourceResult<unknown>>;
      await act(async () => { going = last.mutateAsync({ name: 'e' }); await flush(); });
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
      await act(async () => { as(OTHER); });
      const bHold = bHoldsTheSame(aOwn, 'case-e2.s' + status + (same ? 't' : ''), same);
      await act(async () => { await release(status); await going; await flush(); });
      let freed = true;
      await act(async () => { freed = await last.dismiss(); await flush(); });
      expect(freed).toBe(false);
      expect(C.heldChanges('case-e2.s' + status + (same ? 't' : '')).map((h) => h.hold)).toEqual([bHold]);
    });
  }
});

// The same account, nothing switched: a pending answer is still recorded (its own token), so the
// mount's own no-argument Dismiss frees it.
describe('control: a pending answer in the same account is the mount\'s own', () => {
  const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  it('query hook: run pending, dismiss() frees it', async () => {
    const route = defineRoute({ method: 'POST', path: '/case-e2/own', scope: 'agent', body: ['x'] });
    const m = defineMutation<{ x: number }>(route, { input: (v) => ({ body: v }), lock: 'case-e2.own', lockKey: (v) => ({ x: v.x }) });
    const { result } = renderHook(() => m.use(), { wrapper: wrap });
    let r!: MutationResult<unknown>;
    await act(async () => { r = await result.current.run({ x: 1 }); });
    expect(r.outcome).toBe('pending');
    await act(async () => { result.current.dismiss(); await microFlush(); });
    expect(await m.isPending({ x: 1 })).toBe(false);
    expect(readChanges()).toEqual([]);
  });
});
