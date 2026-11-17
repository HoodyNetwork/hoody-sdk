// A computer's lifecycle hold survives a second runtime and follows the physical computer
// across realm views.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import * as C from './changes';
import { bump, setIdentity, setRealm, snapshot } from './ctx';
import { CHANGE_STORE_KEY, nextVersion, readChanges, readChangesState, writeChanges, type StoredChange } from './change-store';
import { useLockedChange } from './locked';
import { api } from './api';
import { capture } from './ctx';
import { computerLifecycle, computerLifecycleRoute } from './power';
import { defineMutation, queryClient } from './query';
import { defineRoute } from './routes';
import { boot, calls, onFetch, R1, R2, microFlush } from './test/env';

const reload = (): void => C.reloadChangesForTests();
const posts = (): number => calls.filter((c) => c.method === 'POST').length;
const switchTo = (r: string): void => { setRealm(r); bump('switch'); };

describe('a lifecycle hold reaches a second runtime before the send', () => {
  beforeEach(() => { boot({ realm: R1 }); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  it('runtime A holds Start c1 (unknown outcome); runtime B (fresh registry, same storage) refuses every op on c1', async () => {
    expect((await computerLifecycle.forPage('computers').run({ id: 'c1', op: 'start' })).outcome).toBe('pending');
    expect(posts()).toBe(1);
    reload();
    expect(C.heldChanges('computer.lifecycle', { realm: R1 })).toEqual([expect.objectContaining({ identity: { computer: 'c1', op: 'start' } })]);
    const again = await computerLifecycle.forPage('computers').run({ id: 'c1', op: 'start' });
    expect(again.outcome).toBe('not_sent');
    const board = await computerLifecycle.forPage('board').run({ id: 'c1', op: 'stop' });
    expect(board.outcome).toBe('not_sent');
    expect(posts()).toBe(1);
  });
});

describe('lifecycle exclusion follows the computer across realm views', () => {
  beforeEach(() => { boot({ realm: 'all' }); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  it('held from All realms: a specific realm view shows it and refuses a second Start', async () => {
    expect((await computerLifecycle.forPage('computers').run({ id: 'c1', op: 'start' })).outcome).toBe('pending');
    switchTo(R2);
    expect(C.heldChanges('computer.lifecycle', { realm: R2 })).toEqual([expect.objectContaining({ identity: { computer: 'c1', op: 'start' } })]);
    expect((await computerLifecycle.forPage('computers').run({ id: 'c1', op: 'start' })).outcome).toBe('not_sent');
    expect(posts()).toBe(1);
  });
  it('held from realm R1: All realms and realm R2 both refuse, and a reload keeps it', async () => {
    switchTo(R1);
    expect((await computerLifecycle.forPage('computers').run({ id: 'c1', op: 'start' })).outcome).toBe('pending');
    switchTo('all');
    expect((await computerLifecycle.forPage('board').run({ id: 'c1', op: 'start' })).outcome).toBe('not_sent');
    switchTo(R2);
    reload();
    expect(C.heldChanges('computer.lifecycle', { realm: R2 })).toHaveLength(1);
    expect((await computerLifecycle.forPage('computers').run({ id: 'c1', op: 'resume' })).outcome).toBe('not_sent');
    expect(posts()).toBe(1);
    // Another computer is its own lock.
    expect((await computerLifecycle.forPage('computers').run({ id: 'c2', op: 'start' })).outcome).toBe('pending');
    expect(posts()).toBe(2);
  });
});

// A hold stored by an older runtime names its sender by load order, without its page.
function storeLegacySender(by: string): void {
  const list = JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Array<{ meta?: { by?: string; page?: string } }>;
  for (const r of list) if (r.meta) { r.meta.by = by; delete r.meta.page; }
  localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list));
  reload();
}

describe('a hold stored with an older sender (q:<route>#<n>, no page)', () => {
  beforeEach(() => { boot({ realm: R1 }); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  const createRoute = defineRoute({ method: 'POST', path: '/case-a/keys', scope: 'realm', body: ['name'] });
  const createKey = defineMutation<{ name: string }>(createRoute, { input: (v) => ({ body: { name: v.name } }), lock: 'case-a.keys.create', lockKey: (v) => ({ name: v.name }), page: 'keys' });
  it('keys: adopted as the page that declares it; that page checks or dismisses it, another page cannot', async () => {
    expect((await createKey.run({ name: 'a' })).outcome).toBe('pending');
    storeLegacySender('q:' + createRoute.id + '#4');
    const [h] = C.heldChanges('case-a.keys.create');
    expect(createKey.heldBy(h!)).toBe('self');
    expect((await createKey.run({ name: 'a' })).error?.code).toBe('READ_BACK_FIRST');
    expect((await createKey.forPage('board').run({ name: 'a' })).error?.code).toBe('HELD_BY_OTHER');
    expect(await createKey.forPage('board').discard({ name: 'a' }, h!.hold!)).toBe(false);
    expect(await createKey.isPending({ name: 'a' })).toBe(true);
    expect(await createKey.discard({ name: 'a' }, h!.hold!)).toBe(true);
    expect(await createKey.isPending({ name: 'a' })).toBe(false);
    expect(posts()).toBe(1);
  });
  it('computers Start (a shared lock no page owns): read-only everywhere, never proven, freed by a warned Dismiss from a page declaring the lock', async () => {
    expect((await computerLifecycle.forPage('computers').run({ id: 'c1', op: 'start' })).outcome).toBe('pending');
    storeLegacySender('q:' + computerLifecycleRoute.id + '#1');
    const [h] = C.heldChanges('computer.lifecycle', { realm: R1 });
    expect(h!.by).toBe(undefined);
    expect(computerLifecycle.forPage('computers').heldBy(h!)).toBe(undefined);
    const again = await computerLifecycle.forPage('computers').run({ id: 'c1', op: 'start' });
    expect(again.error?.code).toBe('READ_BACK_FIRST');
    expect(await computerLifecycle.forPage('board').heldByOther({ id: 'c1', op: 'start' })).toBe(undefined);
    // A discard (a proof) never frees a hold recording no sender; only the warned Dismiss does.
    expect(await computerLifecycle.forPage('board').discard({ id: 'c1', op: 'start' }, h!.hold!)).toBe(false);
    expect(await computerLifecycle.forPage('board').dismiss({ id: 'c1', op: 'start' }, h!.hold!)).toBe(true);
    expect(await computerLifecycle.isPending({ id: 'c1', op: 'start' })).toBe(false);
    expect(posts()).toBe(1);
  });
});

describe('case-a: admission sizes the hold as it will be stored once it went pending', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  it('every size near the bound: refused TOO_LARGE before the send, or sent and still stored (after a reload) once pending with its key', async () => {
    const META = { base: 'lock:case-a.size', target: null, realm: R1, by: 'q:case-a@case-a.size' };
    for (let n = 7800; n <= 8192; n += 8) {
      let sent = false;
      const r = await C.guarded('s', 'd' + n, async () => { sent = true; return { outcome: 'pending' as const, idem: 'K'.repeat(250) }; }, { ...META, identity: { t: 'x'.repeat(n) } });
      if (r.outcome === 'not_sent') { expect(r).toEqual({ outcome: 'not_sent', code: 'TOO_LARGE' }); expect(sent).toBe(false); continue; }
      expect(r.outcome).toBe('pending');
      expect(readChanges()!.some((x) => x.id.endsWith('s\u0000d' + n) && x.pending)).toBe(true);
    }
    reload();
    for (let n = 7800; n <= 8192; n += 8) if (C.senderOfLock('s', 'd' + n) !== undefined) expect(C.isPending('s', 'd' + n)).toBe(true);
  });
});

const announce = (): void => { window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY })); };
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const META2 = { base: 'lock:case-a.raw', target: null, realm: R1, by: 'q:case-a@case-a.raw' };
const pendingWith = (idem: string) => async (replay: string | undefined) => ({ outcome: 'pending' as const, idem: replay ?? idem });

describe('a proof or a Dismiss names the send it concerns (hold)', () => {
  beforeEach(() => { boot({ realm: R1 }); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  const route = defineRoute({ method: 'POST', path: '/case-a/press', scope: 'realm', body: ['n'] });
  const press = defineMutation<{ n: number }>(route, { input: (v) => ({ body: { n: v.n } }), lock: 'case-a.press', lockKey: (v) => ({ n: v.n }), page: 'programs' });
  it('complete/discard with the first send\'s hold leave a later send held; with the later hold they free it', async () => {
    expect((await press.run({ n: 1 })).outcome).toBe('pending');
    const first = (await press.holdOf({ n: 1 }))!;
    expect(first).toBeTruthy();
    expect(C.heldChanges('case-a.press')[0]!.hold).toBe(first);
    // The person dismisses it, then the proof of the first send is still being read; the change is sent again.
    await press.discard({ n: 1 }, first);
    expect((await press.run({ n: 1 })).outcome).toBe('pending');
    const second = (await press.holdOf({ n: 1 }))!;
    expect(second).not.toBe(first);
    await press.complete({ n: 1 }, first);
    await press.discard({ n: 1 }, first);
    await press.dismiss({ n: 1 }, first);
    expect(await press.isPending({ n: 1 })).toBe(true);
    await press.complete({ n: 1 }, second);
    expect(await press.isPending({ n: 1 })).toBe(false);
  });
  it('a locked change\'s await discard() frees only a send this mount made (another mount\'s later send stays)', async () => {
    const rename = defineRoute<unknown, { name: string }>({ method: 'PATCH', path: '/computers/:id', scope: 'realm', body: ['name'] });
    const run = (v: { code: string }) => api(rename, { params: { id: 'c1' }, body: { name: v.code }, ctx: capture() });
    const a = renderHook(() => useLockedChange<{ code: string }, unknown>(run, [], 'case-a.lk', { lock: 'case-a.lk', page: 'home' }), { wrapper: wrap });
    const b = renderHook(() => useLockedChange<{ code: string }, unknown>(run, [], 'case-a.lk', { lock: 'case-a.lk', page: 'home' }), { wrapper: wrap });
    await act(async () => { expect((await a.result.current.run({ code: 'A' })).outcome).toBe('pending'); });
    await act(async () => { b.result.current.discard(); await microFlush(); });
    expect(C.heldChanges('case-a.lk')).toHaveLength(1);
    await act(async () => { a.result.current.discard(); await microFlush(); });
    expect(C.heldChanges('case-a.lk')).toHaveLength(0);
  });
  it('a locked change\'s warned Dismiss frees a hold that records no sender', async () => {
    const rename = defineRoute<unknown, { name: string }>({ method: 'PATCH', path: '/computers/:id', scope: 'realm', body: ['name'] });
    const run = (v: { code: string }) => api(rename, { params: { id: 'c1' }, body: { name: v.code }, ctx: capture() });
    const a = renderHook(() => useLockedChange<{ code: string }, unknown>(run, [], 'case-a.lk2', { lock: 'case-a.lk2', page: 'home' }), { wrapper: wrap });
    await act(async () => { expect((await a.result.current.run({ code: 'A' })).outcome).toBe('pending'); });
    a.unmount();
    const list = JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Array<{ meta?: { by?: string } }>;
    for (const r of list) if (r.meta) delete r.meta.by;
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list));
    act(() => { reload(); });
    const c = renderHook(() => useLockedChange<{ code: string }, unknown>(run, [], 'case-a.lk2', { lock: 'case-a.lk2', page: 'computers' }), { wrapper: wrap });
    expect(C.heldChanges('case-a.lk2')).toHaveLength(1);
    await act(async () => { c.result.current.dismiss(); await microFlush(); });
    expect(C.heldChanges('case-a.lk2')).toHaveLength(0);
  });
});

describe('adopting another incarnation moves the send token', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  it('a proof that began before another tab\'s later send (released keeping its key) never drops that key', async () => {
    expect((await C.guarded('s', 'd', pendingWith('K1'), META2)).outcome).toBe('pending');
    const mark = C.pendingMark(), h0 = C.holdOfLock('s', 'd')!;
    // Another tab: the first hold resolved, the change sent again and released keeping its key K2.
    const list = readChanges()!;
    const mine = list.find((x) => x.id.endsWith('s\u0000d'))!;
    const other: StoredChange = { ...mine, pending: false, key: 'K2', inc: 'another-incarnation', t: nextVersion(list) };
    expect(writeChanges([...list.filter((x) => x !== mine), other])).toBe(true);
    announce();
    expect(await C.complete('s', 'd', h0,{ upTo: mark })).toBe(false);
    // The upTo fence alone (the current token) holds too.
    expect(await C.complete('s', 'd', C.holdOfLock('s', 'd')!,{ upTo: mark })).toBe(false);
    expect(readChanges()!.find((x) => x.id === mine.id)?.key).toBe('K2');
  });
});

describe('this tab\'s own send, still out across an account round trip, stays held', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  it('the stored stamp of this tab with no send running here reads as may-have-gone-through: a second press sends nothing', async () => {
    const me = snapshot().account;
    let release!: () => void;
    const out = C.guarded('s', 'd', () => new Promise<{ outcome: 'pending'; idem: string }>((res) => { release = () => res({ outcome: 'pending', idem: 'K' }); }), META2);
    await Promise.resolve();
    setIdentity({ id: 'someone-else', banned: false }); bump('account');
    setIdentity({ id: String(me), banned: false }); bump('account');
    const again = vi.fn(pendingWith('K'));
    const r = await C.guarded('s', 'd', again, META2);
    expect(r.outcome).toBe('not_sent');
    expect(again).not.toHaveBeenCalled();
    await release();
    await out;
  });
});

describe('an empty stored value is not an empty store', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  it('\'\' reads as not clean: known holds stay, and a new press is refused STORE_UNAVAILABLE', async () => {
    expect((await C.guarded('s', 'd', pendingWith('K'), META2)).outcome).toBe('pending');
    localStorage.setItem(CHANGE_STORE_KEY, '');
    expect(readChangesState().state).not.toBe('clean');
    announce();
    expect(C.isPending('s', 'd')).toBe(true);
    const send = vi.fn(pendingWith('K2'));
    expect(await C.guarded('s', 'e', send, META2)).toEqual({ outcome: 'not_sent', code: 'STORE_UNAVAILABLE' });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('the cap counts kept keys as holds and never evicts an older pending one', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  it('63 released changes keeping their keys plus one older pending hold: the next hold is refused HOLDS_FULL, all 64 survive a reload', async () => {
    expect((await C.guarded('s', 'old', pendingWith('KOLD'), META2)).outcome).toBe('pending');
    for (let i = 0; i < 63; i++) {
      expect((await C.guarded('s', 'k' + i, pendingWith('K' + i), META2)).outcome).toBe('pending');
      await C.release('s', 'k' + i, C.holdOfLock('s', 'k' + i)!);
    }
    const send = vi.fn(pendingWith('KNEW'));
    expect(await C.guarded('s', 'new', send, META2)).toEqual({ outcome: 'not_sent', code: 'HOLDS_FULL' });
    expect(send).not.toHaveBeenCalled();
    reload();
    expect(C.isPending('s', 'old')).toBe(true);
    const stored = readChanges()!;
    expect(stored).toHaveLength(64);
    for (let i = 0; i < 63; i++) expect(stored.find((x) => x.id.endsWith('s\u0000k' + i))?.key).toBe('K' + i);
  });
});

describe('case-a: the unresolved holds a sign-out would stop tracking (the shell\'s warned confirm)', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  it('counts this account\'s pending and in-flight changes, not released ones', async () => {
    expect(C.unresolvedChanges()).toBe(0);
    await C.guarded('s', 'a', pendingWith('K1'), META2);
    await C.guarded('s', 'b', pendingWith('K2'), META2);
    await C.release('s', 'b', C.holdOfLock('s', 'b')!);
    await new Promise((r) => setTimeout(r, 0)); // the count reads storage; the release's write lands first
    expect(C.unresolvedChanges()).toBe(1);
  });
});

describe('case-b: settle/dismiss act on the one hold the page showed', () => {
  beforeEach(() => { boot({ realm: R1 }); onFetch(() => ({ status: 502, body: {} })); });
  afterEach(() => { cleanup(); });
  it('the run names its hold; HeldChange carries the same token and seq', async () => {
    const res = await computerLifecycle.forPage('computers').run({ id: 'c1', op: 'start' });
    expect(res.outcome).toBe('pending');
    const [h] = C.heldChanges('computer.lifecycle', { realm: R1 });
    expect(res.hold).toBe(h!.hold);
    expect(typeof h!.seq).toBe('number');
  });
  it('(a) a send that went pending between the press and the release stays held: another page\'s, and a later send of this page', async () => {
    const page = computerLifecycle.forPage('computers');
    const first = (await page.run({ id: 'c1', op: 'start' })).hold!;
    const going = page.dismiss({ id: 'c1', op: 'start' }, first);
    // Before the Dismiss's digest resolves: the first hold is freed elsewhere and the Board's send goes pending.
    await act(async () => { const f = C.heldInstance('lock:computer.lifecycle', first)!; await C.release(f.scope, f.digest, first); });
    expect((await computerLifecycle.forPage('board').run({ id: 'c1', op: 'start' })).outcome).toBe('pending');
    await going;
    expect(await computerLifecycle.isPending({ id: 'c1', op: 'start' })).toBe(true);
    // The Board's hold dismissed with its own token; this page sends again; the stale token frees nothing.
    const [b] = C.heldChanges('computer.lifecycle');
    await computerLifecycle.forPage('board').dismiss({ id: 'c1', op: 'start' }, b!.hold!);
    expect((await page.run({ id: 'c1', op: 'start' })).outcome).toBe('pending');
    await page.dismiss({ id: 'c1', op: 'start' }, first);
    expect(await computerLifecycle.isPending({ id: 'c1', op: 'start' })).toBe(true);
    // Another page's token, or a token of another computer's hold, frees nothing either.
    const board = (await computerLifecycle.forPage('board').run({ id: 'c2', op: 'start' })).hold!;
    await page.dismiss({ id: 'c2', op: 'start' }, board);
    await page.complete({ id: 'c2', op: 'start' }, board);
    const [mine] = C.heldChanges('computer.lifecycle').filter((h) => (h.identity as { computer: string }).computer === 'c1');
    await computerLifecycle.forPage('board').dismiss({ id: 'c1', op: 'start' }, board);
    await page.dismiss({ id: 'c2', op: 'start' }, mine!.hold!);
    expect(C.heldChanges('computer.lifecycle')).toHaveLength(2);
  });
  it('(b) a realm switch to All while the digest is awaited never widens a Dismiss to another realm\'s hold', async () => {
    const route = defineRoute({ method: 'POST', path: '/case-b/realm', scope: 'realm', body: ['n'] });
    const m = defineMutation<{ n: number }>(route, { input: (v) => ({ body: { n: v.n } }), lock: 'case-b.realm', lockKey: (v) => ({ n: v.n }), page: 'p' });
    expect((await m.run({ n: 1 })).outcome).toBe('pending');
    switchTo(R2);
    const r2 = await m.run({ n: 1 });
    expect(r2.outcome).toBe('pending');
    switchTo(R1);
    expect(C.heldChanges('case-b.realm')).toHaveLength(2);
    // Without a hold (case-c: hold is required): nothing is freed in any realm view.
    const going = (m.dismiss as (v: { n: number }) => Promise<boolean>)({ n: 1 });
    switchTo('all');
    expect(await going).toBe(false);
    expect(C.heldChanges('case-b.realm')).toHaveLength(2);
    switchTo('all');
    expect(await (m.dismiss as (v: { n: number }) => Promise<boolean>)({ n: 1 })).toBe(false);
    expect(C.heldChanges('case-b.realm')).toHaveLength(2);
    // With a hold, a realm switch while it is awaited refuses it (the context is re-checked before the commit).
    const going2 = m.dismiss({ n: 1 }, r2.hold!);
    switchTo(R1);
    expect(await going2).toBe(false);
    expect(C.heldChanges('case-b.realm')).toHaveLength(2);
    // At rest: only that one, whatever realm is shown.
    expect(await m.dismiss({ n: 1 }, r2.hold!)).toBe(true);
    expect(C.heldChanges('case-b.realm').map((h) => h.realm)).toEqual([R1]);
  });
});

describe('case-b: sign-out forgets only the account signing out (after the shell\'s warned confirm)', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  it('removes this account\'s changes and attempts from storage and memory; another account\'s records stay', async () => {
    const me = snapshot().account;
    await C.guarded('s', 'a', pendingWith('K1'), META2);
    setIdentity({ id: 'someone-else', banned: false }); bump('account');
    await C.guarded('s', 'b', pendingWith('K2'), META2);
    setIdentity({ id: String(me), banned: false }); bump('account');
    const list = readChanges()!;
    const attempt: StoredChange = { id: 'attempt\u0002' + String(me) + '\u0001lock\u0000r', pending: true, key: null, t: nextVersion(list) };
    expect(writeChanges([...list, attempt])).toBe(true);
    expect(C.unresolvedChanges()).toBe(1);
    const attemptsOf = (l: readonly StoredChange[], a: string) => l.filter((r) => r.id.startsWith('attempt\u0002' + a + '\u0001')).map((r) => ({ id: r.id, token: '' }));
    expect(await C.forgetAccountChanges(String(me), [...C.changeHoldRefs(), { id: attempt.id, token: '' }], { holdsIn: attemptsOf, drop: () => {} })).toBe('done');
    expect(C.unresolvedChanges()).toBe(0);
    const left = readChanges()!;
    expect(left).toHaveLength(1);
    expect(left[0]!.id.startsWith('someone-else\u0001')).toBe(true);
  });
});
